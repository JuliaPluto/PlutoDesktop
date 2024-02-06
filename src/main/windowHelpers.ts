import { BrowserWindow, app, nativeTheme } from 'electron';
import * as path from 'node:path';
import { getAssetPath } from './paths';
import Pluto from './pluto';
import { randomUUID } from 'node:crypto';

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

type WindowList = { id: string; window: Pluto }[];
export class GlobalWindowManager {
  private static instance: GlobalWindowManager;
  /**
   * Maps window identifier to its associated BrowserWindow
   */
  private windowList: WindowList;
  private constructor() {
    this.windowList = [];
  }
  static getInstance(): GlobalWindowManager {
    if (!this.instance) {
      this.instance = new GlobalWindowManager();
    }
    return this.instance;
  }
  get plutoWindows(): Pluto[] {
    return this.windowList.map((x) => x.window);
  }
  getPlutoWindowById(id: string): Pluto | undefined {
    return this.windowList.find((x) => x.id === id)?.window;
  }
  registerWindow(pluto: Pluto): string {
    const id = randomUUID();
    pluto.setId(id);
    this.windowList.push({
      id,
      window: pluto,
    });
    return id;
  }
  getWindowByWebContentsId(webContentsId: number): Pluto | undefined {
    return this.windowList.find(
      (x) => x.window.getBrowserWindow().webContents.id === webContentsId
    )?.window;
  }
}
