/**
 * Example of 'electron-store' usage.
 */
import { ipcMain } from "electron";
import Store from "electron-store";

/**
 * Expose 'electron-store' to Renderer-process through 'ipcMain.handle'
 */
const store = new Store();
ipcMain.handle(
  "electron-store",
  async (_event, methodSign: string, ...args: any[]) => {
    if (typeof (store as any)[methodSign] === "function") {
      return (store as any)[methodSign](...args);
    }
    return (store as any)[methodSign];
  }
);

const saveSetting = (key: string, value: string) => {
  store.set(key, value);
  store.openInEditor();
};

export { saveSetting };
