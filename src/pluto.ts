import { BrowserWindow, dialog, shell } from 'electron';
import fs from 'node:fs';
import { URL } from 'node:url';
import { decode } from '@msgpack/msgpack';

import { PlutoExport, type PlutoExportType } from './enums.ts';
import { generalLogger } from './logger.ts';
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

/**
 * The Pluto server's `notebooklist` endpoint returns a msgpack-encoded
 * mapping from notebook id to file path.
 */
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

  static closePlutoFunction: (() => void) | undefined;

  private viewedNotebookId: string | null = null;

  constructor(win: BrowserWindow, landingUrl: string | null) {
    this.win = win;
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

    // The editor prevents unload when there are unsubmitted cell edits.
    // Electron cancels the close silently in that case, so show a confirm
    // dialog and let the user decide.
    this.win.webContents.on('will-prevent-unload', (event) => {
      const choice = dialog.showMessageBoxSync(this.win, {
        type: 'warning',
        buttons: ['Leave', 'Stay'],
        defaultId: 1,
        cancelId: 1,
        title: 'Unsaved changes',
        message: 'This notebook has unsubmitted cell edits.',
        detail: 'If you leave now, edits that have not been run will be lost.',
      });
      if (choice === 0) {
        // Ignore the beforeunload handler and continue closing/navigating.
        event.preventDefault();
      }
    });

    const menuBuilder = new MenuBuilder(this);

    let lastShowNotebookActions: boolean | undefined;
    const refreshMenu = () => {
      if (this.win.isDestroyed()) return;

      updateViewedNotebookId();
      const showNotebookActions = menuBuilder.showNotebookActions();
      if (
        !menuBuilder.hasbuilt ||
        showNotebookActions !== lastShowNotebookActions
      ) {
        lastShowNotebookActions = showNotebookActions;
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
    const window = this.getBrowserWindow();
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

      if (type === 'path' && !pathOrURL) {
        const r = await dialog.showOpenDialog(window, {
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
      }

      if (type === 'url' && !pathOrURL) {
        dialog.showErrorBox('PLUTO-CANNOT-OPEN-NOTEBOOK', 'Empty URL Passed.');
        return;
      }

      if (!Globals.PLUTO_STARTED) {
        dialog.showErrorBox(
          'PLUTO-CANNOT-OPEN-NOTEBOOK',
          'Please wait for pluto to initialize.',
        );
        return;
      }

      const loader = new Loader(window);

      const params: Record<string, string> = { secret: Globals.PLUTO_SECRET };
      if (pathOrURL) {
        generalLogger.log(`Trying to open ${pathOrURL}`);
        if (type === 'path') {
          setBlockScreenText(pathOrURL);
          params.path = pathOrURL;
        } else if (type === 'url') {
          const remotePath = new URL(pathOrURL).searchParams.get('path');
          if (remotePath) {
            setBlockScreenText(pathOrURL);
            params.path = remotePath;
          } else {
            setBlockScreenText('new notebook');
            params.url = pathOrURL;
          }
        }
      }

      // If this notebook is already running, navigate to it instead of
      // asking the server to open it again.
      let id: string | null | undefined;
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

      setBlockScreenText(pathOrURL ?? null);
      loader.stopLoading();
      dialog.showErrorBox(
        'PLUTO-CANNOT-OPEN-NOTEBOOK',
        'Please check if you are using the correct secret.',
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
   * @param requestingWindow the window showing the notebook. Falls back to
   * the focused window, which can be null e.g. while a dialog is open.
   * @returns nothing
   */
  private static exportNotebook = async (
    id: string,
    type: PlutoExportType,
    requestingWindow?: BrowserWindow | null,
  ) => {
    if (!Globals.PLUTO_STARTED) {
      dialog.showErrorBox(
        'Pluto not initialized',
        'Please wait for pluto to initialize first',
      );
      return;
    }

    const window = requestingWindow ?? BrowserWindow.getFocusedWindow();

    if (!window) {
      dialog.showErrorBox(
        'Pluto Export Error',
        'No Exportable window in focus.',
      );
      return;
    }

    if (type === PlutoExport.PDF) {
      window.webContents.print();
      return;
    }

    const endpoint =
      type === PlutoExport.FILE
        ? 'notebookfile'
        : type === PlutoExport.HTML
          ? 'notebookexport'
          : 'statefile';
    const url = withSearchParams(endpoint, {
      secret: Globals.PLUTO_SECRET,
      id,
    }).toString();
    window.webContents.downloadURL(url);
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
          'Pluto not initialized',
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
   * @param requestingWindow the window showing the notebook. Falls back to
   * the focused window, which can be null e.g. while a dialog is open.
   * @returns nothing
   */
  private static moveNotebook = async (
    _id?: string,
    requestingWindow?: BrowserWindow | null,
  ) => {
    try {
      if (!Globals.PLUTO_STARTED) {
        dialog.showErrorBox(
          'Pluto not initialized',
          'Please wait for pluto to initialize first',
        );
        return undefined;
      }

      const window = requestingWindow ?? BrowserWindow.getFocusedWindow();
      if (!window) return undefined;
      const id = _id ?? Pluto.getNotebookIdFromWindow(window);
      if (!id) return undefined;

      const { canceled, filePath } = await dialog.showSaveDialog(window, {
        title: 'Select location to move your file',
        buttonLabel: 'Select',
        filters: [
          {
            name: 'Pluto notebook (.pluto.jl)',
            extensions: ['pluto.jl'],
          },
          {
            name: 'Pluto notebook (.jl)',
            extensions: ['jl'],
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
   * Asks the Pluto server which notebooks are currently running.
   * @returns mapping from notebook id to file path, or null on failure
   */
  private static fetchRunningNotebooks = async (): Promise<Record<
    string,
    string
  > | null> => {
    if (!Globals.PLUTO_STARTED) {
      dialog.showErrorBox(
        'Pluto not initialized',
        'Please wait for pluto to initialize first',
      );
      return null;
    }

    const response = await fetchPluto(
      withSearchParams('notebooklist', { secret: Globals.PLUTO_SECRET }),
    );
    const data = new Uint8Array(await response.arrayBuffer());

    if (response.status !== 200) {
      dialog.showErrorBox(
        response.statusText,
        new TextDecoder().decode(data),
      );
      return null;
    }

    return decodeNotebookList(data);
  };

  /**
   * It is not possible to 'open' an already open notebook, so we check
   * whether the file is already running to navigate to it directly.
   * @param file location/url of the notebook to be checked
   * @returns id of the notebook if it is currently open
   */
  private static checkNotebook = async (file: string) => {
    try {
      const notebooks = await Pluto.fetchRunningNotebooks();
      if (!notebooks) return undefined;
      return Object.keys(notebooks).find((id) => notebooks[id] === file);
    } catch (error: unknown) {
      generalLogger.error('PLUTO-CHECK-NOTEBOOK-ERROR', error);
      return undefined;
    }
  };

  /**
   * Inverse of `checkNotebook`: returns the file location for a given id.
   * @param id Id of the file
   * @returns File location string if found, else false
   */
  private static getFileLocation = async (id: string) => {
    try {
      const notebooks = await Pluto.fetchRunningNotebooks();
      const file = notebooks?.[id];
      return file && isExtMatch(file) ? file : false;
    } catch (error: unknown) {
      generalLogger.error('PLUTO-CHECK-NOTEBOOK-ERROR', error);
      return false;
    }
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
      `http://localhost:${Globals.PLUTO_PORT}?secret=${Globals.PLUTO_SECRET}`,
    )}`;
  };

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
