import axios from 'axios';
import { BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { URL } from 'url';
import { getRandomValues } from 'node:crypto';
import { generalLogger } from './logger.ts';

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

function copyDirectoryRecursive(source: string, destination: string) {
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
const isUrlOrPath = (text: string) => {
  if (text.startsWith('http')) return 'url';
  if (isExtMatch(text)) return 'path';
  return 'none';
};

const setAxiosDefaults = (url: URL) => {
  if (url.hostname === 'localhost') {
    // there are issues with IPv6 and Node.JS on certain hardware / operating systems
    // the loopback IP is generally safer
    url.hostname = '127.0.0.1';
  }
  axios.defaults.baseURL = url.origin;
  axios.defaults.headers.common.Connection = 'keep-alive';
  generalLogger.verbose('Base URL set to', axios.defaults.baseURL);
};

// adapted from PlutoHash.js in fonsp/Pluto.jl
export const urlSafeBase64 = (original: string) => {
  return original.replaceAll(/[\+\/\=]/g, (s) => {
    const c = s.charCodeAt(0);
    return c === 43 ? '-' : c === 47 ? '_' : '';
  });
};

export const generateSecret = (length = 8) => {
  if (length <= 0 || !Number.isInteger(length)) {
    throw new Error('Invalid key length');
  }

  const arr = new Uint8Array(Math.ceil((3 * length) / 4));
  getRandomValues(arr);
  const secretBase64 = Buffer.from(arr).toString('base64').slice(0, length);

  return urlSafeBase64(secretBase64);
};

export {
  isExtMatch,
  PLUTO_FILE_EXTENSIONS,
  Loader,
  isUrlOrPath,
  setAxiosDefaults,
  copyDirectoryRecursive,
};
