/* eslint-disable prettier/prettier */
import rimraf from 'rimraf';
import process from 'process';
import path from 'node:path';
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
