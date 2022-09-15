const rimraf = require('rimraf');
const process = require('process');
const path = require('node:path');
const fs = require('fs');
const unzip = require('extract-zip');
const chalk = require('chalk');
const { execSync } = require('child_process');
const { Spinner } = require('cli-spinner');

const assetPath = path.join(__dirname, '../..', 'assets');

exports.default = async (context) => {
  const files = fs.readdirSync(assetPath);
  const juliaFolderIdx = files.findIndex(
    (v) => v.startsWith('julia-') && !v.endsWith('zip')
  );
  if (juliaFolderIdx !== -1) {
    console.log(chalk.grey('\tDeleted Julia folder'));
    rimraf.sync(path.join(assetPath, files[juliaFolderIdx]), {
      recursive: true,
      force: true,
    });
  }
  const juliaIdx = files.findIndex(
    (v) => v.startsWith('julia-') && v.endsWith('zip')
  );
  let zip = files[juliaIdx];
  const nameInitial = zip.replace('-win64.zip', '');
  const spinner1 = new Spinner(`\tExtracting: ${zip} %s`).start();
  zip = path.join(assetPath, zip);
  await unzip(zip, { dir: assetPath });
  spinner1.stop();
  console.log();
  console.log(chalk.grey('\tDeleting old image'));
  const IMAGE_PATH = path.join(assetPath, 'pluto-sysimage.so');
  const STATEMENT_FILE = path.join(assetPath, 'pluto_precompile.jl');
  const SCRIPT_FILE = path.join(__dirname, 'build-precompile.jl');
  rimraf.sync(IMAGE_PATH, {
    recursive: true,
    force: true,
  });
  console.log(chalk.grey('\tPrecompiling...'));
  const cmd = `${path.join(
    assetPath,
    'julia-1.8.1\\bin\\julia.exe'
  )} ${SCRIPT_FILE} ${IMAGE_PATH} ${STATEMENT_FILE}`;
  execSync(cmd);
  console.log(chalk.green('\tPrecompilation successful.'));
};
