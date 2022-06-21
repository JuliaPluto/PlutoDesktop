/* eslint-disable no-param-reassign */
/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import path from 'path';
import { app, BrowserWindow, shell, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import { release } from 'os';
import chalk from 'chalk';
import { isExtMatch, resolveHtmlPath } from './util';
import {
  closePluto,
  isPlutoRunning,
  runPluto,
  shutdownNotebook,
} from './pluto';
import { arg, checkIfCalledViaCLI } from './cli';
import './baseEventListeners';
import MenuBuilder from './menu';

export default class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
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

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug')();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload
    )
    .catch(console.log);
};

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
  notebook?: string
) => {
  try {
    const RESOURCES_PATH = app.isPackaged
      ? path.join(process.resourcesPath, 'assets')
      : path.join(__dirname, '../../assets');

    const getAssetPath = (...paths: string[]): string => {
      return path.join(RESOURCES_PATH, ...paths);
    };

    if (checkIfCalledViaCLI(process.argv)) {
      url ??= arg.url;
      project ??= arg.project;
      notebook ??=
        arg.notebook ?? (typeof arg._[0] === 'string' && isExtMatch(arg._[0]))
          ? (arg._[0] as string)
          : undefined;
    }

    log.info('CLI received:', arg);

    if (isDebug) {
      await installExtensions();
    }

    console.log(chalk.bgGreenBright('Creating a new window.'));

    const loading = new BrowserWindow({
      frame: false,
      height: 200,
      width: 200,
      resizable: false,
      movable: false,
      fullscreenable: false,
      title: 'Loading',
      show: false,
      icon: getAssetPath('icon.png'),
      webPreferences: {
        preload: app.isPackaged
          ? path.join(__dirname, 'preload.js')
          : path.join(__dirname, '../../.erb/dll/preload.js'),
      },
    });

    loading.once('show', async () => {
      mainWindow = new BrowserWindow({
        title: '⚡ Pluto ⚡',
        height: 600,
        width: 800,
        resizable: true,
        show: false,
        icon: getAssetPath('icon.png'),
        webPreferences: {
          preload: app.isPackaged
            ? path.join(__dirname, 'preload.js')
            : path.join(__dirname, '../../.erb/dll/preload.js'),
        },
      });

      if (!isPlutoRunning()) {
        await runPluto(loading, mainWindow, getAssetPath, project, notebook);
      }

      mainWindow.webContents.once('dom-ready', () => {
        mainWindow?.show();
        loading.hide();
        loading.close();
      });

      if (url) {
        mainWindow.loadURL(url);
      }

      mainWindow.on('ready-to-show', () => {
        if (!mainWindow) {
          throw new Error('"mainWindow" is not defined');
        }
        if (process.env.START_MINIMIZED) {
          mainWindow.minimize();
        } else {
          mainWindow.show();
        }
      });

      mainWindow.on('close', () => {
        shutdownNotebook();
      });

      mainWindow.on('closed', () => {
        mainWindow = null;
      });

      const menuBuilder = new MenuBuilder(mainWindow, createWindow);
      menuBuilder.buildMenu();

      // Open urls in the user's browser
      mainWindow.webContents.setWindowOpenHandler((edata) => {
        shell.openExternal(edata.url);
        return { action: 'deny' };
      });
    });

    await loading.loadURL(resolveHtmlPath('index.html'));
    loading.webContents.send('CHANGE_PAGE', '/loading');
    loading.show();

    // Remove this if your app does not use auto updates
    // eslint-disable-next-line
    new AppUpdater();
  } catch (e) {
    log.error(chalk.red(e));
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
  await createWindow(undefined, undefined, file);
});

app
  .whenReady()
  .then(() => {
    createWindow();
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();
    });
    app.on('will-quit', () => {
      if (closePluto) closePluto();
    });
  })
  .catch(log.error);

export { createWindow };
