import { ipcMain } from 'electron';
import { PlutoExport } from '../../types/enums';
import {
  exportNotebook,
  moveNotebook,
  openNotebook,
  shutdownNotebook,
} from './pluto';

ipcMain.on(
  'PLUTO-OPEN-NOTEBOOK',
  async (
    _event,
    type: 'path' | 'url' | 'new' = 'new',
    pathOrURL?: string
  ): Promise<void> => openNotebook(type, pathOrURL)
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

ipcMain.on(
  'PLUTO-EXPORT-NOTEBOOK',
  async (_event, id: string, type: PlutoExport): Promise<void> => {
    await exportNotebook(id, type);
  }
);
