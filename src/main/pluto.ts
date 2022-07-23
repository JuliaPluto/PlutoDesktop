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

/**
 * * Checks for CUSTOM-JULIA-PATH, if not found then JULIA-PATH
 * else looks for a zip to extract Julia
 * * Extracts Julia from bundled zip
 * * removes used zip for space saving
 * @param getAssetPath a function to get asset path
 * @returns nothing
 */
const extractJulia = async (
  loading: BrowserWindow,
  getAssetPath: (...paths: string[]) => string
) => {
  if (
    userStore.has('CUSTOM-JULIA-PATH') &&
    fs.existsSync(userStore.get('CUSTOM-JULIA-PATH'))
  ) {
    return;
  }

  if (store.has('JULIA-PATH') && fs.existsSync(store.get('JULIA-PATH'))) {
    return;
  }

  /**
   * Prefer to use extracted folder
   */

  console.log(chalk.yellow('Starting Julia installation'));

  try {
    // ask for permissions
    if (!isDev)
      exec('NET SESSION', (_error, _so, se) => {
        if (se.length === 0) {
          // admin
          console.log('Admin permissions granted.');
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

    loading.webContents.send('pluto-url', 'Installing Julia');
    const files = fs.readdirSync(getAssetPath('.'));
    const idx = files.findIndex(
      (v) => v.startsWith('julia-') && v.endsWith('zip')
    );
    if (idx === -1) {
      generalLogger.error('JULIA-INSTALL-ERROR', "Can't find Julia zip");
      return;
    }
    let zip = files[idx];
    const nameInitial = zip.replace('-win64.zip', '');
    loading.webContents.send('pluto-url', `File found: ${zip}`);
    console.log('File found:', zip);
    zip = getAssetPath(zip);
    const name = getAssetPath(nameInitial);
    if (fs.existsSync(name)) {
      loading.webContents.send(
        'pluto-url',
        'Deleting already existing directory'
      );
      console.log('Deleting already existing directory');
      fs.rmSync(name, { recursive: true, force: true });
    }

    loading.webContents.send('pluto-url', 'Unzipping');
    console.log('Unzipping');
    await unzip(zip, { dir: getAssetPath('.') });
    loading.webContents.send('pluto-url', 'Unzipped');
    console.log('Unzipped');
    if (!isDev) {
      loading.webContents.send('pluto-url', 'Removing zip');
      console.log('Removing zip');
      fs.rm(zip, (e) => {
        if (e) {
          console.log(e);
        }
      });
      loading.webContents.send('pluto-url', 'Zip removed');
      console.log('Zip removed');
    }
    const finalPath = getAssetPath(join(nameInitial, '/bin/julia.exe'));
    store.set('JULIA-PATH', finalPath);
    console.log(chalk.yellow(`Julia installed at: ${finalPath}`));
    loading.webContents.send('pluto-url', 'Julia Successfully Installed.');
  } catch (error) {
    generalLogger.error('JULIA-INSTALL-ERROR', error);
  }
};

let plutoURL: PlutoURL | null = null;

/**
 * @param type [default = 'new'] whether you want to open a new notebook
 * open a notebook from a path or from a url
 * @param pathOrURL location to the file, not needed if opening a new file,
 * opens that notebook. If false and no path is there, opens the file selector.
 * If true, opens a new blank notebook.
 */
const openNotebook = async (
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

    if (plutoURL) {
      let query = '';
      if (pathOrURL) {
        if (type === 'path') query = `&path=${pathOrURL}`;
        else if (type === 'url') query = `&url=${pathOrURL}`;
      }
      const res = await axios.post(
        `http://localhost:${plutoURL.port}/${
          type === 'new' ? 'new' : 'open'
        }?secret=${plutoURL.secret}${query}`
      );
      if (res.status === 200) {
        await window.loadURL(
          `http://localhost:${plutoURL.port}/edit?secret=${plutoURL.secret}&id=${res.data}`
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

const precompilePluto = (
  win: BrowserWindow,
  projectPath: string,
  scriptLocation: string,
  precompileSharedObjectLocation: string,
  precompileScriptLocation: string
) => {
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

  const julia =
    userStore.has('CUSTOM-JULIA-PATH') && !isDev
      ? userStore.get('CUSTOM-JULIA-PATH')
      : store.get('JULIA-PATH');

  try {
    generalLogger.info(chalk.yellow.bold('Trying to precompile Pluto.'));
    dialog.showMessageBox(win, {
      title: 'Precompiling Pluto',
      message:
        "Trying to precompile Pluto in the background, you'll be prompted when it is done. Once completed it will decrease the load time for further usage.\nThis is a one time process.",
    });
    const res = spawn(julia, [
      `--project=${projectPath}`,
      scriptLocation,
      precompileSharedObjectLocation,
      precompileScriptLocation,
    ]);
    generalLogger.verbose(
      'Executing Command:',
      julia,
      `--project=${projectPath}`,
      scriptLocation,
      precompileSharedObjectLocation,
      precompileScriptLocation
    );

    res.stderr.on('data', (data: { toString: () => any }) => {
      const plutoLog = data.toString();
      juliaLogger.log(plutoLog);
    });

    res.once('close', (code) => {
      if (code === 0) {
        generalLogger.info(
          'Pluto has been precompiled to',
          precompileSharedObjectLocation
        );
        store.set('PLUTO-PRECOMPILED', precompileSharedObjectLocation);
        dialog.showMessageBox(win, {
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

// eslint-disable-next-line import/no-mutable-exports
let closePluto: (() => void) | undefined;

/**
 * The main function the actually runs a `julia` script that
 * checks and runs `Pluto` with specified options
 * It also updates the render process about the current status in the `pluto-url` channel.
 * @param win the BrowserWindow in which we are tryng to run pluto
 * @param getAssetPath a function to get asset path in dev and prod environment
 * @param project project path
 * @param notebook pluto notebook path
 * @returns if pluto is running, a fundtion to kill the process
 */
const runPluto = async (
  loading: BrowserWindow,
  win: BrowserWindow,
  getAssetPath: (...paths: string[]) => string,
  project?: string,
  notebook?: string,
  url?: string
) => {
  if (plutoURL) {
    generalLogger.info(
      'LAUNCHING\n',
      'project:',
      project,
      '\nnotebook:',
      notebook
    );
    if (notebook) await openNotebook('path', notebook);
    else if (url) await openNotebook('url', url);
    return;
  }

  await extractJulia(loading, getAssetPath);

  loading.webContents.send('pluto-url', 'loading');

  const p = join(app.getPath('userData'), '/project/');
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p);
  }

  const loc = project ?? process.env.DEBUG_PROJECT_PATH ?? p;

  generalLogger.info('LAUNCHING\n', 'project:', loc, '\nnotebook:', notebook);

  if (!store.has('JULIA-PATH')) {
    dialog.showErrorBox(
      'JULIA NOT FOUND',
      'Please download latest julia win64 portable zip and place it in the assets folder.'
    );
    return;
  }

  const julia = userStore.has('CUSTOM-JULIA-PATH')
    ? userStore.get('CUSTOM-JULIA-PATH')
    : store.get('JULIA-PATH');

  generalLogger.log(`Julia found at: ${julia}`);

  const options = [`--project=${loc}`];
  if (!process.env.DEBUG_PROJECT_PATH) {
    if (
      store.has('PLUTO-PRECOMPILED') &&
      fs.existsSync(store.get('PLUTO-PRECOMPILED'))
    )
      options.push(`--sysimage=${store.get('PLUTO-PRECOMPILED')}`);
    else options.push(`--trace-compile=${getAssetPath('pluto_precompile.jl')}`);
  }
  if (
    process.env.DEBUG_PROJECT_PATH ||
    (store.has('PLUTO-PRECOMPILED') &&
      fs.existsSync(store.get('PLUTO-PRECOMPILED')))
  )
    options.push(getAssetPath('pluto_no_update.jl'));
  else options.push(getAssetPath('script.jl'));
  if (notebook) options.push(notebook);

  try {
    const res = spawn(julia, options);
    generalLogger.verbose(
      'Executing',
      chalk.bold(julia),
      'with options',
      chalk.bold(options.toLocaleString().replace(',', ' '))
    );

    res.stdout.on('data', (data: { toString: () => any }) => {
      const plutoLog = data.toString();

      if (plutoLog.includes('Loading') || plutoLog.includes('loading'))
        loading.webContents.send('pluto-url', 'loading');
      if (plutoURL === null) {
        if (plutoLog.includes('?secret=')) {
          const urlMatch = plutoLog.match(/http\S+/g);
          const entryUrl = urlMatch[0];

          const tempURL = new URL(entryUrl);
          plutoURL = {
            url: entryUrl,
            port: tempURL.port,
            secret: tempURL.searchParams.get('secret')!,
          };

          loading.webContents.send('pluto-url', 'loaded');
          win.loadURL(entryUrl);

          generalLogger.announce('Entry url found:', plutoURL);

          precompilePluto(
            win,
            loc,
            getAssetPath('precompile.jl'),
            getAssetPath('pluto-sysimage.so'),
            getAssetPath('pluto_precompile.jl')
          );
        }
      }
      juliaLogger.log(plutoLog);
    });

    res.stderr.on('data', (data: any) => {
      const dataString = data.toString();

      if (dataString.includes('Updating'))
        loading.webContents.send('pluto-url', 'updating');

      if (dataString.includes('Loading') || dataString.includes('loading'))
        loading.webContents.send('pluto-url', 'loading');

      if (plutoURL === null) {
        const plutoLog = dataString;
        if (plutoLog.includes('?secret=')) {
          const urlMatch = plutoLog.match(/http\S+/g);
          const entryUrl = urlMatch[0];

          const tempURL = new URL(entryUrl);
          plutoURL = {
            url: entryUrl,
            port: tempURL.port,
            secret: tempURL.searchParams.get('secret')!,
          };

          loading.webContents.send('pluto-url', 'loaded');
          win.loadURL(entryUrl);

          generalLogger.verbose('Entry url found:', plutoURL);
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

      juliaLogger.log(dataString);
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

    closePluto = () => {
      if (res) {
        juliaLogger.verbose('Killing Pluto process.');
        res?.kill();
      }
    };
  } catch (e) {
    generalLogger.error('PLUTO-RUN-ERROR', e);
  }
};

const updatePluto = () => {};

const exportNotebook: (id: string, type: PlutoExport) => Promise<void> = async (
  id: string,
  type: PlutoExport
) => {
  if (!plutoURL) {
    dialog.showErrorBox(
      'Pluto not intialized',
      'Please wait for pluto to initialize first'
    );
    return;
  }

  const window = BrowserWindow.getFocusedWindow();

  if (!window) {
    dialog.showErrorBox('Pluto Export Error', 'No Exportable window in focus.');
    return;
  }

  let url: string | null;
  switch (type) {
    case PlutoExport.FILE:
      url = `http://localhost:${plutoURL.port}/notebookfile?secret=${plutoURL.secret}&id=${id}`;
      break;
    case PlutoExport.HTML:
      url = `http://localhost:${plutoURL.port}/notebookexport?secret=${plutoURL.secret}&id=${id}`;
      break;
    case PlutoExport.STATE:
      url = `http://localhost:${plutoURL.port}/statefile?secret=${plutoURL.secret}&id=${id}`;
      break;
    default:
      window.webContents.print();
      return;
  }

  window.webContents.downloadURL(url);
};

const shutdownNotebook = async (_id?: string) => {
  try {
    if (!plutoURL) {
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
      `http://localhost:${plutoURL.port}/shutdown?secret=${plutoURL.secret}&id=${id}`
    );

    if (res.status === 200) {
      generalLogger.info(`File ${id} has been shutdown.`);
      window.loadURL(plutoURL.url);
    } else {
      dialog.showErrorBox(res.statusText, res.data);
    }
  } catch (error: { message: string } | any) {
    // dialog.showErrorBox('Cannot shutdown file', 'We are logging this error');
    generalLogger.error('PLUTO-FILE-SHUTDOWN-ERROR', error.message);
  }
};

const moveNotebook = async (_id?: string) => {
  try {
    if (!plutoURL) {
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
      `http://localhost:${plutoURL.port}/move?secret=${plutoURL.secret}&id=${id}&newpath=${filePath}`
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

const isPlutoRunning = () => (plutoURL !== null ? plutoURL : null);

export {
  runPluto,
  updatePluto,
  openNotebook,
  exportNotebook,
  shutdownNotebook,
  moveNotebook,
  isPlutoRunning,
  closePluto,
};
