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
import { app, BrowserWindow, shell, ipcMain, session } from 'electron';
import { autoUpdater } from 'electron-updater';
import { release } from 'os';
import chalk from 'chalk';
import { generalLogger, backgroundLogger } from './logger';
import { isExtMatch, resolveHtmlPath } from './util';
import {
  closePluto,
  isPlutoRunning,
  openNotebook,
  runPluto,
  shutdownNotebook,
} from './pluto';
import { arg, checkIfCalledViaCLI } from './cli';
import './baseEventListeners';
import MenuBuilder from './menu';
import { store, userStore } from './store';

generalLogger.verbose('---------- NEW LAUNCH ----------');
generalLogger.verbose('Application Version:', app.getVersion());
generalLogger.verbose('Julia Version:', '1.7.3');
generalLogger.verbose(chalk.green('CONFIG STORE:'), store.store);
generalLogger.verbose(chalk.green('USER STORE:'), userStore.store);

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
    .catch(generalLogger.error);
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

    if (!store.has('JULIA-PATH')) {
      store.set('JULIA-PATH', getAssetPath('julia-1.7.3\\bin\\julia.exe'));
    }
    if (!store.has('PLUTO-PRECOMPILED')) {
      store.set('PLUTO-PRECOMPILED', getAssetPath('pluto-sysimage.so'));
    }
    store.set(
      'IMPORTANT-NOTE',
      'This file is used for internal configuration. Please refrain from editing or deleting this file.'
    );

    if (checkIfCalledViaCLI(process.argv)) {
      url ??= arg.url;
      project ??= arg.project;
      notebook ??=
        arg.notebook ??
        (arg._.length > 0 &&
          typeof arg._[0] === 'string' &&
          isExtMatch(arg._[0]))
          ? (arg._[0] as string)
          : undefined;
    }

    generalLogger.info('CLI received:', arg);

    if (isDebug) {
      await installExtensions();
    }

    generalLogger.announce('Creating a new window.');

    const loading = new BrowserWindow({
      frame: false,
      height: 200,
      width: 200,
      resizable: false,
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
        darkTheme: true,
        show: false,
        icon: getAssetPath('icon.png'),
        webPreferences: {
          preload: app.isPackaged
            ? path.join(__dirname, 'preload.js')
            : path.join(__dirname, '../../.erb/dll/preload.js'),
        },
      });

      if (!isPlutoRunning()) {
        await runPluto(
          loading,
          mainWindow,
          getAssetPath,
          project,
          notebook,
          url
        );
      } else if (url) {
        mainWindow?.focus();
        await openNotebook('url', url);
      }

      mainWindow.webContents.once('dom-ready', () => {
        mainWindow?.show();
        loading.hide();
        loading.close();
      });

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

      let showExport = false;
      mainWindow.on('page-title-updated', (_e, title) => {
        generalLogger.verbose(
          'Window',
          mainWindow!.id / 2,
          'moved to page:',
          title
        );
        const pageUrl = new URL(mainWindow!.webContents.getURL());
        const hasId = pageUrl.searchParams.has('id');
        const shouldChange = (!showExport && hasId) || (showExport && !hasId);
        if (shouldChange) {
          menuBuilder.buildMenu();
          showExport = !showExport;
        }
      });

      // Open urls in the user's browser
      mainWindow.webContents.setWindowOpenHandler((edata) => {
        shell.openExternal(edata.url);
        return { action: 'deny' };
      });
    });

    await loading.loadURL(resolveHtmlPath('index.html'));
    loading.show();

    // Remove this if your app does not use auto updates
    // eslint-disable-next-line
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
    session.defaultSession.on('will-download', (_event, item) => {
      item.once('done', (_e, state) => {
        if (state === 'completed')
          generalLogger.verbose(
            'Successfully downloaded',
            item.getFilename(),
            'to',
            item.getSavePath()
          );
        else
          generalLogger.verbose(
            'Download failed',
            item.getFilename(),
            'because of',
            chalk.underline(state)
          );
      });
    });
  })
  .catch(generalLogger.error);
