import { app, ipcMain } from 'electron';
import log from 'electron-log';
import { moveNotebook, openNotebook, shutdownNotebook } from './pluto';

app.on('open-url', (_, url) => {
  log.info(`Url changed to ${url}`);
});

ipcMain.on(
  'PLUTO-OPEN-NOTEBOOK',
  async (_event, path?: string, forceNew?: boolean): Promise<void> =>
    openNotebook(path, forceNew)
);

ipcMain.on(
  'PLUTO-SHUTDOWN-NOTEBOOK',
  async (_event, id?: string): Promise<void> => shutdownNotebook(id)
);

ipcMain.on(
  'PLUTO-MOVE-NOTEBOOK',
  async (_event, id?: string): Promise<void> => {
    const loc = await moveNotebook(id);
    _event.sender.send('PLUTO-MOVE-NOTEBOOK', loc);
  }
);
