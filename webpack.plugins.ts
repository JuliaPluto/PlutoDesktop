import type IForkTsCheckerWebpackPlugin from 'fork-ts-checker-webpack-plugin';
import { DefinePlugin } from 'webpack';

const ForkTsCheckerWebpackPlugin: typeof IForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

export const plugins = [
  new ForkTsCheckerWebpackPlugin({
    logger: 'webpack-infrastructure',
  }),
  // Bake the package.json version into the bundle at build time. The preload
  // runs in a sandboxed renderer where the Electron `app` module (and thus
  // `app.getVersion()`) is unavailable, so we replace it with a literal here.
  new DefinePlugin({
    __DESKTOP_VERSION__: JSON.stringify(require('./package.json').version),
  }),
];
