import Pluto from './pluto';
import { randomUUID } from 'node:crypto';
import { generalLogger } from './logger';

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
    generalLogger.info(`Window registered with id=${id}`);
    return id;
  }
  unregisterWindow(pluto: Pluto) {
    this.windowList = this.windowList.filter((x) => x.id !== pluto.getId());
    generalLogger.info(`Window unregistered with id=${pluto.getId()}`);
  }
  getWindowByWebContentsId(webContentsId: number): Pluto | undefined {
    return this.windowList.find(
      (x) => x.window.getBrowserWindow().webContents.id === webContentsId
    )?.window;
  }

  static all(f: (p: Pluto) => void) {
    this.getInstance().plutoWindows.forEach(f);
  }
}
