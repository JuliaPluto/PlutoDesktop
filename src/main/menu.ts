import {
  BrowserWindow,
  dialog,
  Menu,
  MenuItemConstructorOptions,
  shell,
} from 'electron';
import { URL } from 'node:url';

import { PlutoExport } from '../../types/enums';
import Pluto from './pluto';
import { PLUTO_FILE_EXTENSIONS } from './util';

export default class MenuBuilder {
  private mainWindow: BrowserWindow;

  public hasbuilt: boolean;

  private _createWindow: (
    url?: string,
    project?: string,
    notebook?: string,
    forceNew?: boolean
  ) => Promise<void>;

  constructor(
    mainWindow: BrowserWindow,
    createWindow: (
      url?: string,
      project?: string,
      notebook?: string,
      forceNew?: boolean
    ) => Promise<void>
  ) {
    this.mainWindow = mainWindow;
    this.hasbuilt = false;
    this._createWindow = createWindow;
  }

  buildMenu = () => {
    this.setupContextMenu(
      process.env.NODE_ENV === 'development' ||
        process.env.DEBUG_PROD === 'true'
    );

    const menu = Menu.buildFromTemplate(this.buildDefaultTemplate());
    this.mainWindow.setMenu(menu);

    this.hasbuilt = true;
  };

  setupContextMenu(isDebug = false): void {
    this.mainWindow.webContents.on('context-menu', (_, props) => {
      const { x, y, linkURL } = props;

      const template = isDebug
        ? [
            {
              label: 'Inspect element',
              click: () => {
                this.mainWindow.webContents.inspectElement(x, y);
              },
            },
          ]
        : [];

      if (linkURL.length > 0)
        template.push({
          label: 'Open in new window',
          click: () => {
            this._createWindow(linkURL);
          },
        });

      Menu.buildFromTemplate(template).popup({ window: this.mainWindow });
    });
  }

  buildDefaultTemplate(): MenuItemConstructorOptions[] {
    const show_export = this.showExport();

    /////////////////////////////

    const file: MenuItemConstructorOptions[] = [
      {
        label: '&New',
        accelerator: 'Ctrl+N',
        click: async () => {
          await Pluto.notebook.open();
        },
      },
      {
        label: '&Open',
        accelerator: 'Ctrl+O',
        click: async () => {
          await Pluto.notebook.open('path');
        },
      },
      {
        label: 'Open in new window',
        accelerator: 'Ctrl+Shift+O',
        click: async () => {
          const r = await dialog.showOpenDialog(this.mainWindow, {
            message: 'Please select a Pluto Notebook.',
            filters: [
              {
                name: 'Pluto Notebook',
                extensions: PLUTO_FILE_EXTENSIONS.map((v) => v.slice(1)),
              },
            ],
            properties: ['openFile'],
          });

          if (r.canceled) return;

          const [path] = r.filePaths;
          await this._createWindow(undefined, undefined, path);
        },
      },
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
          this.mainWindow.close();
        },
      },
    ];

    /////////////////////////////

    const view: MenuItemConstructorOptions[] = [
      {
        label: '&Reload',
        accelerator: 'Ctrl+R',
        click: () => {
          this.mainWindow.webContents.reload();
        },
      },
      {
        label: 'Toggle &Full Screen',
        accelerator: 'F11',
        click: () => {
          this.mainWindow.setFullScreen(!this.mainWindow.isFullScreen());
        },
      },
      {
        label: 'Toggle &Developer Tools',
        accelerator: 'Alt+Ctrl+I',
        click: () => {
          this.mainWindow.webContents.toggleDevTools();
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
      const url = new URL(this.mainWindow.webContents.getURL());
      return url.searchParams.has('id');
    } catch (error) {
      return false;
    }
  }

  private async executeIfID(
    callback: (id: string, ...extra: any[]) => Promise<void> | void,
    ...extraArgs: any[]
  ) {
    const url = new URL(this.mainWindow.webContents.getURL());
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
