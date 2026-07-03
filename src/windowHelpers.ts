import Pluto from './pluto.ts';
import { generalLogger } from './logger.ts';

/**
 * Keeps track of all open Pluto windows. When the last window closes,
 * the Pluto server process is shut down.
 */
export class GlobalWindowManager {
  private static instance: GlobalWindowManager;

  private windows: Pluto[] = [];

  static getInstance(): GlobalWindowManager {
    if (!this.instance) {
      this.instance = new GlobalWindowManager();
    }
    return this.instance;
  }

  get plutoWindows(): Pluto[] {
    return [...this.windows];
  }

  registerWindow(pluto: Pluto) {
    this.windows.push(pluto);
    generalLogger.info(`Window registered, ${this.windows.length} open`);
  }

  unregisterWindow(pluto: Pluto) {
    this.windows = this.windows.filter((w) => w !== pluto);
    generalLogger.info(`Window unregistered, ${this.windows.length} open`);

    if (this.windows.length === 0) {
      Pluto.closePlutoFunction?.();
    }
  }

  getWindowByWebContentsId(webContentsId: number): Pluto | undefined {
    return this.windows.find(
      (p) => p.getBrowserWindow().webContents.id === webContentsId,
    );
  }

  static all(f: (p: Pluto) => void) {
    this.getInstance().windows.forEach(f);
  }
}
