import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import process from 'process';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import unzip from 'extract-zip';
import { execSync } from 'child_process';
import { exit } from 'process';



// Get the project root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const generatedAssetsDir = path.join(projectRoot, 'generated_assets');



// YOU CAN EDIT ME
const JULIA_VERSION_PARTS = [1, 10, 10];
/// ☝️

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
} else {
  // Linux
  throw new Error('Linux is not supported');
}

const DEPOT_NAME = `julia_depot`;

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

const precompilePluto = async ({ julia_path }) => {
  // TODO: You need to add PackageCompiler to some environment for this to work.

  const SYSIMAGE_LOCATION = path.join(
    generatedAssetsDir,
    // TODO: auto version number
    'pluto.so',
  );

  // immediately return if the sysimage has already been compiled
  if (fs.existsSync(SYSIMAGE_LOCATION)) {
    return new Promise((resolve) => resolve());
  }

  const PRECOMPILE_SCRIPT_LOCATION = path.join(generatedAssetsDir, 'precompile.jl');
  const PRECOMPILE_EXECUTION_LOCATION = path.join(
    generatedAssetsDir,
    'precompile_execution.jl',
  );

  const res = spawn(julia_path, [
    `--project=${path.join(generatedAssetsDir, 'env_for_julia')}`,
    PRECOMPILE_SCRIPT_LOCATION,
    SYSIMAGE_LOCATION,
    PRECOMPILE_EXECUTION_LOCATION,
  ]);

  // stderr includes precompile status text
  res.stderr.on('data', (data) => {
    process.stdout.write(data?.toString?.());
  });

  return new Promise((resolve) => {
    res.once('close', (exit_code) => {
      if (exit_code === 0) {
        console.info('Pluto has been precompiled to', SYSIMAGE_LOCATION);
      } else {
        console.error('Pluto precompile failed');
        exit(exit_code);
      }
      resolve(SYSIMAGE_LOCATION);
    });
  });
};

const prepareJuliaDepot = async ({ julia_path }) => {
  console.log('prepareJuliaDepot: Starting...');
  console.log('prepareJuliaDepot: Julia path:', julia_path);
  
  if (!fs.existsSync(julia_path)) {
    throw new Error(`Julia executable not found at: ${julia_path}`);
  }

  const DEPOT_LOCATION = path.join(generatedAssetsDir, DEPOT_NAME);
  console.log('prepareJuliaDepot: DEPOT_LOCATION:', DEPOT_LOCATION);
  
  
  // immediately return if the depot has already been prepared
  if (fs.existsSync(DEPOT_LOCATION)) {
    console.info('DEPOT preparation already done', DEPOT_LOCATION);
    return;
  }

  fs.rmSync(DEPOT_LOCATION, {
    force: true,
    recursive: true,
  });

  const projectPath = path.join(projectRoot, 'assets', 'env_for_julia');
  console.log('prepareJuliaDepot: Project path:', projectPath);
  console.log('prepareJuliaDepot: Spawning Julia process...');

  const res = spawn(
    julia_path,
    [
      `--project=${projectPath}`,
      `-e`,
      `import Pkg; Pkg.instantiate(); import Pluto`,
    ],
    {
      env: {
        ...process.env,
        JULIA_DEPOT_PATH: DEPOT_LOCATION,
      },
    },
  );

  // Handle stdout to prevent buffer overflow
  res.stdout.on('data', (data) => {
    process.stdout.write(data?.toString?.());
  });

  // Handle stderr
  res.stderr.on('data', (data) => {
    process.stderr.write(data?.toString?.());
  });

  // Handle spawn errors
  res.on('error', (error) => {
    console.error('prepareJuliaDepot: Failed to spawn Julia process:', error);
    throw error;
  });

  console.log('prepareJuliaDepot: Waiting for Julia process to complete...');
  const exit_code = await new Promise((resolve) => {
    res.once('close', (code) => {
      console.log('prepareJuliaDepot: Julia process exited with code:', code);
      resolve(code);
    });
  });

  if (exit_code !== 0) {
    console.error('DEPOT preparation failed with exit code:', exit_code);
    throw new Error(`DEPOT preparation failed with exit code: ${exit_code}`);
  }

  // Remove downloaded registry for file savings: you don't need it to run an environment that has already been instantiated.
  fs.rmSync(path.join(DEPOT_LOCATION, 'registries'), {
    force: true,
    recursive: true,
  });

  // Fix file permissions on macOS to prevent code signing issues
  if (platform === 'darwin') {
    // (🤖🤖 This if block is AI written and not reviewed.)
    try {
      // First, make files writable so we can remove extended attributes
      execSync(`find "${DEPOT_LOCATION}" -type f -exec chmod u+w {} +`, {
        stdio: 'ignore',
      });
      execSync(`find "${DEPOT_LOCATION}" -type d -exec chmod u+w {} +`, {
        stdio: 'ignore',
      });
      // Remove extended attributes (quarantine, etc.) that can interfere with code signing
      execSync(`xattr -rc "${DEPOT_LOCATION}" 2>/dev/null || true`, {
        stdio: 'ignore',
      });
      // Set final correct permissions: 644 for files, 755 for directories
      execSync(`find "${DEPOT_LOCATION}" -type f -exec chmod 644 {} +`, {
        stdio: 'ignore',
      });
      execSync(`find "${DEPOT_LOCATION}" -type d -exec chmod 755 {} +`, {
        stdio: 'ignore',
      });
      console.info(
        'Fixed file permissions and removed extended attributes in DEPOT',
      );
    } catch (error) {
      console.warn('Warning: Could not fix file permissions:', error.message);
    }
  }

  console.info('DEPOT preparation success', DEPOT_LOCATION);
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
    throw new Error('Linux is not supported');
    // Linux: extract tar.gz
    execSync(`tar -xzf "${path.join(generatedAssetsDir, ZIP_NAME)}" -C "${generatedAssetsDir}"`);
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
  console.log('Config:', config);
  console.log('Platform:', platform);
  console.log('Arch:', arch);
  
  
  if (!fs.existsSync(generatedAssetsDir)) 
    fs.mkdirSync(generatedAssetsDir, { recursive: true });

  const architectureFilePath = path.join(generatedAssetsDir, 'architecture.txt');
  try {
    fs.writeFileSync(architectureFilePath, `${resolvedArch}\n`, 'utf8');
    console.log('Recorded architecture to', architectureFilePath);
  } catch (error) {
    console.warn('Could not write architecture.txt:', error?.message ?? error);
  }
  
  let files = fs.readdirSync(generatedAssetsDir);

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

  await prepareJuliaDepot({
    julia_path: juliaPath,
  });

  // NOT DOING THIS, see https://github.com/JuliaPluto/PlutoDesktop/issues/56
  // await precompilePluto({
  //   julia_path: juliaPath,
  // });
};

