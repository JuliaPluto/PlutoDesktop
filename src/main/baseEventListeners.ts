/**
 * This files contains receivers for ipc commands
 * comming from preload process
 */

import { ipcMain } from 'electron';

import { PlutoExport } from '../../types/enums';
import Pluto from './pluto';
import { GlobalWindowManager } from './windowHelpers';
import { generalLogger } from './logger';

ipcMain.on(
  'PLUTO-OPEN-NOTEBOOK',
  async (
    event,
    type: 'path' | 'url' | 'new' = 'new',
    pathOrURL?: string
  ): Promise<void> => {
    const plutoWindow =
      GlobalWindowManager.getInstance().getWindowByWebContentsId(
        event.sender.id
      );
    if (!plutoWindow) {
      generalLogger.error(
        'Could not find Pluto window with matching webContentsId'
      );
      return;
    }
    Pluto.open(type, pathOrURL);
  }
);

ipcMain.on(
  'PLUTO-SHUTDOWN-NOTEBOOK',
  async (_event, id?: string): Promise<void> => Pluto.notebook.shutdown(id)
);

ipcMain.on(
  'PLUTO-MOVE-NOTEBOOK',
  async (_event, id?: string): Promise<void> => {
    const loc = await Pluto.notebook.move(id);
    _event.sender.send('PLUTO-MOVE-NOTEBOOK', loc);
  }
);

ipcMain.on(
  'PLUTO-EXPORT-NOTEBOOK',
  async (_event, id: string, type: PlutoExport): Promise<void> => {
    await Pluto.notebook.export(id, type);
  }
);
