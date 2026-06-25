import { BrowserWindow, dialog, shell } from 'electron';
import fs from 'node:fs';
import { URL } from 'node:url';
import { decode } from '@msgpack/msgpack';

import { PlutoExport } from './enums.ts';
import { generalLogger } from './logger.ts';
import NotebookManager from './notebookManager.ts';
import {
  isExtMatch,
  Loader,
  PLUTO_FILE_EXTENSIONS,
  fetchPluto,
  withSearchParams,
} from './util.ts';
import { GlobalWindowManager } from './windowHelpers.ts';
import { Globals } from './globals.ts';
import MenuBuilder from './menu.ts';
import path from 'path';

const decodeNotebookList = (data: Uint8Array): Record<string, string> => {
  const decoded = decode(data);

  if (
    !decoded ||
    typeof decoded !== 'object' ||
    Array.isArray(decoded) ||
    !Object.entries(decoded).every(
      ([key, value]) => typeof key === 'string' && typeof value === 'string',
    )
  ) {
    throw new Error('Unexpected notebook list response from Pluto');
  }

  return decoded as Record<string, string>;
};

class Pluto {
  /**
   * window related to this Pluto instance
   */
  private win: BrowserWindow;

  private static notebookManager: NotebookManager;

  static closePlutoFunction: (() => void) | undefined;

  private id: string | undefined;

  private viewedNotebookId: string | null = null;

  constructor(win: BrowserWindow, landingUrl: string | null) {
    this.win = win;
    if (landingUrl) {
      this.win.loadURL(landingUrl);
    }
    // What does this do? do we need it?
    GlobalWindowManager.getInstance().registerWindow(this);

    this.win.on('ready-to-show', () => {
      if (process.env.START_MINIMIZED) {
        this.win.minimize();
      } else {
        this.win.show();
      }
    });

    const updateViewedNotebookId = () => {
      this.viewedNotebookId = Pluto.getNotebookIdFromWindow(this.win);
    };

    let notebookIdOnClose: string | null = null;
    this.win.on('close', () => {
      updateViewedNotebookId();
      notebookIdOnClose = this.viewedNotebookId;
    });

    this.win.once('closed', async () => {
      // Shutdown only after the close is final, so cancelled unsaved-edit
      // closes keep running.
      const notebookId = notebookIdOnClose ?? this.viewedNotebookId;

      if (
        notebookId &&
        !Pluto.isNotebookOpenInAnotherWindow(notebookId, this.win)
      ) {
        generalLogger.info(`Shutting down notebook ${notebookId}`);
        await Pluto.shutdownNotebook(notebookId, false).catch(
          (err: unknown) => {
            generalLogger.error('Error shutting down notebook:', err);
          },
        );
      }

      GlobalWindowManager.getInstance().unregisterWindow(this);
    });

    const menuBuilder = new MenuBuilder(this);

    let lastShowExport: boolean | undefined;
    const refreshMenu = () => {
      if (this.win.isDestroyed()) return;

      updateViewedNotebookId();
      const showExport = menuBuilder.showExport();
      if (!menuBuilder.hasbuilt || showExport !== lastShowExport) {
        lastShowExport = showExport;
        this.win.setMenuBarVisibility(true);
        menuBuilder.buildMenu();
      }
    };

    this.win.on('page-title-updated', (_e, title) => {
      generalLogger.verbose('Window', this.win.id, 'moved to page:', title);
      refreshMenu();
    });
    this.win.webContents.on('did-finish-load', refreshMenu);
    this.win.webContents.on('did-navigate', refreshMenu);
    this.win.webContents.on('did-navigate-in-page', refreshMenu);
    this.win.on('focus', refreshMenu);

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
      if (window.isDestroyed()) return;
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
            id = await Pluto.checkNotebook(
              Pluto.getNotebookLookupKey(type, pathOrURL),
            );
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

  private static getNotebookIdFromWindow = (
    window: BrowserWindow | null | undefined,
  ): string | null => {
    try {
      if (!window || window.isDestroyed()) return null;
      return new URL(window.webContents.getURL()).searchParams.get('id');
    } catch (error) {
      generalLogger.verbose('Could not read notebook id from window URL', error);
      return null;
    }
  };

  private static isNotebookOpenInAnotherWindow = (
    notebookId: string,
    currentWindow: BrowserWindow,
  ): boolean =>
    GlobalWindowManager.getInstance().plutoWindows.some((pluto) => {
      const window = pluto.getBrowserWindow();
      return (
        window !== currentWindow &&
        Pluto.getNotebookIdFromWindow(window) === notebookId
      );
    });

  private static loadHome = async (window: BrowserWindow): Promise<void> => {
    if (window.isDestroyed()) return;
    await window.loadURL(Pluto.resolveHtmlPath('index.html'));
  };

  private static getNotebookLookupKey = (
    type: 'url' | 'path' | 'new',
    pathOrURL: string,
  ) => {
    if (type !== 'url') return pathOrURL;

    try {
      return new URL(pathOrURL).searchParams.get('path') ?? pathOrURL;
    } catch (error) {
      generalLogger.verbose('Could not parse notebook URL', error);
      return pathOrURL;
    }
  };

  /**
   * shuts down the notebook of given id, and if the
   * window is still open after the shutdown, it changes
   * its url to home URL.
   * @param _id id of notebook to be shutdown
   * @returns nothing
   */
  private static shutdownNotebook = async (
    _id?: string,
    reloadWindow = true,
  ) => {
    try {
      if (!Globals.PLUTO_STARTED) {
        dialog.showErrorBox(
          'Pluto not intialized',
          'Please wait for pluto to initialize first',
        );
        return;
      }

      const window = BrowserWindow.getFocusedWindow();
      const id = _id ?? Pluto.getNotebookIdFromWindow(window);

      if (!id) {
        generalLogger.warn('PLUTO-FILE-SHUTDOWN-ERROR No notebook id found');
        return;
      }

      const response = await fetchPluto(
        withSearchParams('shutdown', { secret: Globals.PLUTO_SECRET, id }),
      );
      if (response.status === 200) {
        generalLogger.info(`File ${id} has been shutdown.`);
        if (reloadWindow && window) await Pluto.loadHome(window);
      } else {
        dialog.showErrorBox(
          'PLUTO-FILE-SHUTDOWN-ERROR',
          'Could not shutdown file for some reason',
        );
      }
    } catch (error: unknown) {
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
      if (!id) return undefined;

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
      const data = await response.text();

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
        this.notebookManager = new NotebookManager(
          decodeNotebookList(data),
        );
        if (this.notebookManager.hasFile(key))
          result = this.notebookManager.getId(key);
      } else {
        dialog.showErrorBox(response.statusText, String(data));
      }
    } catch (error: unknown) {
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
        this.notebookManager = new NotebookManager(
          decodeNotebookList(data),
        );
        if (this.notebookManager.hasId(key)) {
          const temp = this.notebookManager.getFile(key)!;
          if (isExtMatch(temp)) {
            result = temp;
          }
        }
      } else {
        dialog.showErrorBox(response.statusText, String(data));
      }
    } catch (error: unknown) {
      generalLogger.error('PLUTO-CHECK-NOTEBOOK-ERROR', error);
    }

    return result;
  };

  public static resolveHtmlPath = (htmlFileName: string) => {
    let plutoLocation = Globals.PLUTO_LOCATION;
    generalLogger.log(`Pluto found at: ${Globals.PLUTO_LOCATION}`);

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
      `http://localhost:${Globals.PLUTO_PORT}?secret=${Globals.PLUTO_SECRET}`,
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

}

export default Pluto;
