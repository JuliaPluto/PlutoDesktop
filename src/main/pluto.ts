import axios from 'axios';
import chalk from 'chalk';
import { app, BrowserWindow, dialog } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { join } from 'node:path';

import { PlutoExport } from '../../types/enums';
import { generalLogger, juliaLogger } from './logger';
import NotebookManager from './notebookManager';
import {
  isExtMatch,
  Loader,
  PLUTO_FILE_EXTENSIONS,
  setAxiosDefaults,
} from './util';
import msgpack from 'msgpack-lite';

class Pluto {
  /**
   * project folder location
   */
  private project: string;

  /**
   * window related to this Pluto instance
   */
  private win: BrowserWindow;

  private getAssetPath: (...paths: string[]) => string;

  private static url: PlutoURL | null;

  /**
   * location of the julia executable
   */
  private static julia: string;

  private static notebookManager: NotebookManager;

  private static closePlutoFunction: (() => void) | undefined;

  constructor(
    win: BrowserWindow,
    getAssetPath: (...paths: string[]) => string
  ) {
    this.win = win;
    this.getAssetPath = getAssetPath;
    this.project =
      process.env.DEBUG_PROJECT_PATH ?? getAssetPath('env_for_julia');
    Pluto.url ??= null;
  }

  private findJulia = async () => {
    const files = fs.readdirSync(this.getAssetPath('.'));

    let julia_dir = files.find((s) => /^julia-\d+.\d+.\d+$/.test(s));
    let result;

    if (julia_dir == null) {
      generalLogger.error(
        "Couldn't find Julia in assets, falling back to the `julia` command."
      );
      result = `julia`;
    } else {
      result = this.getAssetPath(julia_dir, 'bin', 'julia.exe');
    }
    Pluto.julia = result;
    return result;
  };

  /**
   * The main function the actually runs a `julia` script that
   * checks and runs `Pluto` with specified options
   * It also updates the render process about the current status in the `pluto-url` channel.
   * @param project project path
   * @param notebook pluto notebook path
   * @param url pltuo notebook url if it is hosted elsewhere
   * @returns if pluto is running, a fundtion to kill the process
   */
  public run = async (project?: string, notebook?: string, url?: string) => {
    if (Pluto.url) {
      generalLogger.info(
        'LAUNCHING\n',
        'project:',
        project,
        '\nnotebook:',
        notebook
      );
      if (notebook) await Pluto.openNotebook('path', notebook);
      else if (url) await Pluto.openNotebook('url', url);
      return;
    }

    await this.findJulia();

    generalLogger.log(`Julia found at: ${Pluto.julia}`);

    this.win.webContents.send('pluto-url', 'loading');

    generalLogger.info(
      'LAUNCHING\n',
      'project:',
      this.project,
      '\nnotebook:',
      notebook
    );

    const SYSIMAGE_LOCATION = this.getAssetPath('pluto-sysimage.so');
    const DEPOT_LOCATION = this.getAssetPath('julia_depot');

    const options = [`--project=${this.project}`];
    if (!process.env.DEBUG_PROJECT_PATH) {
      if (fs.existsSync(SYSIMAGE_LOCATION))
        options.push(`--sysimage=${SYSIMAGE_LOCATION}`);
    }

    options.push(this.getAssetPath('run_pluto.jl'));
    // See run_pluto.jl for info about these command line arguments.
    options.push(notebook ?? '');
    options.push(DEPOT_LOCATION ?? '');
    options.push(join(app.getPath('userData'), 'unsaved_notebooks'));

    try {
      generalLogger.verbose(
        'Executing',
        chalk.bold(Pluto.julia),
        'with options',
        chalk.bold(options.toLocaleString().replace(',', ' '))
      );
      const res = spawn(Pluto.julia, options, {
        env: { ...process.env, JULIA_DEPOT_PATH: DEPOT_LOCATION },
      });

      res.stdout.on('data', (data: { toString: () => any }) => {
        const plutoLog = data.toString();

        if (plutoLog.includes('Loading') || plutoLog.includes('loading'))
          this.win.webContents.send('pluto-url', 'loading');

        if (Pluto.url === null) {
          if (plutoLog.includes('?secret=')) {
            const urlMatch = plutoLog.match(/http\S+/g);
            const entryUrl = urlMatch[0];

            const tempURL = new URL(entryUrl);
            Pluto.url = {
              url: entryUrl,
              port: tempURL.port,
              secret: tempURL.searchParams.get('secret')!,
            };

            this.win.webContents.send('pluto-url', 'loaded');
            setAxiosDefaults(Pluto.url);
            this.win.loadURL(entryUrl);

            generalLogger.announce('Entry url found:', Pluto.url);
          }
        }
        juliaLogger.log(plutoLog);
      });

      res.stderr.on('data', (data: any) => {
        const dataString = data.toString();

        if (dataString.includes('Updating'))
          this.win.webContents.send('pluto-url', 'updating');

        if (dataString.includes('Loading') || dataString.includes('loading'))
          this.win.webContents.send('pluto-url', 'loading');

        if (Pluto.url === null) {
          const plutoLog = dataString;
          if (plutoLog.includes('?secret=')) {
            const urlMatch = plutoLog.match(/http\S+/g);
            const entryUrl = urlMatch[0];

            const tempURL = new URL(entryUrl);
            Pluto.url = {
              url: entryUrl,
              port: tempURL.port,
              secret: tempURL.searchParams.get('secret')!,
            };

            this.win.webContents.send('pluto-url', 'loaded');
            setAxiosDefaults(Pluto.url);
            this.win.loadURL(entryUrl);

            generalLogger.announce('Entry url found:', Pluto.url);
          } else if (
            plutoLog.includes(
              'failed to send request: The server name or address could not be resolved'
            )
          ) {
            generalLogger.error(
              'INTERNET-CONNECTION-ERROR',
              'Pluto install failed, no internet connection.'
            );
            dialog.showErrorBox(
              'CANNOT-INSTALL-PLUTO',
              'Please check your internet connection!'
            );
            app.exit();
          }
        }

        juliaLogger.error(dataString);
      });

      res.once('close', (code: any) => {
        if (code !== 0) {
          dialog.showErrorBox(code, 'Pluto crashed');
        }
        juliaLogger.info(`child process exited with code ${code}`);
      });

      res.once('exit', (code: any) => {
        juliaLogger.info(`child process exited with code ${code}`);
      });

      Pluto.closePlutoFunction = () => {
        if (res) {
          juliaLogger.verbose('Killing Pluto process.');
          res?.kill();
        }
      };
    } catch (e) {
      generalLogger.error('PLUTO-RUN-ERROR', e);
    }
  };

  /**
   * @param type [default = 'new'] whether you want to open a new notebook
   * open a notebook from a path or from a url
   * @param pathOrURL location to the file, not needed if opening a new file,
   * opens that notebook. If false and no path is there, opens the file selector.
   * If true, opens a new blank notebook.
   */
  private static openNotebook = async (
    type: 'url' | 'path' | 'new' = 'new',
    pathOrURL?: string
  ) => {
    try {
      const window = BrowserWindow.getFocusedWindow()!;
      console.log(pathOrURL);

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
        } else if (type !== 'url') {
          dialog.showErrorBox(
            'PLUTO-CANNOT-OPEN-NOTEBOOK',
            'Empty URL Passed.'
          );
          return;
        }
      }

      const loader = new Loader(window);

      if (this.url) {
        let params = {};
        if (pathOrURL) {
          generalLogger.log(`Trying to open ${pathOrURL}`);
          if (type === 'path') {
            window.webContents.send('pluto-url', `Trying to open ${pathOrURL}`);
            params = { secret: Pluto.url?.secret, path: pathOrURL };
          } else if (type === 'url') {
            const newURL = new URL(pathOrURL);
            if (newURL.searchParams.has('path')) {
              window.webContents.send(
                'pluto-url',
                `Trying to open ${newURL.searchParams.get('path')}`
              );
              params = {
                secret: Pluto.url?.secret,
                path: newURL.searchParams.get('path'),
              };
            } else {
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
            id = await this.checkNotebook(pathOrURL);
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
          await window.loadURL(
            `http://localhost:${this.url.port}/edit?secret=${this.url.secret}&id=${res.data}`
          );
          loader.stopLoading();
          return;
        }
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
    }
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

  /**
   * @param file location/url of the file
   * @returns id of the file if notebookManager is there
   * and has the file in its data
   */
  private static getId = (file: string) =>
    this.notebookManager && this.notebookManager.hasFile(file)
      ? this.notebookManager.getId(file)
      : undefined;

  /**
   * Does nothing in particular but it just exposes the
   * FileSystem functions publically in a ⚡ Pretty ⚡ way.
   */
  public static notebook = {
    open: this.openNotebook,
    export: this.exportNotebook,
    move: this.moveNotebook,
    shutdown: this.shutdownNotebook,
    getId: this.getId,
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
