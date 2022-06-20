import { Channels } from 'main/preload';

declare global {
  interface Window {
    electron: {
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
         * @param path path to a notebook, if already selected
         * @param forceNew [default = false] If false and valid path is there,
         * opens that notebook. If false and no path is there, opens the file selector.
         * If true, opens a new blank notebook.
         */
        openNotebook(path?: string, forceNew?: boolean): void;
        shutdownNotebook(id?: string): void;
        moveNotebook(id?: string): void;
      };
    };
  }
}

export {};
