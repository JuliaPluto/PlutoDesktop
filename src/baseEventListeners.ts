/**
 * This files contains receivers for ipc commands
 * coming from the preload process.
 */

import { BrowserWindow, ipcMain } from 'electron';

import type { PlutoExportType } from './enums.ts';
import Pluto from './pluto.ts';
import { GlobalWindowManager } from './windowHelpers.ts';
import { generalLogger } from './logger.ts';
import { Globals } from './globals.ts';

type OpenNotebookOptions = { newWindow?: boolean };

ipcMain.handle(
  'pluto-desktop:is-backend-loaded',
  async (): Promise<boolean> => Globals.PLUTO_STARTED,
);

ipcMain.on('PLUTO-OPEN-MAIN-MENU', async (): Promise<void> => {
  const { createPlutoWindow } = await import('./index.ts');
  createPlutoWindow();
});

ipcMain.on(
  'PLUTO-OPEN-NOTEBOOK',
  async (
    event,
    type: 'path' | 'url' | 'new' = 'new',
    pathOrURL?: string,
    options?: OpenNotebookOptions,
  ): Promise<void> => {
    const plutoWindow = options?.newWindow
      ? (await import('./index.ts')).createPlutoWindow(null)
      : GlobalWindowManager.getInstance().getWindowByWebContentsId(
          event.sender.id,
        );
    if (!plutoWindow) {
      generalLogger.error(
        'Could not find Pluto window with matching webContentsId',
      );
      return;
    }
    await plutoWindow.open(type, pathOrURL);
  },
);

ipcMain.on('PLUTO-MOVE-NOTEBOOK', async (event, id?: string): Promise<void> => {
  const loc = await Pluto.notebook.move(
    id,
    BrowserWindow.fromWebContents(event.sender),
  );
  event.sender.send('PLUTO-MOVE-NOTEBOOK', loc);
});

ipcMain.on(
  'PLUTO-EXPORT-NOTEBOOK',
  async (event, id: string, type: PlutoExportType): Promise<void> => {
    await Pluto.notebook.export(
      id,
      type,
      BrowserWindow.fromWebContents(event.sender),
    );
  },
);
