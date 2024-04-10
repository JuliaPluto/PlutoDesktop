/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */

import './baseEventListeners';

import chalk from 'chalk';
import { app, ipcMain, session } from 'electron';
import { autoUpdater } from 'electron-updater';
import { release } from 'os';

// import { Deeplink } from 'electron-deeplink';
// import * as isDev from 'electron-is-dev';
import { backgroundLogger, generalLogger } from './logger';
import Pluto from './pluto';
import { store } from './store';
import { GlobalWindowManager } from './windowHelpers';
import { initGlobals, startup } from './startup';
import { Globals } from './globals';
import axios from 'axios';

generalLogger.verbose('---------- NEW SESSION ----------');
generalLogger.verbose('Application Version:', app.getVersion());
generalLogger.verbose(chalk.green('CONFIG STORE:'), store.store);

export default class AppUpdater {
  constructor() {
    autoUpdater.logger = backgroundLogger;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

// Disable GPU Acceleration for Windows 7
if (release().startsWith('6.1')) app.disableHardwareAcceleration();

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName());

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

ipcMain.on('ipc-example', async (event, args) => {
  const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
  console.log(msgTemplate(args));
  event.reply('ipc-example', msgTemplate('pong'));
});

/**
 * - A function to create a pluto window.
 * - It checks whether called from CLI or GUI.
 * - It checks if a pluto instance is already running.
 * - Installs dev extensions if needed
 * - Takes care of app updates
 *
 * *NOTE:* If any param is `unknown` it is overwritten by the CLI options,
 * if possible.
 *
 * @param url the URL to open in this window
 * @param project the project folder location
 * @param notebook the path to a pluto notebook
 * @returns nothing
 */

const createWindow = () => {
  generalLogger.announce('Creating a new window.');

  const firstPluto = new Pluto();
  const window = firstPluto.getBrowserWindow();
  window.focus();

  // Remove this if your app does not use auto updates
  // new AppUpdater();

  return firstPluto;
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('open-file', async (_event, file) => {
  // TODO: Implement filesystem open
  _event.preventDefault();
  console.log(file);
  console.log(app.isReady());
  console.log(GlobalWindowManager.getInstance().plutoWindows.length);
  // await createWindow(file);
});

app
  .whenReady()
  .then(async () => {
    store.set(
      'IMPORTANT-NOTE',
      'This file is used for internal configuration. Please refrain from editing or deleting this file.'
    );

    await initGlobals();
    createWindow();
    startup(app);

    // app.on('activate', () => {
    //   createWindow();
    // });
    app.on('will-quit', () => {
      Pluto.close();
    });
    session.defaultSession.on('will-download', (_event, item) => {
      const fileName = item.getFilename();
      const ext = fileName.split('.')[fileName.split('.').length - 1];
      let fileType = 'Pluto Statefile';
      if (ext.endsWith('html')) fileType = 'HTML file';
      else if (ext.endsWith('jl')) fileType = 'Pluto Notebook';

      item.setSaveDialogOptions({
        message: 'Select location to export file',
        filters: [{ extensions: [ext], name: fileType }],
      });
      item.once('done', (_e, state) => {
        if (state === 'completed')
          generalLogger.verbose(
            'Successfully downloaded',
            fileName,
            'to',
            item.getSavePath()
          );
        else
          generalLogger.error(
            'Download failed',
            fileName,
            'because of',
            chalk.underline(state)
          );
      });
    });

    createRequestListener();
  })
  .catch(generalLogger.error);

function createRequestListener() {
  session.defaultSession.webRequest.onBeforeRequest(async (details, next) => {
    let cancel = false;

    if (!details.webContentsId) {
      generalLogger.warn('Web request was made without defined webContentsId');
      next({ cancel });
      return;
    }

    const plutoWindow =
      GlobalWindowManager.getInstance().getWindowByWebContentsId(
        details.webContentsId
      );

    if (!plutoWindow) {
      next({ cancel });
      return;
    }

    // In development, our path usually looks like /.../Pluto.jl/frontend
    // In production, our path usually looks like  /.../Pluto/KkVLI/frontend
    if (details.url.match(/\/Pluto(\.jl)?\/(.*\/)?frontend(-dist)?/g)) {
      const url = new URL(details.url);
      const tail = url.pathname.split('/').reverse()[0];

      generalLogger.verbose(
        'Triggered Pluto.jl server-side route detection!',
        details.url
      );

      if (url.pathname.endsWith('/')) {
        next({ redirectURL: Pluto.resolveHtmlPath('index.html') });
        return;
      }
      if (tail === 'new') {
        // this should be synchronous so the user sees the Pluto.jl loading screen on index.html
        await plutoWindow.open('new');
        next({
          cancel: true,
        });
        return;
      }
      if (tail === 'open') {
        await plutoWindow.open('path', url.searchParams.get('path'));
        next({
          cancel: true,
        });
        return;
      }
      if (tail === 'edit') {
        next({
          redirectURL:
            Pluto.resolveHtmlPath('editor.html') + url.search.replace('?', '&'),
        });
        return;
      }
      // this route gets called when pasting a notebook into the welcome page
      if (tail === 'notebookupload') {
        next({
          redirectURL: new URL(
            `notebookupload?secret=${Globals.PLUTO_SECRET}`,
            Globals.PLUTO_URL
          ).toString(),
        });
      }
    }

    next({ cancel });
  });
}
