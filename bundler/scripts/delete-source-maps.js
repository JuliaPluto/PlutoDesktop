import path from 'path';
import * as rimraf from 'rimraf';
import fs from 'node:fs';
import webpackPaths from '../configs/webpack.paths.ts';

export default function deleteSourceMaps() {
  rimraf.sync(path.join(webpackPaths.distMainPath, '*.js.map'), { glob: true });
}
