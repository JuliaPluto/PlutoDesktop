import { Pluto } from "../../global.d";

export { Pluto };

declare global {
  interface Window {
    // Expose some Api through preload script
    fs: typeof import("fs");
    ipcRenderer: import("electron").IpcRenderer;
    // removeLoading: () => void;
    electronAPI: {
      handlePlutoURL: (
        callback: (
          event: Electron.IpcRendererEvent,
          value: Pluto.RunPlutoResponse
        ) => void
      ) => import("electron").IpcRenderer;
    };
  }
}
