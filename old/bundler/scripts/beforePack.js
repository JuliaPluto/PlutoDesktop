import process from 'process';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import unzip from 'extract-zip';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { createSpinner } from 'nanospinner';
import { exit } from 'process';
import { fileURLToPath } from 'node:url';

const assetPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
  'assets',
);

// YOU CAN EDIT ME
const JULIA_VERSION_PARTS = [1, 10, 10];
/// ☝️

const JULIA_VERSION = JULIA_VERSION_PARTS.join('.');
const JULIA_VERSION_MINOR = JULIA_VERSION_PARTS.slice(0, 2).join('.');

// Detect platform
const platform = process.platform;
const arch = process.arch === 'arm64' ? 'aarch64' : 'x64';

let JULIA_URL, ZIP_NAME, JULIA_DIR_NAME, JULIA_EXECUTABLE;

if (platform === 'win32') {
  ZIP_NAME = `julia-${JULIA_VERSION}-win64.zip`;
  JULIA_URL = `https://julialang-s3.julialang.org/bin/winnt/x64/${JULIA_VERSION_MINOR}/${ZIP_NAME}`;
  JULIA_DIR_NAME = `julia-${JULIA_VERSION}`;
  JULIA_EXECUTABLE = 'julia.exe';
} else if (platform === 'darwin') {
  // macOS
  const macArch = arch === 'aarch64' ? 'aarch64' : 'x64';
  ZIP_NAME = `julia-${JULIA_VERSION}-mac${arch === 'aarch64' ? 'aarch64' : '64'}.dmg`;
  JULIA_URL = `https://julialang-s3.julialang.org/bin/mac/${macArch}/${JULIA_VERSION_MINOR}/${ZIP_NAME}`;
  JULIA_DIR_NAME = `julia-${JULIA_VERSION}`;
  JULIA_EXECUTABLE = 'julia';
} else {
  // Linux
  throw new Error('Linux is not supported');
}

const DEPOT_NAME = `julia_depot`;

const downloadJulia = async () => {
  const spinner = createSpinner(
    `\tDownloading Julia ${JULIA_VERSION} for ${platform}`,
  ).start();

  const response = await fetch(JULIA_URL);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const filePath = path.join(assetPath, ZIP_NAME);
  const writeStream = fs.createWriteStream(filePath);
  const readStream = Readable.fromWeb(response.body);

  await pipeline(readStream, writeStream);

  spinner.success({
    text: `\tDownloaded Julia (for ${platform})`,
    mark: '✓',
  });
};

const precompilePluto = async ({ julia_path }) => {
  // TODO: You need to add PackageCompiler to some environment for this to work.

  const SYSIMAGE_LOCATION = path.join(
    assetPath,
    // TODO: auto version number
    'pluto.so',
  );

  // immediately return if the sysimage has already been compiled
  if (fs.existsSync(SYSIMAGE_LOCATION)) {
    return new Promise((resolve) => resolve());
  }

  const PRECOMPILE_SCRIPT_LOCATION = path.join(assetPath, 'precompile.jl');
  const PRECOMPILE_EXECUTION_LOCATION = path.join(
    assetPath,
    'precompile_execution.jl',
  );

  const res = spawn(julia_path, [
    `--project=${path.join(assetPath, 'env_for_julia')}`,
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
  const DEPOT_LOCATION = path.join(assetPath, DEPOT_NAME);

  fs.rmSync(DEPOT_LOCATION, {
    force: true,
    recursive: true,
  });

  const res = spawn(
    julia_path,
    [
      `--project=${path.join(assetPath, 'env_for_julia')}`,
      `-e`,
      `import Pkg; Pkg.instantiate(); import Pluto`,
    ],
    {
      env: {
        JULIA_DEPOT_PATH: DEPOT_LOCATION,
      },
    },
  );

  res.stderr.on('data', (data) => {
    console.log(data?.toString?.());
  });

  const exit_code = await new Promise((resolve) => {
    res.once('close', resolve);
  });

  if (exit_code !== 0) {
    console.error('DEPOT preparation failed');
    exit(exit_code);
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
  const spinner1 = createSpinner(`\tExtracting: ${ZIP_NAME}`).start();
  fs.rmSync(path.join(assetPath, JULIA_DIR_NAME), {
    force: true,
    recursive: true,
  });

  if (platform === 'win32') {
    // Windows: extract zip
    await unzip(path.join(assetPath, ZIP_NAME), { dir: assetPath });
  } else if (platform === 'darwin') {
    // macOS: mount DMG and copy contents
    const dmgPath = path.join(assetPath, ZIP_NAME);
    const mountPoint = path.join(assetPath, 'julia_mount');

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
      const targetPath = path.join(assetPath, JULIA_DIR_NAME);

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
    execSync(`tar -xzf "${path.join(assetPath, ZIP_NAME)}" -C "${assetPath}"`);
  }

  fs.rmSync(path.join(assetPath, ZIP_NAME), {
    force: true,
  });
  spinner1.success({ text: '\tExtracted!', mark: '✓' });
};

export default async (context) => {
  let files = fs.readdirSync(assetPath);

  if (!files.includes(JULIA_DIR_NAME)) {
    await downloadJulia();
    await extractJulia();
  }

  const juliaPath = path.join(
    assetPath,
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
