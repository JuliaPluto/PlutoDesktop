import path from 'path';
import rimraf from 'rimraf';
import fs from 'node:fs';
import webpackPaths from '../configs/webpack.paths';

export default function deleteSourceMaps() {
  rimraf.sync(path.join(webpackPaths.distMainPath, '*.js.map'));
}
