const process = require('process');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const unzip = require('extract-zip');
const chalk = require('chalk');
const { execSync } = require('child_process');
const { createSpinner } = require('nanospinner');
const { default: axios } = require('axios');
const { exit } = require('process');

const assetPath = path.join(__dirname, '../..', 'assets');

// YOU CAN EDIT ME
const JULIA_VERSION_PARTS = [1, 10, 2];
/// ☝️

const JULIA_VERSION = JULIA_VERSION_PARTS.join('.');
const JULIA_VERSION_MINOR = JULIA_VERSION_PARTS.slice(0, 2).join('.');

const JULIA_URL = `https://julialang-s3.julialang.org/bin/winnt/x64/${JULIA_VERSION_MINOR}/julia-${JULIA_VERSION}-win64.zip`;

const ZIP_NAME = `julia-${JULIA_VERSION}-win64.zip`;
const JULIA_DIR_NAME = `julia-${JULIA_VERSION}`;

const DEPOT_NAME = `julia_depot`;

const downloadJulia = async () => {
  const spinner = createSpinner(`\tDownloading Julia ${JULIA_VERSION}`).start();
  const writer = fs.createWriteStream(path.join(assetPath, ZIP_NAME));

  const response = await axios.get(JULIA_URL, {
    responseType: 'stream',
    onDownloadProgress: (progressEvent) => {
      const percentage = Math.round(
        (progressEvent.loaded * 100) / progressEvent.total
      );
      spinner
        .update({ text: `\tDownloading Julia ${JULIA_VERSION} ${percentage}%` })
        .spin();
    },
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    if (response.status > 399) {
      reject(response.statusText);
    }
    response.data.on('error', (e) => {
      console.log();
      reject(e);
    });
    writer.on('error', (e) => {
      console.log();
      reject(e);
    });
    writer.on('finish', (args) => {
      spinner.success({ text: '\tDownloaded Julia', mark: '✓' });
      resolve(args);
    });
  });
};

const precompilePluto = async ({ julia_path }) => {
  const SYSIMAGE_LOCATION = path.join(
    assetPath,
    // TODO: auto version number
    'pluto.so'
  );

  // immediately return if the sysimage has already been compiled
  if (fs.existsSync(SYSIMAGE_LOCATION)) {
    return new Promise((resolve) => resolve());
  }

  const PRECOMPILE_SCRIPT_LOCATION = path.join(assetPath, 'precompile.jl');
  const PRECOMPILE_EXECUTION_LOCATION = path.join(
    assetPath,
    'precompile_execution.jl'
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
    }
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

  console.info('DEPOT preparation success', DEPOT_LOCATION);
};

exports.default = async (context) => {
  let files = fs.readdirSync(assetPath);

  if (!files.includes(JULIA_DIR_NAME)) {
    await downloadJulia();
    // files = fs.readdirSync(assetPath);

    const spinner1 = createSpinner(`\tExtracting: ${ZIP_NAME}`).start();
    fs.rmSync(path.join(assetPath, JULIA_DIR_NAME), {
      force: true,
      recursive: true,
    });
    await unzip(path.join(assetPath, ZIP_NAME), { dir: assetPath });
    fs.rmSync(path.join(assetPath, ZIP_NAME), {
      force: true,
    });
    spinner1.success({ text: '\tExtracted!', mark: '✓' });
  }

  await prepareJuliaDepot({
    julia_path: path.join(assetPath, JULIA_DIR_NAME, 'bin', 'julia.exe'),
  });

  // NOT DOING THIS, see https://github.com/JuliaPluto/PlutoDesktop/issues/56
  //  maybe we are... (CB)
  await precompilePluto({
    julia_path: path.join(assetPath, JULIA_DIR_NAME, 'bin', 'julia.exe'),
  });
};
