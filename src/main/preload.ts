import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

import { PlutoExport } from '../../types/enums';

export type Channels = 'ipc-example';

contextBridge.exposeInMainWorld('plutoDesktop', {
  ipcRenderer: {
    sendMessage(channel: Channels, args: unknown[]) {
      ipcRenderer.send(channel, args);
    },
    on(channel: Channels, func: (...args: unknown[]) => void) {
      const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
        func(...args);
      ipcRenderer.on(channel, subscription);

      return () => ipcRenderer.removeListener(channel, subscription);
    },
    once(channel: Channels, func: (...args: unknown[]) => void) {
      ipcRenderer.once(channel, (_event, ...args) => func(...args));
    },
  },
  fileSystem: {
    openNotebook(type?: 'url' | 'path' | 'new', pathOrURL?: string) {
      ipcRenderer.send('PLUTO-OPEN-NOTEBOOK', type, pathOrURL);
    },
    shutdownNotebook(id?: string) {
      ipcRenderer.send('PLUTO-SHUTDOWN-NOTEBOOK', id);
    },
    moveNotebook(id?: string) {
      ipcRenderer.send('PLUTO-MOVE-NOTEBOOK', id);
    },
    exportNotebook(
      id: string,
      type: (typeof PlutoExport)[keyof typeof PlutoExport],
    ) {
      ipcRenderer.send('PLUTO-EXPORT-NOTEBOOK', id, type);
    },
  },
});
