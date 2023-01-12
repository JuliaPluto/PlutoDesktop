import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  Menu,
  MenuItemConstructorOptions,
  shell,
} from 'electron';
import { URL } from 'node:url';

import { PlutoExport } from '../../types/enums';
import Pluto from './pluto';
import { PLUTO_FILE_EXTENSIONS } from './util';

interface DarwinMenuItemConstructorOptions extends MenuItemConstructorOptions {
  selector?: string;
  submenu?: DarwinMenuItemConstructorOptions[] | Menu;
}

export default class MenuBuilder {
  private mainWindow: BrowserWindow;

  private _hasbuilt: boolean;

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
    this._hasbuilt = false;
    this._createWindow = createWindow;
  }

  buildMenu = () => {
    this.setupContextMenu(
      process.env.NODE_ENV === 'development' ||
        process.env.DEBUG_PROD === 'true'
    );

    const template =
      process.platform === 'darwin'
        ? this.buildDarwinTemplate()
        : this.buildDefaultTemplate();

    const menu = Menu.buildFromTemplate(template);
    this.mainWindow.setMenu(menu);

    this._hasbuilt = true;
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

  buildDarwinTemplate(): MenuItemConstructorOptions[] {
    const subMenuAbout: DarwinMenuItemConstructorOptions = {
      label: 'Electron',
      submenu: [
        {
          label: 'About ElectronReact',
          selector: 'orderFrontStandardAboutPanel:',
        },
        { type: 'separator' },
        { label: 'Services', submenu: [] },
        { type: 'separator' },
        {
          label: 'Hide ElectronReact',
          accelerator: 'Command+H',
          selector: 'hide:',
        },
        {
          label: 'Hide Others',
          accelerator: 'Command+Shift+H',
          selector: 'hideOtherApplications:',
        },
        { label: 'Show All', selector: 'unhideAllApplications:' },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: 'Command+Q',
          click: () => {
            app.quit();
          },
        },
      ],
    };
    const subMenuEdit: DarwinMenuItemConstructorOptions = {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'Command+Z', selector: 'undo:' },
        { label: 'Redo', accelerator: 'Shift+Command+Z', selector: 'redo:' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'Command+X', selector: 'cut:' },
        { label: 'Copy', accelerator: 'Command+C', selector: 'copy:' },
        { label: 'Paste', accelerator: 'Command+V', selector: 'paste:' },
        {
          label: 'Select All',
          accelerator: 'Command+A',
          selector: 'selectAll:',
        },
      ],
    };
    const subMenuViewDev: MenuItemConstructorOptions = {
      label: 'View',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'Command+R',
          click: () => {
            this.mainWindow.webContents.reload();
          },
        },
        {
          label: 'Toggle Full Screen',
          accelerator: 'Ctrl+Command+F',
          click: () => {
            this.mainWindow.setFullScreen(!this.mainWindow.isFullScreen());
          },
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'Alt+Command+I',
          click: () => {
            this.mainWindow.webContents.toggleDevTools();
          },
        },
      ],
    };
    const subMenuViewProd: MenuItemConstructorOptions = {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Full Screen',
          accelerator: 'Ctrl+Command+F',
          click: () => {
            this.mainWindow.setFullScreen(!this.mainWindow.isFullScreen());
          },
        },
      ],
    };
    const subMenuWindow: DarwinMenuItemConstructorOptions = {
      label: 'Window',
      submenu: [
        {
          label: 'Minimize',
          accelerator: 'Command+M',
          selector: 'performMiniaturize:',
        },
        { label: 'Close', accelerator: 'Command+W', selector: 'performClose:' },
        { type: 'separator' },
        { label: 'Bring All to Front', selector: 'arrangeInFront:' },
      ],
    };

    const subMenuView =
      process.env.NODE_ENV === 'development' ||
      process.env.DEBUG_PROD === 'true'
        ? subMenuViewDev
        : subMenuViewProd;

    return [subMenuAbout, subMenuEdit, subMenuView, subMenuWindow];
  }

  buildDefaultTemplate() {
    const templateDefault = [
      {
        label: '&File',
        submenu: [
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
          {
            label: '&New',
            accelerator: 'Ctrl+N',
            click: async () => {
              await Pluto.notebook.open();
            },
          },
          {
            label: 'Copy current URL',
            click: async () => {
              let url = this.mainWindow.webContents.getURL();
              if (!url.includes('secret'))
                url += `&secret=${Pluto.runningInfo?.secret}`;
              clipboard.writeText(url);
            },
          },
          {
            label: 'Open current URL in browser',
            click: async () => {
              let url = this.mainWindow.webContents.getURL();
              if (!url.includes('secret'))
                url += `&secret=${Pluto.runningInfo?.secret}`;
              shell.openExternal(url);
            },
          },
        ],
      },
      {
        label: '&View',
        submenu:
          process.env.NODE_ENV === 'development' ||
          process.env.DEBUG_PROD === 'true'
            ? [
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
                    this.mainWindow.setFullScreen(
                      !this.mainWindow.isFullScreen()
                    );
                  },
                },
                {
                  label: 'Toggle &Developer Tools',
                  accelerator: 'Alt+Ctrl+I',
                  click: () => {
                    this.mainWindow.webContents.toggleDevTools();
                  },
                },
              ]
            : [
                {
                  label: 'Toggle &Full Screen',
                  accelerator: 'F11',
                  click: () => {
                    this.mainWindow.setFullScreen(
                      !this.mainWindow.isFullScreen()
                    );
                  },
                },
              ],
      },
    ];

    if (this.showExport()) {
      templateDefault[0].submenu.push({
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
      });
      templateDefault.push({
        label: 'Export',
        submenu: [
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
          {
            label: 'Pluto Statefile',
            click: async () => {
              await this.executeIfID(Pluto.notebook.export, PlutoExport.STATE);
            },
          },
          {
            label: 'PDF File',
            click: async () => {
              await this.executeIfID(Pluto.notebook.export, PlutoExport.PDF);
            },
          },
        ],
      });
    }

    templateDefault[0].submenu.push({
      label: '&Close',
      accelerator: 'Ctrl+W',
      click: async () => {
        this.mainWindow.close();
      },
    });

    return templateDefault;
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

  public get hasbuilt(): boolean {
    return this._hasbuilt;
  }

  public set hasbuilt(value: boolean) {
    this._hasbuilt = value;
  }
}
