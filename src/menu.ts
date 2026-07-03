import { Menu, dialog, shell } from 'electron';
import type { BrowserWindow, MenuItemConstructorOptions } from 'electron';
import { URL } from 'node:url';

import { PlutoExport } from './enums.ts';
import Pluto from './pluto.ts';
import { createPlutoWindow } from './index.ts';
import { getLogsFolder } from './logger.ts';

export default class MenuBuilder {
  private pluto: Pluto;
  private browser: BrowserWindow;
  private contextMenuSetup: boolean;
  public hasbuilt: boolean;

  constructor(pluto: Pluto) {
    this.hasbuilt = false;
    this.contextMenuSetup = false;
    this.pluto = pluto;
    this.browser = this.pluto.getBrowserWindow();
  }

  buildMenu = () => {
    if (!this.contextMenuSetup) {
      this.setupContextMenu(
        process.env.NODE_ENV === 'development' ||
          process.env.DEBUG_PROD === 'true',
      );
      this.contextMenuSetup = true;
    }

    const menu = Menu.buildFromTemplate(this.buildDefaultTemplate());
    Menu.setApplicationMenu(menu); // Works on macOS + Windows

    this.hasbuilt = true;
  };

  setupContextMenu(isDebug = false): void {
    const window = this.browser;
    window.webContents.on('context-menu', (_, props) => {
      const { x, y, linkURL } = props;

      const template: MenuItemConstructorOptions[] = isDebug
        ? [
            {
              label: 'Inspect element',
              click: () => {
                window.webContents.inspectElement(x, y);
              },
            },
          ]
        : [];

      if (linkURL.length > 0)
        template.push({
          label: 'Open in new window',
          click: () => {
            createPlutoWindow(linkURL);
          },
        });

      Menu.buildFromTemplate(template).popup({ window });
    });
  }

  buildDefaultTemplate(): MenuItemConstructorOptions[] {
    const show_export = this.showExport();

    const file: MenuItemConstructorOptions[] = [
      {
        label: 'New window',
        click: async () => {
          createPlutoWindow();
        },
      },
      ...(show_export
        ? [
            {
              label: 'Reveal in File Explorer',
              accelerator: 'Shift+Alt+R',
              click: async () => {
                this.executeIfID(async (id) => {
                  const res = await Pluto.notebook.getFile(id);
                  if (res) shell.showItemInFolder(res);
                  else
                    dialog.showErrorBox(
                      'FILE NOT FOUND',
                      'The file you are looking for was not found on local system.',
                    );
                });
              },
            },
          ]
        : []),
      {
        label: '&Close',
        accelerator: 'Ctrl+W',
        click: async () => {
          this.pluto.close();
        },
      },
    ];

    const view: MenuItemConstructorOptions[] = [
      {
        label: '&Reload',
        accelerator: 'Ctrl+R',
        click: () => {
          this.browser.webContents.reload();
        },
      },
      {
        label: 'Toggle &Full Screen',
        accelerator: 'F11',
        click: () => {
          this.browser.setFullScreen(!this.browser.isFullScreen());
        },
      },
      {
        label: 'Toggle &Developer Tools',
        accelerator: 'Alt+Ctrl+I',
        click: () => {
          this.browser.webContents.toggleDevTools();
        },
      },
      {
        label: 'Open Logs Folder',
        click: async () => {
          const errorMessage = await shell.openPath(getLogsFolder());
          if (errorMessage) {
            dialog.showErrorBox('Could not open logs folder', errorMessage);
          }
        },
      },
    ];

    const exportmenu: MenuItemConstructorOptions[] = [
      {
        label: 'Pluto Notebook',
        click: async () => {
          await this.executeIfID(
            Pluto.notebook.export,
            PlutoExport.FILE,
            this.browser,
          );
        },
      },
      {
        label: 'HTML File',
        click: async () => {
          await this.executeIfID(
            Pluto.notebook.export,
            PlutoExport.HTML,
            this.browser,
          );
        },
      },
      {
        label: 'PDF File',
        click: async () => {
          await this.executeIfID(
            Pluto.notebook.export,
            PlutoExport.PDF,
            this.browser,
          );
        },
      },
    ];

    return [
      {
        label: '&File',
        submenu: file,
      },
      {
        label: '&View',
        submenu: view,
      },
      ...(show_export
        ? [
            {
              label: '&Export',
              submenu: exportmenu,
            },
          ]
        : []),
    ];
  }

  showExport() {
    try {
      const url = new URL(this.browser.webContents.getURL());
      return url.searchParams.has('id');
    } catch {
      return false;
    }
  }

  private async executeIfID<Extra extends unknown[]>(
    callback: (id: string, ...extra: Extra) => Promise<void> | void,
    ...extraArgs: Extra
  ) {
    const url = new URL(this.browser.webContents.getURL());
    const id = url.searchParams.get('id');
    if (id) {
      await callback(id, ...extraArgs);
    } else {
      dialog.showErrorBox(
        'Invalid ID',
        'Invalid ID in the url, cannot export.',
      );
    }
  }
}
