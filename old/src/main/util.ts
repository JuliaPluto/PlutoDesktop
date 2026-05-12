import { BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { URL } from 'url';
import { getRandomValues } from 'node:crypto';
import { Globals } from './globals.ts';

/**
 * Just like `fetch`, but with the Pluto URL as the base URL. It also adds the `Connection: keep-alive` header.
 */
export const fetchPluto = (path, init: RequestInit = {}) => {
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

export function copyDirectoryRecursive(source: string, destination: string) {
  // Check if source directory exists
  if (!fs.existsSync(source)) {
    console.error(`Source directory ${source} does not exist.`);
    return;
  }

  // Create destination directory if it does not exist
  if (!fs.existsSync(destination)) {
    fs.mkdirSync(destination);
  }

  // Read the contents of the source directory
  const files = fs.readdirSync(source);

  // Loop through each file in the source directory
  files.forEach((file) => {
    const filePath = path.join(source, file);
    const destFilePath = path.join(destination, file);

    // Check if the current file is a directory
    if (fs.statSync(filePath).isDirectory()) {
      // Recursively copy the directory
      copyDirectoryRecursive(filePath, destFilePath);
    } else {
      // Copy the file
      fs.copyFileSync(filePath, destFilePath);
    }
  });
}

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

/**
 * @param text location of the file
 * @returns type of location
 */
export const isUrlOrPath = (text: string) => {
  if (text.startsWith('http')) return 'url';
  if (isExtMatch(text)) return 'path';
  return 'none';
};
