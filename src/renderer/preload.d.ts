import { Channels } from 'main/preload';

import { PlutoExport } from '../../types/enums';

declare global {
  interface Window {
    plutoDesktop: {
      ipcRenderer: {
        sendMessage(channel: Channels, args: unknown[]): void;
        on(
          channel: string,
          func: (...args: unknown[]) => void
        ): (() => void) | undefined;
        once(channel: string, func: (...args: unknown[]) => void): void;
      };
      fileSystem: {
        /**
         * @param type [default = 'new'] whether you want to open a new notebook
         * open a notebook from a path or from a url
         * @param pathOrURL location to the file, not needed if opening a new file,
         * opens that notebook. If false and no path is there, opens the file selector.
         * If true, opens a new blank notebook.
         */
        openNotebook(type?: 'url' | 'path' | 'new', pathOrURL?: string): void;
        shutdownNotebook(id?: string): void;
        moveNotebook(id?: string): void;
        exportNotebook(id: string, type: PlutoExport): void;
      };
    };
  }
}

export {};
