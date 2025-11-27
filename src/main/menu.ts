import { Menu, dialog, shell } from 'electron';
import type {
  BrowserWindow,
  MenuItemConstructorOptions,
} from 'electron';
import { URL } from 'node:url';

import { PlutoExport } from '../../types/enums.ts';
import Pluto from './pluto.ts';

export default class MenuBuilder {
  private pluto: Pluto;
  private browser: BrowserWindow;
  public hasbuilt: boolean;

  constructor(pluto: Pluto) {
    this.hasbuilt = false;
    this.pluto = pluto;
    this.browser = this.pluto.getBrowserWindow();
  }

  buildMenu = () => {
    this.setupContextMenu(
      process.env.NODE_ENV === 'development' ||
        process.env.DEBUG_PROD === 'true'
    );

    const menu = Menu.buildFromTemplate(this.buildDefaultTemplate());
    this.pluto.getBrowserWindow().setMenu(menu);

    this.hasbuilt = true;
  };

  setupContextMenu(isDebug = false): void {
    const window = this.pluto.getBrowserWindow();
    window.webContents.on('context-menu', (_, props) => {
      const { x, y, linkURL } = props;

      const template = isDebug
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
            new Pluto(linkURL);
          },
        });

      Menu.buildFromTemplate(template).popup({ window });
    });
  }

  buildDefaultTemplate(): MenuItemConstructorOptions[] {
    const show_export = this.showExport();
    const browser = this.pluto.getBrowserWindow();

    /////////////////////////////

    const file: MenuItemConstructorOptions[] = [
      {
        label: 'New window',
        click: async () => {
          new Pluto();
        },
      },
      // {
      //   label: '&New',
      //   accelerator: 'Ctrl+N',
      //   click: async () => {
      //     await Pluto.notebook.open();
      //   },
      // },
      // {
      //   label: '&Open',
      //   accelerator: 'Ctrl+O',
      //   click: async () => {
      //     Pluto.open('path');
      //   },
      // },
      // {
      //   label: 'Copy current URL',
      //   click: async () => {
      //     let url = this.mainWindow.webContents.getURL();
      //     if (!url.includes('secret'))
      //       url += `&secret=${Pluto.runningInfo?.secret}`;
      //     clipboard.writeText(url);
      //   },
      // },
      // {
      //   label: 'Open current URL in browser',
      //   click: async () => {
      //     let url = this.mainWindow.webContents.getURL();
      //     if (!url.includes('secret'))
      //       url += `&secret=${Pluto.runningInfo?.secret}`;
      //     shell.openExternal(url);
      //   },
      // },
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
                      'The file you are looking for was not found on local system.'
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

    /////////////////////////////

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
          this.browser.setFullScreen(!browser.isFullScreen());
        },
      },
      {
        label: 'Toggle &Developer Tools',
        accelerator: 'Alt+Ctrl+I',
        click: () => {
          this.browser.webContents.toggleDevTools();
        },
      },
    ];

    const exportmenu: MenuItemConstructorOptions[] = [
      {
        label: 'Pluto Notebook',
        click: async () => {
          await this.executeIfID(Pluto.notebook.export, PlutoExport.FILE);
        },
      },
      {
        label: 'HTML File',
        click: async () => {
          await this.executeIfID(Pluto.notebook.export, PlutoExport.HTML);
        },
      },
      // {
      //   label: 'Pluto Statefile',
      //   click: async () => {
      //     await this.executeIfID(Pluto.notebook.export, PlutoExport.STATE);
      //   },
      // },
      {
        label: 'PDF File',
        click: async () => {
          await this.executeIfID(Pluto.notebook.export, PlutoExport.PDF);
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
    } catch (error) {
      return false;
    }
  }

  private async executeIfID(
    callback: (id: string, ...extra: any[]) => Promise<void> | void,
    ...extraArgs: any[]
  ) {
    const url = new URL(this.browser.webContents.getURL());
    const id = url.searchParams.get('id');
    if (id) {
      await callback(id, ...extraArgs);
    } else {
      dialog.showErrorBox(
        'Invalid ID',
        'Invalid ID in the url, cannot export.'
      );
    }
  }
}
