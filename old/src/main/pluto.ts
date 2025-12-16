import { app, BrowserWindow, dialog, nativeTheme, shell } from 'electron';
import fs from 'node:fs';
// import * as path from 'node:path';

import { PlutoExport } from '../../types/enums.ts';
import { generalLogger } from './logger.ts';
import NotebookManager from './notebookManager.ts';
import {
  isExtMatch,
  Loader,
  PLUTO_FILE_EXTENSIONS,
  fetchPluto,
  withSearchParams,
} from './util.ts';
import msgpack from 'msgpack-lite';
import { GlobalWindowManager } from './windowHelpers.ts';
import { Globals } from './globals.ts';
import MenuBuilder from './menu.ts';
import { getAssetPath, source_root_dir } from './paths.ts';
import path from 'path';

class Pluto {
  /**
   * window related to this Pluto instance
   */
  private win: BrowserWindow;

  public static url: PlutoURL | null;

  private static notebookManager: NotebookManager;

  static closePlutoFunction: (() => void) | undefined;

  private id: string | undefined;

  constructor(landingUrl: string | null = Pluto.resolveHtmlPath('index.html')) {
    this.win = _createPlutoBrowserWindow();
    if (landingUrl) {
      this.win.loadURL(landingUrl);
    }

    GlobalWindowManager.getInstance().registerWindow(this);

    this.win.on('ready-to-show', () => {
      if (process.env.START_MINIMIZED) {
        this.win.minimize();
      } else {
        this.win.show();
      }
    });

    this.win.once('close', async () => {
      // Shutdown the Pluto notebook when the window closes
      const url = new URL(this.win.webContents.getURL());
      const notebookId = url.searchParams.get('id');
      
      if (notebookId) {
        generalLogger.info(`Shutting down notebook ${notebookId}`);
        await Pluto.notebook.shutdown(notebookId).catch((err) => {
          generalLogger.error('Error shutting down notebook:', err);
        });
      }
      
      GlobalWindowManager.getInstance().unregisterWindow(this);
    });

    const menuBuilder = new MenuBuilder(this);

    let first = true;
    this.win.on('page-title-updated', (_e, title) => {
      generalLogger.verbose('Window', this.win.id, 'moved to page:', title);
      if (this.win?.webContents.getTitle().includes('index.html')) return;
      const pageUrl = new URL(this.win!.webContents.getURL());
      const isPluto = pageUrl.href.includes('localhost:');
      if (first || isPluto) {
        first = false;
        this.win?.setMenuBarVisibility(true);
        menuBuilder.buildMenu();
      }
    });

    // Open urls in the user's browser
    this.win.webContents.setWindowOpenHandler((edata) => {
      shell.openExternal(edata.url);
      return { action: 'deny' };
    });
  }

  /**
   * @param type [default = 'new'] whether you want to open a new notebook
   * open a notebook from a path or from a url
   * @param pathOrURL location to the file, not needed if opening a new file,
   * opens that notebook. If false and no path is there, opens the file selector.
   * If true, opens a new blank notebook.
   */
  public open = async (
    type: 'url' | 'path' | 'new' = 'new',
    pathOrURL?: string | null,
  ) => {
    const focusedWindow = BrowserWindow.getFocusedWindow()!;

    let window: BrowserWindow = this.getBrowserWindow();
    const setBlockScreenText = (blockScreenText: string | null) => {
      window.webContents.send('set-block-screen-text', blockScreenText);
    };

    try {
      if (type === 'path' && pathOrURL && !isExtMatch(pathOrURL)) {
        dialog.showErrorBox(
          'PLUTO-CANNOT-OPEN-NOTEBOOK',
          'Not a supported file type.',
        );
        return;
      }

      if (type !== 'new' && !pathOrURL) {
        if (type === 'path') {
          const r = await dialog.showOpenDialog(focusedWindow, {
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

          [pathOrURL] = r.filePaths;
        } else if (type !== 'url') {
          dialog.showErrorBox(
            'PLUTO-CANNOT-OPEN-NOTEBOOK',
            'Empty URL Passed.',
          );
          return;
        }
      }

      const loader = new Loader(window);

      if (Globals.PLUTO_URL) {
        let params = {};
        if (pathOrURL) {
          generalLogger.log(`Trying to open ${pathOrURL}`);
          if (type === 'path') {
            setBlockScreenText(pathOrURL);
            window.webContents.send('pluto-url', `Trying to open ${pathOrURL}`);
            params = { secret: Globals.PLUTO_SECRET, path: pathOrURL };
          } else if (type === 'url') {
            const newURL = new URL(pathOrURL);
            if (newURL.searchParams.has('path')) {
              setBlockScreenText(pathOrURL);
              window.webContents.send(
                'pluto-url',
                `Trying to open ${newURL.searchParams.get('path')}`,
              );
              params = {
                secret: Globals.PLUTO_SECRET,
                path: newURL.searchParams.get('path'),
              };
            } else {
              setBlockScreenText('new notebook');
              window.webContents.send(
                'pluto-url',
                `Trying to open ${pathOrURL}`,
              );
              params = {
                secret: Globals.PLUTO_SECRET,
                url: pathOrURL,
              };
            }
          }
        } else {
          params = {
            secret: Globals.PLUTO_SECRET,
          };
        }

        let id;
        if (pathOrURL) {
          if (pathOrURL.includes('localhost') && pathOrURL.includes('edit')) {
            // is a local url
            id = new URL(pathOrURL).searchParams.get('id');
          } else {
            id = await Pluto.checkNotebook(pathOrURL);
          }
        }
        let res;
        if (id) {
          res = { status: 200, data: id };
        } else {
          const response = await fetchPluto(
            withSearchParams(type === 'new' ? 'new' : 'open', params),
            {
              method: 'POST',
            },
          );
          res = { status: response.status, data: await response.text() };
        }

        if (res.status === 200) {
          const notebookId = res.data;
          await window.loadURL(
            withSearchParams(Pluto.resolveHtmlPath('editor.html'), {
              id: notebookId,
            }).toString(),
          );
          loader.stopLoading();
          return;
        }

        window.webContents.send('set-block-screen-text', pathOrURL);

        loader.stopLoading();
        dialog.showErrorBox(
          'PLUTO-CANNOT-OPEN-NOTEBOOK',
          'Please check if you are using the correct secret.',
        );
        return;
      }
      loader.stopLoading();
      dialog.showErrorBox(
        'PLUTO-CANNOT-OPEN-NOTEBOOK',
        'Please wait for pluto to initialize.',
      );
    } catch (error) {
      generalLogger.error('PLUTO-NOTEBOOK-OPEN-ERROR', error);
      dialog.showErrorBox(
        'PLUTO-NOTEBOOK-OPEN-ERROR',
        'Cannot open this notebook found on this path/url.',
      );
    } finally {
      setBlockScreenText(null);
    }
  };

  /**
   * @param id id of notebook to be exported
   * @param type type of export, see type declarations
   * @returns nothing
   */
  private static exportNotebook = async (
    id: string,
    type: (typeof PlutoExport)[keyof typeof PlutoExport],
  ) => {
    if (!Globals.PLUTO_STARTED) {
      dialog.showErrorBox(
        'Pluto not intialized',
        'Please wait for pluto to initialize first',
      );
      return;
    }

    const window = BrowserWindow.getFocusedWindow();

    if (!window) {
      dialog.showErrorBox(
        'Pluto Export Error',
        'No Exportable window in focus.',
      );
      return;
    }

    if (type === PlutoExport.PDF) {
      window.webContents.print();
    } else {
      const url = withSearchParams(
        type === PlutoExport.FILE
          ? 'notebookfile'
          : type === PlutoExport.HTML
            ? 'notebookexport'
            : type === PlutoExport.STATE
              ? 'statefile'
              : 'unkown_export_type',
        {
          secret: Globals.PLUTO_SECRET,
          id,
        },
      ).toString();
      window.webContents.downloadURL(url);
    }
  };

  /**
   * shuts down the notebook of given id, and if the
   * window is still open after the shutdown, it changes
   * its url to home URL.
   * @param _id id of notebook to be shutdown
   * @returns nothing
   */
  private static shutdownNotebook = async (_id?: string) => {
    try {
      if (!Globals.PLUTO_STARTED) {
        dialog.showErrorBox(
          'Pluto not intialized',
          'Please wait for pluto to initialize first',
        );
        return;
      }

      const window = BrowserWindow.getFocusedWindow();
      if (window) {
        const id =
          _id ?? new URL(window.webContents.getURL()).searchParams.get('id');

        const response = await fetchPluto(
          withSearchParams('shutdown', { secret: Globals.PLUTO_SECRET, id }),
        );
        if (response.status === 200) {
          generalLogger.info(`File ${id} has been shutdown.`);
          if (!window.isDestroyed()) window.loadURL(Pluto.url!.url);
        } else {
          dialog.showErrorBox(
            'PLUTO-FILE-SHUTDOWN-ERROR',
            'Could not shutdown file for some reason',
          );
        }
      }
    } catch (error: { message: string } | any) {
      generalLogger.error('PLUTO-FILE-SHUTDOWN-ERROR', error);
    }
  };

  /**
   * opens a location selection dialog and if a location
   * is selected the file is moved to that location
   * @param _id id of notebook to be moved
   * @returns nothing
   */
  private static moveNotebook = async (_id?: string) => {
    try {
      if (!Globals.PLUTO_STARTED) {
        dialog.showErrorBox(
          'Pluto not intialized',
          'Please wait for pluto to initialize first',
        );
        return undefined;
      }

      const window = BrowserWindow.getFocusedWindow()!;
      const id =
        _id ?? new URL(window.webContents.getURL()).searchParams.get('id');
      const { canceled, filePath } = await dialog.showSaveDialog(window, {
        title: 'Select location to move your file',
        buttonLabel: 'Select',
        filters: [
          {
            name: 'Pluto Notebook',
            extensions: PLUTO_FILE_EXTENSIONS.map((v) => v.slice(1)),
          },
        ],
      });

      if (canceled) return undefined;

      const url = withSearchParams('move', {
        secret: Globals.PLUTO_SECRET,
        id,
        newpath: filePath,
      });
      const response = await fetchPluto(url, {
        method: 'POST',
      });
      const data = await response.json();

      if (response.status === 200) {
        generalLogger.info(`File ${id} has been moved to ${filePath}.`);
        return filePath;
      }
      dialog.showErrorBox(response.statusText, data);
    } catch (error) {
      generalLogger.error(error);
      dialog.showErrorBox(
        'Cannot move file',
        'Please check if you are using a valid file name.',
      );
    }

    return undefined;
  };

  /**
   * Communicates with the pluto process and gets the
   * currently open notebooks. It also creates the
   * `notebookManager` that stores this data
   * @param key location/url of the notebook to be checked
   * @returns id of the notebook if it is currently open
   */
  private static checkNotebook = async (key: string) => {
    let result;

    try {
      if (!Globals.PLUTO_STARTED) {
        dialog.showErrorBox(
          'Pluto not intialized',
          'Please wait for pluto to initialize first',
        );
        return;
      }

      const response = await fetchPluto(
        withSearchParams('notebooklist', { secret: Globals.PLUTO_SECRET }),
      );
      const arrayBuffer = await response.arrayBuffer();
      const data = Buffer.from(arrayBuffer);

      if (response.status === 200) {
        this.notebookManager = new NotebookManager(msgpack.decode(data));
        if (this.notebookManager.hasFile(key))
          result = this.notebookManager.getId(key);
      } else {
        dialog.showErrorBox(response.statusText, String(data));
      }
    } catch (error: { message: string } | any) {
      generalLogger.error('PLUTO-CHECK-NOTEBOOK-ERROR', error);
    }

    return result;
  };

  /**
   * Very similar to `checkNotebook`, but instead of returning
   * if for given location, it returns location for given id.
   * @param key Id of the file
   * @returns File location string if found, else false or undefined
   */
  private static getFileLocation = async (key: string) => {
    let result: string | boolean = false;

    try {
      if (!Globals.PLUTO_STARTED) {
        dialog.showErrorBox(
          'Pluto not intialized',
          'Please wait for pluto to initialize first',
        );
        return result;
      }

      const response = await fetchPluto(
        withSearchParams('notebooklist', { secret: Globals.PLUTO_SECRET }),
      );
      const arrayBuffer = await response.arrayBuffer();
      const data = Buffer.from(arrayBuffer);

      if (response.status === 200) {
        this.notebookManager = new NotebookManager(msgpack.decode(data));
        if (this.notebookManager.hasId(key)) {
          const temp = this.notebookManager.getFile(key)!;
          if (isExtMatch(temp)) {
            result = temp;
          }
        }
      } else {
        dialog.showErrorBox(response.statusText, String(data));
      }
    } catch (error: { message: string } | any) {
      generalLogger.error('PLUTO-CHECK-NOTEBOOK-ERROR', error);
    }

    return result;
  };

  public static resolveHtmlPath = (htmlFileName: string) => {
    let plutoLocation = Globals.PLUTO_LOCATION;

    // overwrite the default Pluto location if in development
    if (process.env.NODE_ENV === 'development') {
      const plutoLocationReplacement = path.resolve('..', 'Pluto.jl');
      if (fs.existsSync(plutoLocationReplacement)) {
        plutoLocation = plutoLocationReplacement;
        generalLogger.info('Using Pluto.jl development path', plutoLocation);
      }
    }

    return `file:///${plutoLocation}/frontend/${htmlFileName}?secret=${
      Globals.PLUTO_SECRET
    }&pluto_server_url=${encodeURIComponent(
      `http://localhost:7122?secret=${Globals.PLUTO_SECRET}`,
    )}`;
  };

  public setId(id: string) {
    this.id = id;
  }
  public getId() {
    return this.id;
  }
  public getBrowserWindow() {
    return this.win;
  }

  /**
   * Does nothing in particular but it just exposes the
   * FileSystem functions publicly in a ⚡ Pretty ⚡ way.
   */
  public static notebook = {
    export: this.exportNotebook,
    move: this.moveNotebook,
    shutdown: this.shutdownNotebook,
    getFile: this.getFileLocation,
  };

  /**
   * Closes the pluto instance if possible.
   */
  public static close = () => {
    Pluto.closePlutoFunction?.();
  };

  public close = () => {
    this.win.close(); // will trigger callback in constructor to do more cleanup
  };

  /**
   * Gets the current running info if it is running.
   */
  public static get runningInfo() {
    return Pluto.url;
  }
}

function _createPlutoBrowserWindow() {
  const win = new BrowserWindow({
    title: '⚡ Pluto ⚡',
    height: 800,
    width: 700,
    resizable: true,
    show: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1F1F1F' : 'white',
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: app.isPackaged
        ? path.join(source_root_dir, 'preload.js')
        : path.join(source_root_dir, 'release/app/dist/main/preload.js'),
    },
  });
  console.log('source_root_dir:', source_root_dir);
  // console.log('webpackPaths.distMainPath:', webpackPaths.distMainPath);
  win.webContents.setVisualZoomLevelLimits(1, 3);
  win.setMenuBarVisibility(false);

  return win;
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export default Pluto;
