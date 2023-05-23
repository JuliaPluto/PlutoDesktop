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
import path from 'path';

// import { Deeplink } from 'electron-deeplink';
// import * as isDev from 'electron-is-dev';
import { backgroundLogger, generalLogger } from './logger';
import MenuBuilder from './menu';
import Pluto from './pluto';
import { store } from './store';
import { getAssetPath } from './paths';

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

let mainWindow: BrowserWindow | null = null;

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

const createWindow = async (
  url?: string,
  project?: string,
  notebook?: string,
  forceNew = true
) => {
  try {
    const pathOrURL = notebook ?? url;

    /**
     * If window with {pathOrURL} is already open, focus on it
     * else open a new one
     */
    if (!forceNew && pathOrURL) {
      const id = Pluto.notebook.getId(pathOrURL);
      if (id) {
        const windows = BrowserWindow.getAllWindows();
        const windowId = windows.findIndex((window) =>
          window.webContents.getURL().includes(id)
        );
        if (windowId !== -1) {
          windows[windowId].focus();
          return;
        }
      } else {
        generalLogger.log(`Opening ${pathOrURL} in new window.`);
      }
    }

    /**
     * Uncomment the next LoC if you want devtools to open with
     * every new window, please comment it again when you commit.
     */
    // await (await import('./devtools')).default();

    generalLogger.announce('Creating a new window.');

    const currWindow = new BrowserWindow({
      title: '⚡ Pluto ⚡',
      height: 800,
      width: process.env.NODE_ENV === 'development' ? 1200 : 700,
      resizable: true,
      show: true,
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#1F1F1F' : 'white',
      icon: getAssetPath('icon.png'),
      webPreferences: {
        preload: app.isPackaged
          ? path.join(__dirname, 'preload.js')
          : path.join(__dirname, '../../.erb/dll/preload.js'),
      },
    });
    currWindow.setMenuBarVisibility(false);

    mainWindow ??= currWindow;

    if (process.env.NODE_ENV === 'development') {
      currWindow.webContents.openDevTools();
    }

    if (!Pluto.runningInfo) {
      await new Pluto(currWindow).run(project, notebook, url);
    } else if (url) {
      currWindow.focus();
      await Pluto.notebook.open('url', url);
    } else if (notebook) {
      currWindow.focus();
      await Pluto.notebook.open('path', notebook);
    }

    currWindow.on('ready-to-show', () => {
      if (!currWindow) {
        throw new Error('"currWindow" is not defined');
      }
      if (process.env.START_MINIMIZED) {
        currWindow.minimize();
      } else {
        currWindow.show();
      }
    });

    currWindow.once('close', async () => {
      await Pluto.notebook.shutdown();
      mainWindow = null;
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
  } catch (e) {
    generalLogger.error('CREATE-WINDOW-ERROR', e);
  }
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
  _event.preventDefault();
  console.log(file);
  await createWindow(undefined, undefined, file, false);
});

app
  .whenReady()
  .then(() => {
    store.set(
      'IMPORTANT-NOTE',
      'This file is used for internal configuration. Please refrain from editing or deleting this file.'
    );
    createWindow();
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (!mainWindow) createWindow();
    });
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

    Pluto.createRequestListener();
  })
  .catch(generalLogger.error);
