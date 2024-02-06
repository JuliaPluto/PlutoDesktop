import axios from 'axios';
import { BrowserWindow, dialog } from 'electron';
import fs from 'node:fs';
import * as path from 'node:path';

import { PlutoExport } from '../../types/enums';
import { generalLogger } from './logger';
import NotebookManager from './notebookManager';
import { isExtMatch, Loader, PLUTO_FILE_EXTENSIONS } from './util';
import msgpack from 'msgpack-lite';
import { createPlutoWindow } from './windowHelpers';
import { Globals } from './globals';

class Pluto {
  /**
   * window related to this Pluto instance
   */
  private win: BrowserWindow;

  public static url: PlutoURL | null;

  private static notebookManager: NotebookManager;

  static closePlutoFunction: (() => void) | undefined;

  private id: string | undefined;

  constructor(win: BrowserWindow) {
    // currently Pluto functions as a singleton
    // TODO: refactor to support arbitrary window counts

    Pluto.url ??= null;
    this.win = win;
    this.win.loadURL(Pluto.resolveHtmlPath('index.html'));
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
    pathOrURL?: string | null
  ) => {
    const window = BrowserWindow.getFocusedWindow()!;
    const setBlockScreenText = (blockScreenText: string | null) =>
      window.webContents.send('set-block-screen-text', blockScreenText);

    try {
      if (type === 'path' && pathOrURL && !isExtMatch(pathOrURL)) {
        dialog.showErrorBox(
          'PLUTO-CANNOT-OPEN-NOTEBOOK',
          'Not a supported file type.'
        );
        return;
      }

      if (type !== 'new' && !pathOrURL) {
        if (type === 'path') {
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
          // this.win.webContents.send();
        } else if (type !== 'url') {
          dialog.showErrorBox(
            'PLUTO-CANNOT-OPEN-NOTEBOOK',
            'Empty URL Passed.'
          );
          return;
        }
      }

      const loader = new Loader(window);

      if (Pluto.url) {
        let params = {};
        if (pathOrURL) {
          generalLogger.log(`Trying to open ${pathOrURL}`);
          if (type === 'path') {
            setBlockScreenText(pathOrURL);
            window.webContents.send('pluto-url', `Trying to open ${pathOrURL}`);
            params = { secret: Pluto.url?.secret, path: pathOrURL };
          } else if (type === 'url') {
            const newURL = new URL(pathOrURL);
            if (newURL.searchParams.has('path')) {
              setBlockScreenText(pathOrURL);
              window.webContents.send(
                'pluto-url',
                `Trying to open ${newURL.searchParams.get('path')}`
              );
              params = {
                secret: Pluto.url?.secret,
                path: newURL.searchParams.get('path'),
              };
            } else {
              setBlockScreenText('new notebook');
              window.webContents.send(
                'pluto-url',
                `Trying to open ${pathOrURL}`
              );
              params = {
                secret: Pluto.url?.secret,
                url: pathOrURL,
              };
            }
          }
        } else {
          params = {
            secret: Pluto.url?.secret,
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
        const res = id
          ? { status: 200, data: id }
          : await axios.post(
              type === 'new' ? 'new' : 'open',
              {},
              {
                params,
              }
            );

        if (res.status === 200) {
          const notebookId = res.data;
          await window.loadURL(
            Pluto.resolveHtmlPath('editor.html') + `&id=${notebookId}`
          );
          loader.stopLoading();
          return;
        }

        window.webContents.send('set-block-screen-text', pathOrURL);

        loader.stopLoading();
        dialog.showErrorBox(
          'PLUTO-CANNOT-OPEN-NOTEBOOK',
          'Please check if you are using the correct secret.'
        );
        return;
      }
      loader.stopLoading();
      dialog.showErrorBox(
        'PLUTO-CANNOT-OPEN-NOTEBOOK',
        'Please wait for pluto to initialize.'
      );
    } catch (error) {
      generalLogger.error('PLUTO-NOTEBOOK-OPEN-ERROR', error);
      dialog.showErrorBox(
        'PLUTO-NOTEBOOK-OPEN-ERROR',
        'Cannot open this notebook found on this path/url.'
      );
    } finally {
      setBlockScreenText(null);
    }
  };

  /**
   * Alias function for `open` with type set to 'new'
   */
  private static newNotebook = async () => {
    const plutoWindow = new Pluto(createPlutoWindow());
    plutoWindow.open('new');
    return plutoWindow;
  };

  /**
   * @param id id of notebook to be exported
   * @param type type of export, see type declarations
   * @returns nothing
   */
  private static exportNotebook = async (id: string, type: PlutoExport) => {
    if (!this.url) {
      dialog.showErrorBox(
        'Pluto not intialized',
        'Please wait for pluto to initialize first'
      );
      return;
    }

    const window = BrowserWindow.getFocusedWindow();

    if (!window) {
      dialog.showErrorBox(
        'Pluto Export Error',
        'No Exportable window in focus.'
      );
      return;
    }

    let url: string | null;
    switch (type) {
      case PlutoExport.FILE:
        url = `http://localhost:${this.url.port}/notebookfile?secret=${this.url.secret}&id=${id}`;
        break;
      case PlutoExport.HTML:
        url = `http://localhost:${this.url.port}/notebookexport?secret=${this.url.secret}&id=${id}`;
        break;
      case PlutoExport.STATE:
        url = `http://localhost:${this.url.port}/statefile?secret=${this.url.secret}&id=${id}`;
        break;
      default:
        window.webContents.print();
        return;
    }

    window.webContents.downloadURL(url);
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
      if (!this.url) {
        dialog.showErrorBox(
          'Pluto not intialized',
          'Please wait for pluto to initialize first'
        );
        return;
      }

      const window = BrowserWindow.getFocusedWindow();
      if (window) {
        const id =
          _id ?? new URL(window.webContents.getURL()).searchParams.get('id');

        const res = await axios.get('shutdown', {
          params: {
            secret: Pluto.url?.secret,
            id,
          },
        });

        if (res.status === 200) {
          generalLogger.info(`File ${id} has been shutdown.`);
          if (!window.isDestroyed()) window.loadURL(Pluto.url!.url);
        } else {
          dialog.showErrorBox(
            'PLUTO-FILE-SHUTDOWN-ERROR',
            'Could not shutdown file for some reason'
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
      if (!this.url) {
        dialog.showErrorBox(
          'Pluto not intialized',
          'Please wait for pluto to initialize first'
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

      const res = await axios.post(
        'move',
        {},
        {
          params: {
            secret: Pluto.url?.secret,
            id,
            newpath: filePath,
          },
        }
      );

      if (res.status === 200) {
        generalLogger.info(`File ${id} has been moved to ${filePath}.`);
        return filePath;
      }
      dialog.showErrorBox(res.statusText, res.data);
    } catch (error) {
      generalLogger.error(error);
      dialog.showErrorBox(
        'Cannot move file',
        'Please check if you are using a valid file name.'
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
      if (!this.url) {
        dialog.showErrorBox(
          'Pluto not intialized',
          'Please wait for pluto to initialize first'
        );
        return;
      }

      const res = await axios.get('notebooklist', {
        responseType: 'arraybuffer',
        params: {
          secret: Pluto.url?.secret,
        },
      });

      if (res.status === 200) {
        this.notebookManager = new NotebookManager(msgpack.decode(res.data));
        if (this.notebookManager.hasFile(key))
          result = this.notebookManager.getId(key);
      } else {
        dialog.showErrorBox(res.statusText, res.data);
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
      if (!this.url) {
        dialog.showErrorBox(
          'Pluto not intialized',
          'Please wait for pluto to initialize first'
        );
        return;
      }

      const res = await axios.get('notebooklist', {
        responseType: 'arraybuffer',
        params: {
          secret: Pluto.url?.secret,
        },
      });

      if (res.status === 200) {
        this.notebookManager = new NotebookManager(msgpack.decode(res.data));
        if (this.notebookManager.hasId(key)) {
          const temp = this.notebookManager.getFile(key)!;
          if (isExtMatch(temp)) {
            result = temp;
          }
        }
      } else {
        dialog.showErrorBox(res.statusText, res.data);
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
      `ws://localhost:7122?secret=${Globals.PLUTO_SECRET}`
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
   * FileSystem functions publically in a ⚡ Pretty ⚡ way.
   */
  public static notebook = {
    new: this.newNotebook,
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

  /**
   * Gets the current running info if it is running.
   */
  public static get runningInfo() {
    return Pluto.url;
  }
}

export default Pluto;
