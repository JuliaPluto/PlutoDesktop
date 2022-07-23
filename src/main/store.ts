import Store from 'electron-store';
import fs from 'fs';

const store = new Store<SettingsStore>();

const userStore = new Store<UserSettingsStore>({ name: 'user-config' });

const openUserStoreInEditor = () => {
  if (!fs.existsSync(userStore.path)) fs.writeFileSync(userStore.path, '{}');
  userStore.openInEditor();
};

export { store, userStore, openUserStoreInEditor };
