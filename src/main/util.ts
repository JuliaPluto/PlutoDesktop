/* eslint import/no-mutable-exports: off */

import axios from 'axios';
import { app, BrowserWindow, dialog } from 'electron';
import msgpack from 'msgpack-lite';
import path from 'path';
import { URL } from 'url';
import isDev from 'electron-is-dev';

import { exec } from 'child_process';
import { generalLogger } from './logger';

export let resolveHtmlPath: (htmlFileName: string) => string;

if (process.env.NODE_ENV === 'development') {
  const port = process.env.PORT || 1212;
  resolveHtmlPath = (htmlFileName: string) => {
    const url = new URL(`http://localhost:${port}`);
    url.pathname = htmlFileName;
    return url.href;
  };
} else {
  resolveHtmlPath = (htmlFileName: string) => {
    return `file://${path.resolve(__dirname, '../renderer/', htmlFileName)}`;
  };
}

/**
 * These are the extensions supported by Pluto.jl
 */
const PLUTO_FILE_EXTENSIONS = [
  '.pluto.jl',
  '.Pluto.jl',
  '.nb.jl',
  '.jl',
  '.plutojl',
  '.pluto',
  '.nbjl',
  '.pljl',
  '.pluto.jl.txt',
  '.jl.txt',
];

/**
 * @param file location
 * @returns whether the current file is a supported file or not
 */
const isExtMatch = (file: string) => {
  for (let index = 0; index < PLUTO_FILE_EXTENSIONS.length; index += 1) {
    const ext = PLUTO_FILE_EXTENSIONS[index];
    if (file.endsWith(ext)) return true;
  }
  return false;
};

/**
 * This is a loader, it simply inserts custom cursor
 * loading css into the window, and can also remove it.
 */
class Loader {
  private _window: BrowserWindow;

  private _key: string | null;

  static POINTER_LOADING_CSS: string = '* {cursor: progress !important;}';

  constructor(w: BrowserWindow, autoStart = true) {
    this._window = w;
    this._key = null;
    if (autoStart) this.startLoading();
  }

  startLoading = async () => {
    this._key = await this._window.webContents.insertCSS(
      Loader.POINTER_LOADING_CSS
    );
  };

  stopLoading = async () => {
    await this._window.webContents.removeInsertedCSS(this._key!);
  };
}

const tryCatch = async (
  executable: (...args: any[]) => Promise<void>,
  catchExec?: (...args: any[]) => Promise<void>
) => {
  try {
    await executable();
  } catch (error) {
    if (catchExec) await catchExec();
  }
};

/**
 * @param text location of the file
 * @returns type of location
 */
const isUrlOrPath = (text: string) => {
  if (text.startsWith('http')) return 'url';
  if (isExtMatch(text)) return 'path';
  return 'none';
};

const setAxiosDefaults = (url: PlutoURL) => {
  axios.defaults.baseURL = new URL(url.url).origin;
  axios.defaults.headers.common.Connection = 'keep-alive';
  generalLogger.verbose('Base URL set to', axios.defaults.baseURL);
};

/**
 * Decodes data received from Pluto.jl shutdown query
 * @param data Buffer
 * @returns map of id -> location
 */
const decodeMapFromBuffer = (data: Buffer) => {
  const decodedData = msgpack.decode(data);
  return decodedData;
};

interface AskForAdminRightsParams {
  errorTitle: string;
  errorMessage: string;
}

const defaultAskForAdminRightsParams: AskForAdminRightsParams = {
  errorTitle: 'ADMIN PERMISSIONS NOT AVAILABLE',
  errorMessage:
    'System image not available, to create it the application needs admin privileges. Please close the app and run again using right clicking and using "Run as administrator".',
};

const askForAdminRights = (
  args: AskForAdminRightsParams = defaultAskForAdminRightsParams
) => {
  if (!isDev)
    exec('NET SESSION', (_error, _so, se) => {
      if (se.length === 0) {
        // admin
      } else {
        // no admin
        dialog.showErrorBox(args.errorTitle, args.errorMessage);
        app.quit();
      }
    });
};

export {
  isExtMatch,
  PLUTO_FILE_EXTENSIONS,
  Loader,
  tryCatch,
  isUrlOrPath,
  setAxiosDefaults,
  decodeMapFromBuffer,
  askForAdminRights,
};
