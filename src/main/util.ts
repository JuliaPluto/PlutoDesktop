import axios from 'axios';
import { BrowserWindow } from 'electron';
import path from 'path';
import { URL } from 'url';
import { generalLogger } from './logger';

export let resolveHtmlPath: (htmlFileName: string) => string = (
  htmlFileName: string
) => {
  return `file://${path.resolve(__dirname, '../assets/', htmlFileName)}`;
};

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
const isExtMatch = (file: string) =>
  PLUTO_FILE_EXTENSIONS.some((ext) => file.endsWith(ext));

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

export {
  isExtMatch,
  PLUTO_FILE_EXTENSIONS,
  Loader,
  isUrlOrPath,
  setAxiosDefaults,
};
