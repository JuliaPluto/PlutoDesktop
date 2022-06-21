/* eslint-disable no-underscore-dangle */
import {
  app,
  Menu,
  shell,
  BrowserWindow,
  MenuItemConstructorOptions,
  dialog,
} from 'electron';
import { URL } from 'node:url';
import { PlutoExport } from '../../types/enums';
import { exportNotebook, openNotebook } from './pluto';
import { PLUTO_FILE_EXTENSIONS } from './util';

interface DarwinMenuItemConstructorOptions extends MenuItemConstructorOptions {
  selector?: string;
  submenu?: DarwinMenuItemConstructorOptions[] | Menu;
}

export default class MenuBuilder {
  mainWindow: BrowserWindow;

  private _createWindow: (
    url?: string,
    project?: string,
    notebook?: string
  ) => Promise<void>;

  constructor(
    mainWindow: BrowserWindow,
    createWindow: (
      url?: string,
      project?: string,
      notebook?: string
    ) => Promise<void>
  ) {
    this.mainWindow = mainWindow;
    this._createWindow = createWindow;
  }

  buildMenu(): Menu {
    this.setupContextMenu(
      process.env.NODE_ENV === 'development' ||
        process.env.DEBUG_PROD === 'true'
    );

    const template =
      process.platform === 'darwin'
        ? this.buildDarwinTemplate()
        : this.buildDefaultTemplate();

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    return menu;
  }

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
    const subMenuHelp: MenuItemConstructorOptions = {
      label: 'Help',
      submenu: [
        {
          label: 'Learn More',
          click() {
            shell.openExternal('https://electronjs.org');
          },
        },
        {
          label: 'Documentation',
          click() {
            shell.openExternal(
              'https://github.com/electron/electron/tree/main/docs#readme'
            );
          },
        },
        {
          label: 'Community Discussions',
          click() {
            shell.openExternal('https://www.electronjs.org/community');
          },
        },
        {
          label: 'Search Issues',
          click() {
            shell.openExternal('https://github.com/electron/electron/issues');
          },
        },
      ],
    };

    const subMenuView =
      process.env.NODE_ENV === 'development' ||
      process.env.DEBUG_PROD === 'true'
        ? subMenuViewDev
        : subMenuViewProd;

    return [subMenuAbout, subMenuEdit, subMenuView, subMenuWindow, subMenuHelp];
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
              await openNotebook();
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
              await openNotebook(undefined, true);
            },
          },
          {
            label: '&Close',
            accelerator: 'Ctrl+W',
            click: () => {
              this.mainWindow.close();
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
      {
        label: 'Help',
        submenu: [
          {
            label: 'Learn More',
            click() {
              shell.openExternal('https://electronjs.org');
            },
          },
          {
            label: 'Documentation',
            click() {
              shell.openExternal(
                'https://github.com/electron/electron/tree/main/docs#readme'
              );
            },
          },
          {
            label: 'Community Discussions',
            click() {
              shell.openExternal('https://www.electronjs.org/community');
            },
          },
          {
            label: 'Search Issues',
            click() {
              shell.openExternal('https://github.com/electron/electron/issues');
            },
          },
        ],
      },
      {
        label: 'Export',
        submenu: [
          {
            label: 'Pluto Notebook',
            click: async () => {
              const url = new URL(this.mainWindow.webContents.getURL());
              const id = url.searchParams.get('id');
              if (!id) {
                return dialog.showErrorBox(
                  'Invalid ID',
                  'Invalid ID in the url, cannot export.'
                );
              }

              return exportNotebook(id, PlutoExport.FILE);
            },
          },
          {
            label: 'HTML File',
            click: async () => {
              const url = new URL(this.mainWindow.webContents.getURL());
              const id = url.searchParams.get('id');
              if (!id) {
                return dialog.showErrorBox(
                  'Invalid ID',
                  'Invalid ID in the url, cannot export.'
                );
              }

              return exportNotebook(id, PlutoExport.HTML);
            },
          },
          {
            label: 'Pluto Statefile',
            click: async () => {
              const url = new URL(this.mainWindow.webContents.getURL());
              const id = url.searchParams.get('id');
              if (!id) {
                return dialog.showErrorBox(
                  'Invalid ID',
                  'Invalid ID in the url, cannot export.'
                );
              }

              return exportNotebook(id, PlutoExport.STATE);
            },
          },
        ],
      },
    ];

    return templateDefault;
  }
}
