declare module "electrobun/bun" {
  export type ElectrobunConfig = {
    app: {
      name: string;
      identifier: string;
      version: string;
      description?: string;
      fileAssociations?: Array<{
        ext: string[];
        name: string;
        role?: "Editor" | "Viewer" | "Shell" | "None";
        icon?: string;
      }>;
    };
    runtime?: Record<string, unknown>;
    build?: Record<string, unknown>;
    scripts?: Record<string, string>;
    release?: Record<string, unknown>;
  };

  type MenuItem = {
    type?: "normal" | "divider" | "separator";
    label?: string;
    action?: string;
    role?: string;
    data?: unknown;
    submenu?: MenuItem[];
    enabled?: boolean;
    checked?: boolean;
    hidden?: boolean;
    accelerator?: string;
  };

  type EventHandler = (event: unknown) => void | Promise<void>;

  export class BrowserWindow {
    id: number;
    webview: BrowserView;
    constructor(options: {
      title?: string;
      url?: string | null;
      html?: string | null;
      frame?: { x?: number; y?: number; width?: number; height?: number };
      renderer?: "native" | "cef";
      navigationRules?: string | null;
      hidden?: boolean;
    });
    on(name: string, handler: EventHandler): void;
    close(): void;
    activate(): void;
    setTitle(title: string): void;
    setFullScreen(fullScreen: boolean): void;
    isFullScreen(): boolean;
  }

  export class BrowserView {
    id: number;
    url: string | null;
    on(name: string, handler: EventHandler): void;
    loadURL(url: string): void;
    loadHTML(html: string): void;
    toggleDevTools(): void;
  }

  export const ApplicationMenu: {
    setApplicationMenu(menu: MenuItem[]): void;
    on(name: "application-menu-clicked", handler: EventHandler): void;
  };

  export const Utils: {
    quit(): void;
    openExternal(url: string): boolean;
    showItemInFolder(path: string): boolean;
    openFileDialog(options?: {
      startingFolder?: string;
      allowedFileTypes?: string;
      canChooseFiles?: boolean;
      canChooseDirectory?: boolean;
      allowsMultipleSelection?: boolean;
    }): Promise<string[]>;
    showMessageBox(options?: {
      type?: "info" | "warning" | "error" | "question";
      title?: string;
      message?: string;
      detail?: string;
      buttons?: string[];
      defaultId?: number;
      cancelId?: number;
    }): Promise<{ response: number }>;
  };

  export const Updater: {
    checkForUpdate(): Promise<{
      version: string;
      hash: string;
      updateAvailable: boolean;
      updateReady: boolean;
      error: string;
    }>;
    downloadUpdate(): Promise<void>;
    applyUpdate(): Promise<void>;
  };

  const Electrobun: {
    events: {
      on(name: string, handler: EventHandler): void;
    };
  };

  export default Electrobun;
}
