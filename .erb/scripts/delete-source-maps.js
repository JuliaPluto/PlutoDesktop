import path from 'path';
import fs from 'node:fs';
import webpackPaths from '../configs/webpack.paths';

export default function deleteSourceMaps() {
  fs.rmSync(path.join(webpackPaths.distMainPath, '*.js.map'));
  fs.rmSync(path.join(webpackPaths.distRendererPath, '*.js.map'));
}
