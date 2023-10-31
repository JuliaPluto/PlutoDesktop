import { BrowserWindow, app, nativeTheme } from 'electron';
import * as path from 'node:path';
import { getAssetPath } from './paths';

export function createPlutoWindow() {
  const win = new BrowserWindow({
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
  win.setMenuBarVisibility(false);

  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools();
  }

  return win;
}
