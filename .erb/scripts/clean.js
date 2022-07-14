/* eslint-disable prettier/prettier */
import rimraf from 'rimraf';
import process from 'process';
import path from 'node:path';
import fs from 'fs';
import webpackPaths from '../configs/webpack.paths';

const args = process.argv.slice(2);
const commandMap = {
  dist: webpackPaths.distPath,
  release: webpackPaths.releasePath,
  dll: webpackPaths.dllPath,
};

args.forEach((x) => {
  const pathToRemove = commandMap[x];
  if (pathToRemove !== undefined) {
    rimraf.sync(pathToRemove);
  }
});

const deleteJuliaFolder = () => {
  const assetPath = path.join(webpackPaths.rootPath, 'assets');
  const files = fs.readdirSync(assetPath);
  const juliaIdx = files.findIndex(
    (v) => v.startsWith('julia-') && !v.endsWith('zip')
  );
  if (juliaIdx !== -1) {
    console.log(
      'Deleted Julia folder, hence not bundling it, only zip is bundled.'
    );
    rimraf.sync(path.join(assetPath, files[juliaIdx]), {
      recursive: true,
      force: true,
    });
  }
};

// deleteJuliaFolder();
