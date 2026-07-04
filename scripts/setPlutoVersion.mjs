// Set the bundled Pluto version. This updates:
//   - the package version to `<pluto-version>-buildNNN` (NNN = zero-padded desktop release number)
//   - the `[compat]` entry in assets/env_for_julia/Project.toml to pin exactly that Pluto version
//   - assets/env_for_julia/Manifest.toml, by running Pkg.update("Pluto") (requires Julia)
//
// Usage: npm run set-pluto-version -- <pluto-version> [build-number]
// Example: npm run set-pluto-version -- 1.0.2
// The build number auto-increments when re-run with the same Pluto version.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const envForJuliaDir = path.join(projectRoot, 'assets', 'env_for_julia');
const projectTomlPath = path.join(envForJuliaDir, 'Project.toml');
const packageJsonPath = path.join(projectRoot, 'package.json');
const generatedAssetsDir = path.join(projectRoot, 'generated_assets');

const usage = () => {
  console.error('Usage: npm run set-pluto-version -- <pluto-version> [build-number]');
  console.error('Example: npm run set-pluto-version -- 1.0.2');
  process.exit(1);
};

const [plutoVersion, buildArg] = process.argv.slice(2);
if (!plutoVersion || !/^\d+\.\d+\.\d+$/.test(plutoVersion)) usage();
if (buildArg !== undefined && !/^\d+$/.test(buildArg)) usage();

const parseDesktopVersion = (version) =>
  version.match(/^(\d+\.\d+\.\d+)-build(\d+)$/) ??
  version.match(/^(\d+\.\d+\.\d+)-build\.(\d+)$/);

const formatBuildNumber = (build) => String(build).padStart(3, '0');

// Determine the build number: explicit argument, or auto-increment when the
// current package version is already based on the same Pluto version.
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
let build = 1;
if (buildArg !== undefined) {
  build = Number(buildArg);
} else {
  const current = parseDesktopVersion(pkg.version);
  if (current && current[1] === plutoVersion) {
    build = Number(current[2]) + 1;
  }
}
if (build < 1) usage();
const newVersion = `${plutoVersion}-build${formatBuildNumber(build)}`;

if (build >= 1000) {
  console.warn(
    `Build number ${build}: Squirrel.Windows compares the prerelease part as a plain string, ` +
      `so the fixed-width buildNNN scheme is only ordered correctly through build999. ` +
      `Prefer bumping the bundled Pluto version instead.`,
  );
}

console.log(`Package version: ${pkg.version} -> ${newVersion}`);
execSync(`npm version ${newVersion} --no-git-tag-version --allow-same-version`, {
  cwd: projectRoot,
  stdio: 'inherit',
});

// Pin the exact Pluto version in the Julia environment's [compat] section.
const compatLine = `Pluto = "=${plutoVersion}"`;
let toml = fs.readFileSync(projectTomlPath, 'utf8');
const compatSection = toml.match(/^\[compat\]\n([^[]*)/m);
if (compatSection) {
  const section = compatSection[0];
  const updated = /^Pluto\s*=.*$/m.test(section)
    ? section.replace(/^Pluto\s*=.*$/m, compatLine)
    : `${section.trimEnd()}\n${compatLine}\n`;
  toml = toml.replace(section, updated);
} else {
  toml = `${toml.trimEnd()}\n\n[compat]\n${compatLine}\n`;
}
fs.writeFileSync(projectTomlPath, toml);
console.log(`Pinned ${compatLine} in ${path.relative(projectRoot, projectTomlPath)}`);

// Update the Manifest so Pkg.instantiate() at build time installs the new version.
// Prefer the Julia bundled in generated_assets (same version as the shipped app),
// fall back to `julia` on the PATH. This uses the user's default depot, which has
// registries available (the generated_assets depot has them stripped).
const findJulia = () => {
  const exe = process.platform === 'win32' ? 'julia.exe' : 'julia';
  if (fs.existsSync(generatedAssetsDir)) {
    for (const dir of fs.readdirSync(generatedAssetsDir)) {
      if (!dir.startsWith('julia-')) continue;
      const candidate = path.join(generatedAssetsDir, dir, 'bin', exe);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  const which = process.platform === 'win32' ? 'where' : 'which';
  try {
    execSync(`${which} julia`, { stdio: 'ignore' });
    return 'julia';
  } catch {
    return null;
  }
};

const julia = findJulia();
if (julia == null) {
  console.warn('Julia not found; Manifest.toml was NOT updated. Run this manually:');
  console.warn(`\tjulia --project=${envForJuliaDir} -e 'import Pkg; Pkg.update("Pluto")'`);
  process.exit(1);
}

console.log(`Updating Manifest.toml using ${julia}...`);
const res = spawnSync(
  julia,
  [`--project=${envForJuliaDir}`, '-e', 'import Pkg; Pkg.update("Pluto")'],
  { stdio: 'inherit' },
);
if (res.status !== 0) {
  console.error(`Manifest update failed (exit code ${res.status})`);
  process.exit(res.status ?? 1);
}

// The prepared depot caches the previously installed Pluto; remove it so the
// next `npm run make` reinstalls with the new Manifest.
const depotPath = path.join(generatedAssetsDir, 'julia_depot');
if (fs.existsSync(depotPath)) {
  console.log('Removing generated_assets/julia_depot so the next build uses the new Pluto...');
  fs.rmSync(depotPath, { recursive: true, force: true });
}

console.log(`Done! PlutoDesktop is now version ${newVersion}, bundling Pluto v${plutoVersion}.`);
