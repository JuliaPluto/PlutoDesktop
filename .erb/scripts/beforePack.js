const rimraf = require('rimraf');
const process = require('process');
const path = require('node:path');
const fs = require('fs');
const unzip = require('extract-zip');
const chalk = require('chalk');
const { execSync } = require('child_process');
const { createSpinner } = require('nanospinner');
const { default: axios } = require('axios');

const assetPath = path.join(__dirname, '../..', 'assets');

const JULIA_VERSION_PARTS = [1, 8, 5];
const JULIA_VERSION = JULIA_VERSION_PARTS.join('.');
const JULIA_VERSION_M = JULIA_VERSION_PARTS.slice(0, 2).join('.');

const JULIA_URL = `https://julialang-s3.julialang.org/bin/winnt/x64/${JULIA_VERSION_M}/julia-${JULIA_VERSION}-win64.zip`;

const ZIP_NAME = `julia-${JULIA_VERSION}-win64.zip`;

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

exports.default = async (context) => {
  let files = fs.readdirSync(assetPath);
  const juliaFolderIdx = files.findIndex(
    (v) => v.startsWith('julia-') && !v.endsWith('zip')
  );
  if (juliaFolderIdx !== -1) {
    console.log(chalk.grey('\tDeleted Old Julia folder'));
    rimraf.sync(path.join(assetPath, files[juliaFolderIdx]), {
      recursive: true,
      force: true,
    });
  }

  if (files.includes(ZIP_NAME)) {
    await downloadJulia();
  }
  files = fs.readdirSync(assetPath);

  // const output_name = ZIP_NAME.replace('.zip', '').replace('-win64', '');

  const spinner1 = createSpinner(`\tExtracting: ${ZIP_NAME}`).start();
  await unzip(path.join(assetPath, ZIP_NAME), { dir: assetPath });
  spinner1.success({ text: '\tExtracted!', mark: '✓' });

  // const spinner2 = createSpinner('\tDeleting old system image').start();
  // const IMAGE_PATH = path.join(assetPath, 'pluto-sysimage.so');
  // rimraf.sync(IMAGE_PATH, {
  //   recursive: true,
  //   force: true,
  // });
  // spinner2.success({ text: '\tDeleted old system image', mark: '✓' });

  // const STATEMENT_FILE = path.join(assetPath, 'pluto_precompile.jl');
  // const SCRIPT_FILE = path.join(__dirname, 'build-precompile.jl');
  // const TRACE_FILE_CREATER = path.join(__dirname, 'create-tracefile.jl');

  // const spinner3 = createSpinner('\tGenerating trace file...').start();
  // if (fs.existsSync(STATEMENT_FILE)) fs.rmSync(STATEMENT_FILE);
  // fs.writeFileSync(STATEMENT_FILE, '');

  // const CREATE_TRACEFILE = `${path.join(
  //   assetPath,
  //   'julia-1.8.1\\bin\\julia.exe'
  // )} --trace-compile=${STATEMENT_FILE} ${TRACE_FILE_CREATER}`;
  // // console.log(chalk.grey(CREATE_TRACEFILE));
  // execSync(CREATE_TRACEFILE);
  // spinner3.success({ text: '\tGenerated trace file', mark: '✓' });

  // const spinner4 = createSpinner('\tProcompiling...').start();
  // const cmd = `${path.join(
  //   assetPath,
  //   'julia-1.8.1\\bin\\julia.exe'
  // )} ${SCRIPT_FILE} ${IMAGE_PATH} ${STATEMENT_FILE}`;
  // execSync(cmd);
  // spinner4.success({ text: '\tPrecompilation successful', mark: '✓' });
};
