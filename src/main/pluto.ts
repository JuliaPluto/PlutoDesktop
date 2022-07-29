import { app, BrowserWindow, dialog } from 'electron';
import { spawn, exec } from 'node:child_process';
import chalk from 'chalk';
import axios from 'axios';
import fs from 'node:fs';
import unzip from 'extract-zip';
import { join } from 'node:path';
import isDev from 'electron-is-dev';
import { generalLogger, juliaLogger } from './logger';
import { PlutoExport } from '../../types/enums';
import { store, userStore } from './store';
import { isExtMatch, Loader, PLUTO_FILE_EXTENSIONS } from './util';

class Pluto {
  private project: string;

  private loading: BrowserWindow;

  private win: BrowserWindow;

  private getAssetPath: (...paths: string[]) => string;

  private precompilePluto = async () => {
    if (process.env.DEBUG_PROJECT_PATH) {
      generalLogger.silly(
        'Not precompiling because currently using',
        process.env.DEBUG_PROJECT_PATH
      );
      return;
    }

    if (
      store.has('PLUTO-PRECOMPILED') &&
      fs.existsSync(store.get('PLUTO-PRECOMPILED'))
    ) {
      generalLogger.silly('Already precompiled, so not precompiling.');
      return;
    }

    try {
      const PRECOMPILE_SCRIPT_LOCATION = this.getAssetPath('precompile.jl');
      const SYSTIMAGE_LOCATION = this.getAssetPath('pluto-sysimage.so');
      const PRECOMPILED_PLUTO_OUTPUT_LOCATION = this.getAssetPath(
        'pluto_precompile.jl'
      );
      generalLogger.info(chalk.yellow.bold('Trying to precompile Pluto.'));
      dialog.showMessageBox(this.win, {
        title: 'Precompiling Pluto',
        message:
          "Trying to precompile Pluto in the background, you'll be prompted when it is done. Once completed it will decrease the load time for further usage.\nThis is a one time process.",
      });
      const res = spawn(Pluto.julia, [
        `--project=${this.project}`,
        PRECOMPILE_SCRIPT_LOCATION,
        SYSTIMAGE_LOCATION,
        PRECOMPILED_PLUTO_OUTPUT_LOCATION,
      ]);
      generalLogger.verbose(
        'Executing Command:',
        Pluto.julia,
        `--project=${this.project}`,
        PRECOMPILE_SCRIPT_LOCATION,
        SYSTIMAGE_LOCATION,
        PRECOMPILED_PLUTO_OUTPUT_LOCATION
      );

      res.stderr.on('data', (data: { toString: () => any }) => {
        const plutoLog = data.toString();
        juliaLogger.log(plutoLog);
      });

      res.once('close', (code) => {
        if (code === 0) {
          generalLogger.info(
            'Pluto has been precompiled to',
            SYSTIMAGE_LOCATION
          );
          store.set('PLUTO-PRECOMPILED', SYSTIMAGE_LOCATION);
          dialog.showMessageBox(this.win, {
            title: 'Pluto has been precompiled',
            message: 'Pluto has been precompiled successfully.',
          });
        } else {
          generalLogger.error(
            'PLUTO-PRECOMPILE-ERROR',
            'Failed with error code',
            code
          );
          dialog.showErrorBox(
            'PLUTO-PRECOMPILE-ERROR',
            `Failed with error code ${code}.`
          );
        }
      });
    } catch (error) {
      generalLogger.error('PLUTO-PRECOMPLIE-ERROR', error);
    }
  };

  private static url: PlutoURL | null;

  private static julia: string;

  private static closePlutoFunction: (() => void) | undefined;

  private static getProjectPath(project?: string): string {
    if (project) return project;
    if (process.env.DEBUG_PROJECT_PATH) return process.env.DEBUG_PROJECT_PATH;

    const p = join(app.getPath('userData'), '/project/');
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p);
    }
    return p;
  }

  /**
   * * Checks for CUSTOM-JULIA-PATH, if not found then JULIA-PATH
   * else looks for a zip to extract Julia
   * * Extracts Julia from bundled zip
   * * removes used zip for space saving
   * @returns nothing
   */
  private extractJulia = async () => {
    if (
      userStore.has('CUSTOM-JULIA-PATH') &&
      fs.existsSync(userStore.get('CUSTOM-JULIA-PATH'))
    ) {
      Pluto.julia = userStore.get('CUSTOM-JULIA-PATH');
      return;
    }

    if (store.has('JULIA-PATH') && fs.existsSync(store.get('JULIA-PATH'))) {
      Pluto.julia = store.get('JULIA-PATH');
      return;
    }

    /**
     * Prefer to use extracted folder
     */

    generalLogger.announce('Starting Julia installation');

    try {
      // ask for permissions
      if (!isDev)
        exec('NET SESSION', (_error, _so, se) => {
          if (se.length === 0) {
            // admin
            generalLogger.log('Admin permissions granted.');
          } else {
            // no admin
            dialog.showErrorBox(
              'ADMIN PERMISSIONS NOT AVAILABLE',
              'Julia is not installed, to install it the application needs admin privileges. Please close the app and run again using right clicking and using "Run as administrator".'
            );
            generalLogger.error(
              'PERMISSION-NOT-GRANTED',
              "Can't install Julia, permissions not granted."
            );
            app.quit();
          }
        });

      this.loading.webContents.send('pluto-url', 'Installing Julia');
      const files = fs.readdirSync(this.getAssetPath('.'));
      const idx = files.findIndex(
        (v) => v.startsWith('julia-') && v.endsWith('zip')
      );
      if (idx === -1) {
        generalLogger.error('JULIA-INSTALL-ERROR', "Can't find Julia zip");
        return;
      }
      let zip = files[idx];
      const nameInitial = zip.replace('-win64.zip', '');
      store.set('JULIA-VERSION', nameInitial.replace('julia-', ''));
      this.loading.webContents.send('pluto-url', `File found: ${zip}`);
      generalLogger.log('File found:', zip);
      zip = this.getAssetPath(zip);
      const name = this.getAssetPath(nameInitial);
      if (fs.existsSync(name)) {
        this.loading.webContents.send(
          'pluto-url',
          'Deleting already existing directory'
        );
        generalLogger.log('Deleting already existing directory');
        fs.rmSync(name, { recursive: true, force: true });
      }

      this.loading.webContents.send('pluto-url', 'Unzipping');
      generalLogger.log('Unzipping');
      await unzip(zip, { dir: this.getAssetPath('.') });
      this.loading.webContents.send('pluto-url', 'Unzipped');
      generalLogger.log('Unzipped');
      if (!isDev) {
        this.loading.webContents.send('pluto-url', 'Removing zip');
        generalLogger.log('Removing zip');
        fs.rm(zip, (e) => {
          if (e) {
            generalLogger.error(e);
          }
        });
        this.loading.webContents.send('pluto-url', 'Zip removed');
        generalLogger.log('Zip removed');
      }
      const finalPath = this.getAssetPath(join(nameInitial, '/bin/julia.exe'));
      store.set('JULIA-PATH', finalPath);
      Pluto.julia = finalPath;
      generalLogger.announce(`Julia installed at: ${finalPath}`);
      this.loading.webContents.send(
        'pluto-url',
        'Julia Successfully Installed.'
      );

      // delete old manifest
      const p = join(app.getPath('userData'), '/project/');
      if (fs.existsSync(p)) {
        fs.rmdirSync(p);
      }
      generalLogger.info('Removed old manifest');
    } catch (error) {
      generalLogger.error('JULIA-INSTALL-ERROR', error);
    }
  };

  constructor(
    loading: BrowserWindow,
    win: BrowserWindow,
    getAssetPath: (...paths: string[]) => string,
    project?: string
  ) {
    this.loading = loading;
    this.win = win;
    this.getAssetPath = getAssetPath;
    this.project = Pluto.getProjectPath(project);
    Pluto.url ??= null;
  }

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

    await this.extractJulia();

    generalLogger.log(`Julia found at: ${Pluto.julia}`);

    this.loading.webContents.send('pluto-url', 'loading');

    const p = join(app.getPath('userData'), '/project/');
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p);
    }

    generalLogger.info(
      'LAUNCHING\n',
      'project:',
      this.project,
      '\nnotebook:',
      notebook
    );

    if (!store.has('JULIA-PATH')) {
      dialog.showErrorBox(
        'JULIA NOT FOUND',
        'Please download latest julia win64 portable zip and place it in the assets folder.'
      );
      return;
    }

    const options = [`--project=${this.project}`];
    if (!process.env.DEBUG_PROJECT_PATH) {
      if (
        store.has('PLUTO-PRECOMPILED') &&
        fs.existsSync(store.get('PLUTO-PRECOMPILED'))
      )
        options.push(`--sysimage=${store.get('PLUTO-PRECOMPILED')}`);
      else
        options.push(
          `--trace-compile=${this.getAssetPath('pluto_precompile.jl')}`
        );
    }
    if (
      process.env.DEBUG_PROJECT_PATH ||
      (store.has('PLUTO-PRECOMPILED') &&
        fs.existsSync(store.get('PLUTO-PRECOMPILED')))
    )
      options.push(this.getAssetPath('pluto_no_update.jl'));
    else options.push(this.getAssetPath('script.jl'));
    if (notebook) options.push(notebook);

    try {
      const res = spawn(Pluto.julia, options);
      generalLogger.verbose(
        'Executing',
        chalk.bold(Pluto.julia),
        'with options',
        chalk.bold(options.toLocaleString().replace(',', ' '))
      );

      res.stdout.on('data', (data: { toString: () => any }) => {
        const plutoLog = data.toString();

        if (plutoLog.includes('Loading') || plutoLog.includes('loading'))
          this.loading.webContents.send('pluto-url', 'loading');

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

            this.loading.webContents.send('pluto-url', 'loaded');
            this.win.loadURL(entryUrl);

            generalLogger.announce('Entry url found:', Pluto.url);

            this.precompilePluto();
          }
        }
        juliaLogger.log(plutoLog);
      });

      res.stderr.on('data', (data: any) => {
        const dataString = data.toString();

        if (dataString.includes('Updating'))
          this.loading.webContents.send('pluto-url', 'updating');

        if (dataString.includes('Loading') || dataString.includes('loading'))
          this.loading.webContents.send('pluto-url', 'loading');

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

            this.loading.webContents.send('pluto-url', 'loaded');
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

          // eslint-disable-next-line no-param-reassign
          [pathOrURL] = r.filePaths;
        }
      }

      const loader = new Loader(window);

      if (this.url) {
        let query = '';
        if (pathOrURL) {
          if (type === 'path') query = `&path=${pathOrURL}`;
          else if (type === 'url') query = `&url=${pathOrURL}`;
        }
        const res = await axios.post(
          `http://localhost:${this.url.port}/${
            type === 'new' ? 'new' : 'open'
          }?secret=${this.url.secret}${query}`
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
    }
  };

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

  private static shutdownNotebook = async (_id?: string) => {
    try {
      if (!this.url) {
        dialog.showErrorBox(
          'Pluto not intialized',
          'Please wait for pluto to initialize first'
        );
        return;
      }

      const window = BrowserWindow.getFocusedWindow()!;
      const id =
        _id ?? new URL(window.webContents.getURL()).searchParams.get('id');
      const res = await axios.get(
        `http://localhost:${this.url.port}/shutdown?secret=${this.url.secret}&id=${id}`
      );

      if (res.status === 200) {
        generalLogger.info(`File ${id} has been shutdown.`);
        window.loadURL(this.url.url);
      } else {
        dialog.showErrorBox(res.statusText, res.data);
      }
    } catch (error: { message: string } | any) {
      generalLogger.error('PLUTO-FILE-SHUTDOWN-ERROR', error.message);
    }
  };

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

      const res = await axios.get(
        `http://localhost:${this.url.port}/move?secret=${this.url.secret}&id=${id}&newpath=${filePath}`
      );

      if (res.status === 200) {
        generalLogger.info(`File ${id} has been moved to ${filePath}.`);
        return filePath;
      }
      dialog.showErrorBox(res.statusText, res.data);
    } catch (error) {
      dialog.showErrorBox(
        'Cannot move file',
        'Please check if you are using a valid file name.'
      );
      generalLogger.error(error);
    }

    return undefined;
  };

  public static notebook = {
    open: this.openNotebook,
    export: this.exportNotebook,
    move: this.moveNotebook,
    shutdown: this.shutdownNotebook,
  };

  public static close = () => {
    Pluto.closePlutoFunction?.();
  };

  public static get runningInfo() {
    return Pluto.url;
  }
}

export default Pluto;
