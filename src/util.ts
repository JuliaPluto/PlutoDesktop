import { BrowserWindow } from 'electron';
import { URL } from 'url';
import { Globals } from './globals.ts';

/**
 * Just like `fetch`, but with the Pluto URL as the base URL. It also adds the `Connection: keep-alive` header.
 */
export const fetchPluto = (
  path: string | { toString: () => string },
  init: RequestInit = {},
) => {
  return fetch(new URL(path, Globals.PLUTO_URL), {
    ...init,
    headers: {
      ...init.headers,
      Connection: 'keep-alive',
    },
  });
};

export const withSearchParams = (
  input: string | URL,
  params: Record<string, string>,
) => {
  const url = new URL(input, Globals.PLUTO_URL);

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return url;
};

export const PLUTO_FILE_EXTENSIONS = [
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
export const isExtMatch = (file: string) =>
  PLUTO_FILE_EXTENSIONS.some((ext) => file.endsWith(ext));

/**
 * This is a loader, it simply inserts custom cursor
 * loading css into the window, and can also remove it.
 */
export class Loader {
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
      Loader.POINTER_LOADING_CSS,
    );
  };

  stopLoading = async () => {
    await this._window.webContents.removeInsertedCSS(this._key!);
  };
}
