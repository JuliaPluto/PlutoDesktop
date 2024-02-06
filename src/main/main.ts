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
import {
  app,
  BrowserWindow,
  ipcMain,
  nativeTheme,
  session,
  shell,
} from 'electron';
import { autoUpdater } from 'electron-updater';
import { release } from 'os';

// import { Deeplink } from 'electron-deeplink';
// import * as isDev from 'electron-is-dev';
import { backgroundLogger, generalLogger } from './logger';
import MenuBuilder from './menu';
import Pluto from './pluto';
import { store } from './store';
import { createPlutoWindow, GlobalWindowManager } from './windowHelpers';
import { startup } from './startup';

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
  /**
   * If window with {pathOrURL} is already open, focus on it
   * else open a new one
   */
  // if (!forceNew && pathOrURL) {
  //   const id = Pluto.notebook.getId(pathOrURL);
  //   if (id) {
  //     const windows = BrowserWindow.getAllWindows();
  //     const windowId = windows.findIndex((window) =>
  //       window.webContents.getURL().includes(id)
  //     );
  //     if (windowId !== -1) {
  //       windows[windowId].focus();
  //       return;
  //     }
  //   } else {
  //     generalLogger.log(`Opening ${pathOrURL} in new window.`);
  //   }
  // }
  generalLogger.announce('Creating a new window.');

  const currWindow = createPlutoWindow();
  currWindow.focus();
  const firstPluto = new Pluto(currWindow);
  GlobalWindowManager.getInstance().registerWindow(firstPluto);

  if (!Pluto.runningInfo) {
    // await firstPluto.run();
  }

  currWindow.on('ready-to-show', () => {
    if (process.env.START_MINIMIZED) {
      currWindow.minimize();
    } else {
      currWindow.show();
    }
  });

  currWindow.once('close', async () => {
    await Pluto.notebook.shutdown();
  });

  const menuBuilder = new MenuBuilder(currWindow, createWindow);

  let first = true;
  currWindow.on('page-title-updated', (_e, title) => {
    generalLogger.verbose('Window', currWindow.id, 'moved to page:', title);
    if (currWindow?.webContents.getTitle().includes('index.html')) return;
    const pageUrl = new URL(currWindow!.webContents.getURL());
    const isPluto = pageUrl.href.includes('localhost:');
    if (first || isPluto) {
      first = false;
      currWindow?.setMenuBarVisibility(true);
      menuBuilder.buildMenu();
    }
  });

  // Open urls in the user's browser
  currWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  // Remove this if your app does not use auto updates
  new AppUpdater();

  return currWindow;
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
  // await createWindow(file);
});

app
  .whenReady()
  .then(() => {
    store.set(
      'IMPORTANT-NOTE',
      'This file is used for internal configuration. Please refrain from editing or deleting this file.'
    );

    const mainWindow = createWindow();
    startup(app, mainWindow);

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

    if (details.url.match(/\/Pluto\.jl\/frontend(-dist)?/g)) {
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
        await Pluto.notebook.new();
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
            Pluto.resolveHtmlPath('editor.html') +
            `&id=${url.searchParams.get('id')}`,
        });
        return;
      }
    }

    next({ cancel });
  });
}
