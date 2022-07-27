import { app, BrowserWindow, dialog } from 'electron';
import Store from 'electron-store';
import fs from 'fs';

const store = new Store<SettingsStore>();

const userStore = new Store<UserSettingsStore>({ name: 'user-config' });

userStore.onDidAnyChange(async () => {
  const window = BrowserWindow.getFocusedWindow();
  if (window) {
    const { response } = await dialog.showMessageBox(window, {
      title: 'Restart needed!',
      message:
        'Looks like user-config.json has been changed, Application needs to restart in order to apply these changes',
      buttons: ['Restart now', 'Apply changes later'],
      cancelId: 1,
      noLink: true,
    });
    if (response === 0) {
      app.relaunch();
      app.exit();
    }
  }
});

const openUserStoreInEditor = () => {
  if (!fs.existsSync(userStore.path)) fs.writeFileSync(userStore.path, '{}');
  userStore.openInEditor();
};

export { store, userStore, openUserStoreInEditor };
