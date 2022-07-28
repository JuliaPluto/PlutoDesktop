/* eslint import/prefer-default-export: off, import/no-mutable-exports: off */
import { URL } from 'url';
import path from 'path';
import { BrowserWindow } from 'electron';

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

const isExtMatch = (file: string) => {
  for (let index = 0; index < PLUTO_FILE_EXTENSIONS.length; index += 1) {
    const ext = PLUTO_FILE_EXTENSIONS[index];
    if (file.endsWith(ext)) return true;
  }
  return false;
};

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

const isUrlOrPath = (text: string) => {
  if (text.startsWith('http')) return 'url';
  if (isExtMatch(text)) return 'path';
  return 'none';
};

export { isExtMatch, PLUTO_FILE_EXTENSIONS, Loader, tryCatch, isUrlOrPath };
