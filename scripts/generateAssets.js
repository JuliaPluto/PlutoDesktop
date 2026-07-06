import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import process from 'process';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import unzip from 'extract-zip';
import { execSync } from 'child_process';



// Get the project root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const generatedAssetsDir = path.join(projectRoot, 'generated_assets');



// YOU CAN EDIT ME
const JULIA_VERSION_PARTS = [1, 12, 6];
/// ☝️
// Note: must be ≥ 1.11 — the bundled depot relies on relocatable precompile
// caches (content hashes + @depot tags), which older Julia does not have.
// After changing this, regenerate assets/env_for_julia/Manifest.toml with the
// new Julia version (validatePlutoVersionConsistency will remind you).

const JULIA_VERSION = JULIA_VERSION_PARTS.join('.');
const JULIA_VERSION_MINOR = JULIA_VERSION_PARTS.slice(0, 2).join('.');

// Detect platform
const platform = process.platform;
const resolvedArch = process.arch === 'arm64' ? 'aarch64' : 'x64';

let JULIA_URL, ZIP_NAME, JULIA_DIR_NAME, JULIA_EXECUTABLE;

if (platform === 'win32') {
  ZIP_NAME = `julia-${JULIA_VERSION}-win64.zip`;
  JULIA_URL = `https://julialang-s3.julialang.org/bin/winnt/x64/${JULIA_VERSION_MINOR}/${ZIP_NAME}`;
  JULIA_DIR_NAME = `julia-${JULIA_VERSION}`;
  JULIA_EXECUTABLE = 'julia.exe';
} else if (platform === 'darwin') {
  // macOS
  const macArch = resolvedArch === 'aarch64' ? 'aarch64' : 'x64';
  ZIP_NAME = `julia-${JULIA_VERSION}-mac${resolvedArch === 'aarch64' ? 'aarch64' : '64'}.dmg`;
  JULIA_URL = `https://julialang-s3.julialang.org/bin/mac/${macArch}/${JULIA_VERSION_MINOR}/${ZIP_NAME}`;
  JULIA_DIR_NAME = `julia-${JULIA_VERSION}`;
  JULIA_EXECUTABLE = 'julia';
} else if (platform === 'linux') {
  const linuxArch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
  const linuxArchDir = linuxArch === 'aarch64' ? 'aarch64' : 'x64';
  ZIP_NAME = `julia-${JULIA_VERSION}-linux-${linuxArch}.tar.gz`;
  JULIA_URL = `https://julialang-s3.julialang.org/bin/linux/${linuxArchDir}/${JULIA_VERSION_MINOR}/${ZIP_NAME}`;
  JULIA_DIR_NAME = `julia-${JULIA_VERSION}`;
  JULIA_EXECUTABLE = 'julia';
} else {
  throw new Error(`Unsupported platform: ${platform}`);
}

// Sysimage approach (see SYSIMAGE_INVESTIGATION.md): instead of shipping a full
// Julia depot (package sources + relocation-fragile precompile caches), we ship
// Pluto compiled into a sysimage. What ends up in generated_assets/:
//   - pluto_sysimage.<dll|so|dylib> : Pluto + all deps compiled in. Launched
//     with `julia --sysimage=...`; the Pluto server needs no precompilation and
//     works offline. Notebook workers keep using the DEFAULT sysimage.
//   - pluto_source/Pluto/           : Pluto's own package source. Needed on disk
//     so PLUTO_LOCATION (the file:// frontend) resolves; also the source the
//     RelocatableFolders-embedded frontend/runner correspond to.
//   - pluto_server_depot/artifacts/ : the JLL binary artifacts Pluto's deps
//     resolve at runtime (e.g. MbedTLS_jll) whose versions differ from the ones
//     bundled with Julia. Everything else is in the sysimage.
const SYSIMAGE_BASENAME =
  platform === 'win32'
    ? 'pluto_sysimage.dll'
    : platform === 'darwin'
      ? 'pluto_sysimage.dylib'
      : 'pluto_sysimage.so';
const SYSIMAGE_LOCATION = path.join(generatedAssetsDir, SYSIMAGE_BASENAME);
const PLUTO_SOURCE_LOCATION = path.join(generatedAssetsDir, 'pluto_source');
const SERVER_DEPOT_LOCATION = path.join(generatedAssetsDir, 'pluto_server_depot');
// Temporary build-only directories, removed after the sysimage is built. Keeping
// PackageCompiler (and the ~700 MB mingw-w64 toolchain it downloads on Windows)
// in a separate depot from the Pluto env means the shipped artifacts stay clean.
const BUILD_DEPOT_LOCATION = path.join(generatedAssetsDir, 'build_depot');
const BUILD_TOOLS_DEPOT_LOCATION = path.join(generatedAssetsDir, 'build_tools_depot');
const BUILD_TOOLS_ENV_LOCATION = path.join(generatedAssetsDir, 'build_tools_env');

// PackageCompiler.jl — pinned loosely; only used at build time.
const PACKAGE_COMPILER_UUID = '9b87118b-4619-50d2-8e1e-99f35a4d4d9d';

// The app version is `<pluto-version>-buildNNN` (see MAINTENANCE.md), and the
// Julia environment must pin exactly that Pluto version. All three files are
// kept in sync by `npm run set-pluto-version`; fail the build if they diverged.
const validatePlutoVersionConsistency = () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'),
  );
  const versionMatch = pkg.version.match(/^(\d+\.\d+\.\d+)-build\d{3,}$/);
  if (!versionMatch) {
    throw new Error(
      `package.json version "${pkg.version}" does not have the required <pluto-version>-buildNNN format. Fix it with: npm run set-pluto-version -- <pluto-version>`,
    );
  }
  const plutoVersion = versionMatch[1];

  const envDir = path.join(projectRoot, 'assets', 'env_for_julia');
  const projectToml = fs.readFileSync(path.join(envDir, 'Project.toml'), 'utf8');
  const compatMatch = projectToml.match(/^Pluto\s*=\s*"=([^"]*)"\s*$/m);
  if (!compatMatch || compatMatch[1] !== plutoVersion) {
    throw new Error(
      `assets/env_for_julia/Project.toml pins Pluto to "${compatMatch?.[1] ?? '(no exact pin found)'}" but package.json version ${pkg.version} expects ${plutoVersion}. Fix it with: npm run set-pluto-version -- ${plutoVersion}`,
    );
  }

  const manifest = fs.readFileSync(path.join(envDir, 'Manifest.toml'), 'utf8');
  // Grab the [[deps.Pluto]] section (up to the next [[...]] section) and read
  // its `version` line. Note that the section itself contains `[` characters.
  const sectionMatch = manifest.match(
    /^\[\[deps\.Pluto\]\]\r?\n([\s\S]*?)(?=^\[\[|(?![\s\S]))/m,
  );
  const manifestVersion = sectionMatch?.[1].match(/^version = "([^"]*)"\s*$/m)?.[1];
  if (manifestVersion !== plutoVersion) {
    throw new Error(
      `assets/env_for_julia/Manifest.toml resolves Pluto ${manifestVersion ?? '(not found)'} but package.json version ${pkg.version} expects ${plutoVersion}. Fix it with: npm run set-pluto-version -- ${plutoVersion}`,
    );
  }

  // The precompile caches prepared for the bundled depot are only valid for
  // the exact Julia version they were built with, so the manifest must be
  // resolved with the Julia we ship.
  const manifestJuliaVersion = manifest.match(/^julia_version = "([^"]*)"\s*$/m)?.[1];
  if (manifestJuliaVersion !== JULIA_VERSION) {
    throw new Error(
      `assets/env_for_julia/Manifest.toml was resolved with Julia ${manifestJuliaVersion ?? '(unknown)'} but the bundled Julia is ${JULIA_VERSION}. Regenerate it with Julia ${JULIA_VERSION}: julia --project=assets/env_for_julia -e "import Pkg; Pkg.resolve()"`,
    );
  }

  console.log(`Verified: bundling Pluto v${plutoVersion} (app version ${pkg.version}, Julia ${JULIA_VERSION})`);
};

const downloadJulia = async () => {

  console.log(`\tDownloading Julia ${JULIA_VERSION} for ${platform}`);
  const response = await fetch(JULIA_URL);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const filePath = path.join(generatedAssetsDir, ZIP_NAME);
  const writeStream = fs.createWriteStream(filePath);
  const readStream = Readable.fromWeb(response.body);

  await pipeline(readStream, writeStream);
  console.log(`\tDownloaded Julia ${JULIA_VERSION} for ${platform}`);
};

// Run a Julia process, streaming its output, and resolve/reject on exit code.
const runJulia = (julia_path, args, env) =>
  new Promise((resolve, reject) => {
    const res = spawn(julia_path, args, {
      env: { ...process.env, ...env },
    });
    res.stdout.on('data', (data) => process.stdout.write(data?.toString?.()));
    res.stderr.on('data', (data) => process.stderr.write(data?.toString?.()));
    res.on('error', reject);
    res.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Julia exited with code ${code}: ${args.join(' ')}`));
    });
  });

// Recreate the extended-attribute / permission fixup the old depot preparation
// did, so shipped files don't break macOS code signing. No-op off macOS.
const fixupMacPermissions = (dir) => {
  if (platform !== 'darwin' || !fs.existsSync(dir)) return;
  // (🤖🤖 This block is AI written and not tested on macOS.)
  try {
    execSync(`find "${dir}" -type f -exec chmod u+w {} +`, { stdio: 'ignore' });
    execSync(`find "${dir}" -type d -exec chmod u+w {} +`, { stdio: 'ignore' });
    execSync(`xattr -rc "${dir}" 2>/dev/null || true`, { stdio: 'ignore' });
    execSync(`find "${dir}" -type f -exec chmod 644 {} +`, { stdio: 'ignore' });
    execSync(`find "${dir}" -type d -exec chmod 755 {} +`, { stdio: 'ignore' });
  } catch (error) {
    console.warn('Warning: Could not fix file permissions:', error.message);
  }
};

// Build the Pluto sysimage and extract the small on-disk pieces the app still
// needs (Pluto source for PLUTO_LOCATION, and the JLL artifacts). See the block
// comment near SYSIMAGE_LOCATION and SYSIMAGE_INVESTIGATION.md.
const buildPlutoSysimage = async ({ julia_path }) => {
  if (!fs.existsSync(julia_path)) {
    throw new Error(`Julia executable not found at: ${julia_path}`);
  }

  const plutoSrcDir = path.join(PLUTO_SOURCE_LOCATION, 'Pluto');
  const artifactsDir = path.join(SERVER_DEPOT_LOCATION, 'artifacts');
  if (
    fs.existsSync(SYSIMAGE_LOCATION) &&
    fs.existsSync(plutoSrcDir) &&
    fs.existsSync(artifactsDir)
  ) {
    console.info('Sysimage build already done', SYSIMAGE_LOCATION);
    return;
  }

  // Start from a clean slate for every output and temp dir.
  for (const p of [
    SYSIMAGE_LOCATION,
    PLUTO_SOURCE_LOCATION,
    SERVER_DEPOT_LOCATION,
    BUILD_DEPOT_LOCATION,
    BUILD_TOOLS_DEPOT_LOCATION,
    BUILD_TOOLS_ENV_LOCATION,
  ]) {
    fs.rmSync(p, { force: true, recursive: true });
  }

  const envProject = path.join(projectRoot, 'assets', 'env_for_julia');
  const juliaRootDir = path.join(generatedAssetsDir, JULIA_DIR_NAME);
  // The depots inside the Julia install must be stacked so instantiate/build
  // reuse the stdlib caches and JLL artifacts that ship with Julia (see the
  // depot-stacking rationale in git history), and so JLLs that ARE bundled with
  // Julia don't get their artifacts re-downloaded into our shipped depot.
  const shareDepots = [
    path.join(juliaRootDir, 'local', 'share', 'julia'),
    path.join(juliaRootDir, 'share', 'julia'),
  ];
  const buildNotebooksDir = path.join(os.tmpdir(), 'pluto_desktop_build_notebooks');

  // 1. Instantiate env_for_julia into the build depot. This downloads Pluto, its
  //    dependencies, and their (non-bundled) artifacts. Pluto's precompile
  //    workload runs here; keep its sample notebook out of the tree.
  console.log('buildPlutoSysimage: instantiating env_for_julia...');
  await runJulia(
    julia_path,
    [`--project=${envProject}`, '-e', 'import Pkg; Pkg.instantiate()'],
    {
      JULIA_DEPOT_PATH: [BUILD_DEPOT_LOCATION, ...shareDepots].join(path.delimiter),
      JULIA_PLUTO_NEW_NOTEBOOKS_DIR: buildNotebooksDir,
    },
  );

  // 2. Install PackageCompiler into a SEPARATE tools depot, so it and the mingw
  //    toolchain it downloads never end up among the shipped artifacts.
  console.log('buildPlutoSysimage: installing PackageCompiler...');
  fs.mkdirSync(BUILD_TOOLS_ENV_LOCATION, { recursive: true });
  fs.writeFileSync(
    path.join(BUILD_TOOLS_ENV_LOCATION, 'Project.toml'),
    `[deps]\nPackageCompiler = "${PACKAGE_COMPILER_UUID}"\n`,
  );
  await runJulia(
    julia_path,
    [`--project=${BUILD_TOOLS_ENV_LOCATION}`, '-e', 'import Pkg; Pkg.instantiate()'],
    {
      JULIA_DEPOT_PATH: [BUILD_TOOLS_DEPOT_LOCATION, ...shareDepots].join(
        path.delimiter,
      ),
    },
  );

  // 3. Build the sysimage. The driver runs with the tools project (for
  //    PackageCompiler); it compiles the Pluto env, resolved from the build
  //    depot. cpu_target is left at PackageCompiler's default, which is already
  //    a portable multi-arch target.
  console.log('buildPlutoSysimage: creating sysimage (this takes a while)...');
  const buildScript = [
    'using PackageCompiler',
    `create_sysimage(["Pluto"]; sysimage_path=raw"${SYSIMAGE_LOCATION}", project=raw"${envProject}", incremental=true)`,
  ].join('\n');
  await runJulia(
    julia_path,
    [`--project=${BUILD_TOOLS_ENV_LOCATION}`, '-e', buildScript],
    {
      JULIA_DEPOT_PATH: [
        BUILD_TOOLS_DEPOT_LOCATION,
        BUILD_DEPOT_LOCATION,
        ...shareDepots,
      ].join(path.delimiter),
      JULIA_PLUTO_NEW_NOTEBOOKS_DIR: buildNotebooksDir,
    },
  );
  if (!fs.existsSync(SYSIMAGE_LOCATION)) {
    throw new Error(`Sysimage was not produced at ${SYSIMAGE_LOCATION}`);
  }

  // 4. Extract Pluto's own source (frontend/, src/, sample/, …) so PLUTO_LOCATION
  //    resolves at runtime. Drop dev-only trees we don't ship.
  const plutoPackages = path.join(BUILD_DEPOT_LOCATION, 'packages', 'Pluto');
  const plutoHashes = fs.readdirSync(plutoPackages);
  if (plutoHashes.length !== 1) {
    throw new Error(
      `Expected exactly one Pluto package dir in ${plutoPackages}, found: ${plutoHashes.join(', ')}`,
    );
  }
  const plutoBuildSrc = path.join(plutoPackages, plutoHashes[0]);
  const skip = new Set(['test', 'frontend-bundler', '.git']);
  fs.mkdirSync(PLUTO_SOURCE_LOCATION, { recursive: true });
  fs.cpSync(plutoBuildSrc, plutoSrcDir, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(plutoBuildSrc, src);
      const top = rel.split(path.sep)[0];
      return !skip.has(top);
    },
  });
  console.info('Extracted Pluto source to', plutoSrcDir);

  // 5. Ship an artifacts-only depot: the JLL binaries Pluto's deps resolve at
  //    runtime whose versions differ from the ones bundled with Julia.
  fs.mkdirSync(SERVER_DEPOT_LOCATION, { recursive: true });
  const buildArtifacts = path.join(BUILD_DEPOT_LOCATION, 'artifacts');
  if (fs.existsSync(buildArtifacts)) {
    fs.cpSync(buildArtifacts, artifactsDir, { recursive: true });
    console.info('Extracted JLL artifacts to', artifactsDir);
  } else {
    // No non-bundled artifacts were needed; ship an empty artifacts dir so the
    // runtime depot stack entry is valid.
    fs.mkdirSync(artifactsDir, { recursive: true });
  }

  // 6. Remove the (large) build-only depots.
  for (const p of [
    BUILD_DEPOT_LOCATION,
    BUILD_TOOLS_DEPOT_LOCATION,
    BUILD_TOOLS_ENV_LOCATION,
  ]) {
    fs.rmSync(p, { force: true, recursive: true });
  }

  fixupMacPermissions(PLUTO_SOURCE_LOCATION);
  fixupMacPermissions(SERVER_DEPOT_LOCATION);

  console.info('Sysimage build success', SYSIMAGE_LOCATION);
};

/**  (🤖🤖 This function is AI written and not reviewed.) */
const extractJulia = async () => {
  console.log(`\tExtracting: ${ZIP_NAME}`);
  fs.rmSync(path.join(generatedAssetsDir, JULIA_DIR_NAME), {
    force: true,
    recursive: true,
  });

  if (platform === 'win32') {
    // Windows: extract zip
    await unzip(path.join(generatedAssetsDir, ZIP_NAME), { dir: generatedAssetsDir });
  } else if (platform === 'linux') {
    execSync(`tar -xzf "${path.join(generatedAssetsDir, ZIP_NAME)}" -C "${generatedAssetsDir}"`);
  } else if (platform === 'darwin') {
    // macOS: mount DMG and copy contents
    const dmgPath = path.join(generatedAssetsDir, ZIP_NAME);
    const mountPoint = path.join(generatedAssetsDir, 'julia_mount');

    // Create mount point if it doesn't exist
    if (!fs.existsSync(mountPoint)) {
      fs.mkdirSync(mountPoint, { recursive: true });
    }

    // Mount the DMG
    execSync(`hdiutil attach "${dmgPath}" -mountpoint "${mountPoint}" -quiet`);

    try {
      // Find the Julia app bundle in the mounted DMG
      const mountedContents = fs.readdirSync(mountPoint);
      const juliaApp = mountedContents.find((item) =>
        item.startsWith('Julia-'),
      );

      if (!juliaApp) {
        throw new Error('Could not find Julia app in DMG');
      }

      const juliaAppPath = path.join(mountPoint, juliaApp);
      const juliaContentsPath = path.join(
        juliaAppPath,
        'Contents',
        'Resources',
        'julia',
      );
      const targetPath = path.join(generatedAssetsDir, JULIA_DIR_NAME);

      // Copy Julia contents to target directory
      if (fs.existsSync(juliaContentsPath)) {
        // Copy the entire julia directory
        execSync(`cp -R "${juliaContentsPath}" "${targetPath}"`);
      } else {
        throw new Error('Could not find Julia contents in app bundle');
      }
    } finally {
      // Unmount the DMG
      execSync(`hdiutil detach "${mountPoint}" -quiet`);
      if (fs.existsSync(mountPoint)) {
        fs.rmSync(mountPoint, { recursive: true, force: true });
      }
    }
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  fs.rmSync(path.join(generatedAssetsDir, ZIP_NAME), {
    force: true,
  });
  console.log(`\tExtracted!`);
};







/**
 * @type {import("@electron-forge/shared-types").ForgeSimpleHookFn<"generateAssets">}
 */
export default async (config, platform, arch) => {
  console.log('Running generateAssets hook...');
  console.log('Platform:', platform);
  console.log('Arch:', arch);

  validatePlutoVersionConsistency();

  if (!fs.existsSync(generatedAssetsDir))
    fs.mkdirSync(generatedAssetsDir, { recursive: true });

  if (process.env.SKIP_GENERATE_ASSETS) {
    console.log('SKIP_GENERATE_ASSETS is set; skipping Julia download & depot preparation.');
    return;
  }

  const architectureFilePath = path.join(generatedAssetsDir, 'architecture.txt');
  try {
    fs.writeFileSync(architectureFilePath, `${resolvedArch}\n`, 'utf8');
    console.log('Recorded architecture to', architectureFilePath);
  } catch (error) {
    console.warn('Could not write architecture.txt:', error?.message ?? error);
  }
  
  let files = fs.readdirSync(generatedAssetsDir);

  // Clean up after a Julia version change: findJulia() at runtime picks the
  // first julia-* directory it sees, and a sysimage built with another Julia is
  // incompatible.
  const staleJulias = files.filter(
    (s) => /^julia-\d+\.\d+\.\d+$/.test(s) && s !== JULIA_DIR_NAME,
  );
  if (staleJulias.length > 0) {
    for (const dir of staleJulias) {
      console.log(`Removing stale ${dir}...`);
      fs.rmSync(path.join(generatedAssetsDir, dir), {
        recursive: true,
        force: true,
      });
    }
    // The sysimage, its extracted Pluto source, and the artifacts depot were
    // built against the previous Julia; force a rebuild.
    console.log('Removing sysimage build outputs from a previous Julia...');
    for (const p of [
      SYSIMAGE_LOCATION,
      PLUTO_SOURCE_LOCATION,
      SERVER_DEPOT_LOCATION,
    ]) {
      fs.rmSync(p, { recursive: true, force: true });
    }
    files = fs.readdirSync(generatedAssetsDir);
  }

  // Remove the old full depot from the pre-sysimage design if it's lying around.
  const legacyDepot = path.join(generatedAssetsDir, 'julia_depot');
  if (fs.existsSync(legacyDepot)) {
    console.log('Removing legacy julia_depot (superseded by the sysimage)...');
    fs.rmSync(legacyDepot, { recursive: true, force: true });
  }

  if (!files.includes(JULIA_DIR_NAME)) {
    await downloadJulia();
    await extractJulia();
  }

  const juliaPath = path.join(
    generatedAssetsDir,
    JULIA_DIR_NAME,
    'bin',
    JULIA_EXECUTABLE,
  );

  await buildPlutoSysimage({
    julia_path: juliaPath,
  });
};
