/**
 * This files contains receivers for ipc commands
 * comming from preload process
 */

import { ipcMain } from 'electron';

import { PlutoExport } from '../../types/enums';
import Pluto from './pluto';

ipcMain.on(
  'PLUTO-OPEN-NOTEBOOK',
  async (
    _event,
    type: 'path' | 'url' | 'new' = 'new',
    pathOrURL?: string
  ): Promise<void> => Pluto.getInstance().open(type, pathOrURL)
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
