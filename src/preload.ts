// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

export type Channels =
  | 'ipc-example'
  | 'PLUTO-OPEN-NOTEBOOK'
  | 'PLUTO-OPEN-MAIN-MENU'
  | 'PLUTO-SHUTDOWN-NOTEBOOK'
  | 'PLUTO-MOVE-NOTEBOOK'
  | 'PLUTO-EXPORT-NOTEBOOK'
  | 'set-block-screen-text';

type PlutoExport = 'file' | 'html' | 'state' | 'pdf';
type OpenNotebookOptions = { newWindow?: boolean };

contextBridge.exposeInMainWorld('plutoDesktop', {
  /**
   * Returns true once the wrapper has detected that the Pluto server is
   * accepting requests at the URL embedded in this page's `pluto_server_url`
   * query parameter, using the secret in `secret`.
   *
   * Use this in the frontend before showing the "lost authentication"
   * dialog: if the backend hasn't reported ready yet, the auth failure is
   * just a startup race and the existing retry/polling will resolve it.
   */
  isBackendLoaded: (): Promise<boolean> =>
    ipcRenderer.invoke('pluto-desktop:is-backend-loaded'),

  openMainMenu(): void {
    ipcRenderer.send('PLUTO-OPEN-MAIN-MENU');
  },

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
    openNotebook(
      type: 'path' | 'url' | 'new' = 'new',
      pathOrURL?: string,
      options?: OpenNotebookOptions,
    ): void {
      ipcRenderer.send('PLUTO-OPEN-NOTEBOOK', type, pathOrURL, options);
    },
    shutdownNotebook(id?: string): void {
      ipcRenderer.send('PLUTO-SHUTDOWN-NOTEBOOK', id);
    },
    moveNotebook(id?: string): void {
      ipcRenderer.send('PLUTO-MOVE-NOTEBOOK', id);
    },
    exportNotebook(id: string, type: PlutoExport): void {
      ipcRenderer.send('PLUTO-EXPORT-NOTEBOOK', id, type);
    },
  },
});
