import { app, BrowserWindow, dialog } from 'electron';
import Store from 'electron-store';
import fs from 'fs';

/**
 * This store contains all the internal config data.
 * This is **not** meant to be overwritten manually.
 * Please provide migrations if needed.
 */
const store = new Store<SettingsStore>({
  migrations: {
    '0.0.2-alpha': (s) => {
      s.clear();
    },
    '0.0.2': (s) => {
      s.clear();
    },
    '0.0.3': (s) => {
      s.clear();
    },
    '0.1.0': (s) => {
      s.clear();
    },
  },
});

export { store };
