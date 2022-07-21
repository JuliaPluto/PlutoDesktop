const rimraf = require('rimraf');
const process = require('process');
const path = require('node:path');
const fs = require('fs');
const unzip = require('extract-zip');
const chalk = require('chalk');

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
  console.log(chalk.grey('\tExtracting:', zip));
  zip = path.join(assetPath, zip);
  await unzip(zip, { dir: assetPath });
  console.log(chalk.grey('\tExtracted new Julia folder'));
};
