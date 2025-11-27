if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

const installExtensionsAndOpenDevtools = async () => {
  if (isDebug) {
    require('electron-debug')();
    // no devtools extensions needed
  }
};

export default installExtensionsAndOpenDevtools;
