/* eslint-disable no-param-reassign */
/* eslint global-require: off, no-console: off, promise/always-return: off */

import { generalLogger } from './logger';

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

const installExtensionsAndOpenDevtools = async () => {
  if (isDebug) {
    require('electron-debug')();

    const installer = require('electron-devtools-installer');
    const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
    const extensions = ['REACT_DEVELOPER_TOOLS'];

    installer
      .default(
        extensions.map((name) => installer[name]),
        forceDownload
      )
      .catch(generalLogger.error);
  }
};

export default installExtensionsAndOpenDevtools;
