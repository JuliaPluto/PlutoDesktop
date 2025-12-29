import Store from 'electron-store';

/**
 * This store contains all the internal config data.
 * This is **not** meant to be overwritten manually.
 * Please provide migrations if needed.
 */
const store = new Store<SettingsStore>({
  migrations: {
    '0.0.2-alpha': (s: Store<SettingsStore>) => {
      (s as any).clear();
    },
    '0.0.2': (s: Store<SettingsStore>) => {
      (s as any).clear();
    },
    '0.0.3': (s: Store<SettingsStore>) => {
      (s as any).clear();
    },
    '0.1.0': (s: Store<SettingsStore>) => {
      (s as any).clear();
    },
  },
});

export { store };
