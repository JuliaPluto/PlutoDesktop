import { app, BrowserWindow, dialog } from 'electron';
import log from 'electron-log';
import {
  ChildProcessWithoutNullStreams,
  spawn,
  exec,
} from 'node:child_process';
import chalk from 'chalk';
import axios from 'axios';
import electronDl, { download } from 'electron-dl';
import fs from 'node:fs';
import unzip from 'extract-zip';
import { join } from 'node:path';
import isDev from 'electron-is-dev';
import { PlutoExport } from '../../types/enums';
import store from './store';
import { isExtMatch, Loader, PLUTO_FILE_EXTENSIONS } from './util';

electronDl();

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
    store.has('CUSTOM-JULIA-PATH') &&
    fs.existsSync(store.get('CUSTOM-JULIA-PATH') as string)
  ) {
    return;
  }

  if (
    store.has('JULIA-PATH') &&
    fs.existsSync(getAssetPath(store.get('JULIA-PATH') as string))
  ) {
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
          log.error("Can't install Julia, permissions not granted.");
          app.quit();
        }
      });

    loading.webContents.send('pluto-url', 'Installing Julia');
    const files = fs.readdirSync(getAssetPath('.'));
    const idx = files.findIndex(
      (v) => v.startsWith('julia-') && v.endsWith('zip')
    );
    if (idx === -1) {
      log.error('JULIA-INSTALL-ERROR', "Can't find Julia zip");
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
    store.set('JULIA-PATH', join(nameInitial, '/bin/julia.exe'));
    console.log(
      chalk.yellow(
        `Julia installed at: ${getAssetPath(store.get('JULIA-PATH') as string)}`
      )
    );
    loading.webContents.send('pluto-url', 'Julia Successfully Installed.');
  } catch (error) {
    console.error(error);
  }
};

let plutoURL: PlutoURL | null = null;

/**
 * @param path path to a .pluto.jl file
 * @returns * a URL to openend .pluto.jl notebook if valid path passed
 * * a URL to a new notebook if no path passed
 * * an Error in all other cases
 */
const openNotebook = async (path?: string, forceNew = false) => {
  const window = BrowserWindow.getFocusedWindow()!;

  if (path && !isExtMatch(path)) {
    dialog.showErrorBox(
      'PLUTO-CANNOT-OPEN-NOTEBOOK',
      'Not a supported file type.'
    );
    return;
  }

  if (!forceNew && !path) {
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
    [path] = r.filePaths;
  }

  const loader = new Loader(window);

  if (plutoURL) {
    const res = await axios.post(
      `http://localhost:${plutoURL.port}/${path ? 'open' : 'new'}?secret=${
        plutoURL.secret
      }${path ? `&path=${path}` : ''}`
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
  notebook?: string
) => {
  if (plutoURL) {
    log.info('LAUNCHING\n', 'project:', project, '\nnotebook:', notebook);
    await openNotebook(notebook);
    return;
  }

  await extractJulia(loading, getAssetPath);

  loading.webContents.send('pluto-url', 'loading');

  const p = join(app.getPath('userData'), '/project/');
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p);
  }

  const loc = project ?? process.env.DEBUG_PROJECT_PATH ?? p;

  log.info('LAUNCHING\n', 'project:', loc, '\nnotebook:', notebook);

  let res: ChildProcessWithoutNullStreams | null;

  if (!store.has('JULIA-PATH')) {
    dialog.showErrorBox(
      'JULIA NOT FOUND',
      'Please download latest julia win64 portable zip and place it in the assets folder.'
    );
    return;
  }

  const julia = store.has('CUSTOM-JULIA-PATH')
    ? (store.get('CUSTOM-JULIA-PATH') as string)
    : getAssetPath(store.get('JULIA-PATH') as string);

  log.verbose(chalk.bgBlueBright(`Julia found at: ${julia}`));

  if (notebook) {
    res = spawn(julia, [
      `--project=${loc}`,
      getAssetPath(`script.jl`),
      notebook,
    ]);
  } else
    res = spawn(julia, [
      `--project=${loc}`,
      getAssetPath(
        process.env.DEBUG_PROJECT_PATH ? `pluto_no_update.jl` : `script.jl`
      ),
    ]);

  res.stdout.on('data', (data: { toString: () => any }) => {
    //   console.log(`stdout: ${data}`);
    const plutoLog = data.toString();
    if (plutoLog.includes('Loading') || plutoLog.includes('loading'))
      loading.webContents.send('pluto-url', 'loading');
    if (plutoURL === null) {
      if (plutoLog.includes('?secret=')) {
        const urlMatch = plutoLog.match(/http\S+/g);
        const entryUrl = urlMatch[0];

        const url = new URL(entryUrl);
        plutoURL = {
          url: entryUrl,
          port: url.port,
          secret: url.searchParams.get('secret')!,
        };

        loading.webContents.send('pluto-url', 'loaded');
        win.loadURL(entryUrl);

        console.log('Entry url found:', plutoURL);
      }
    }
    log.info(chalk.blue(plutoLog));
  });

  res.stderr.on('data', (data: any) => {
    const dataString = data.toString();
    const error: Error = {
      name: 'pluto-launch-error',
      message: dataString,
    };

    // let secret1 : string | null;

    if (dataString.includes('Updating'))
      loading.webContents.send('pluto-url', 'updating');

    if (dataString.includes('Loading') || dataString.includes('loading'))
      loading.webContents.send('pluto-url', 'loading');
    // else if (dataString.includes('No Changes'))
    //   loading.webContents.send('pluto-url', 'No update found');
    if (plutoURL === null) {
      const plutoLog = dataString;
      if (plutoLog.includes('?secret=')) {
        const urlMatch = plutoLog.match(/http\S+/g);
        const entryUrl = urlMatch[0];

        const url = new URL(entryUrl);
        plutoURL = {
          url: entryUrl,
          port: url.port,
          secret: url.searchParams.get('secret')!,
        };

        loading.webContents.send('pluto-url', 'loaded');
        win.loadURL(entryUrl);

        log.verbose('Entry url found:', plutoURL);
      }
    }

    // win.webContents.send("pluto-url", error);
    log.error(chalk.bgRed(error.name), error.message);
  });

  res.on('close', (code: any) => {
    if (code !== 0) {
      dialog.showErrorBox(code, 'Pluto crashed');
    }
    console.log(`child process exited with code ${code}`);
  });

  res.on('exit', (code: any) => {
    console.log(`child process exited with code ${code}`);
  });

  closePluto = () => {
    if (res) {
      console.log('Killing Pluto process.');
      res?.kill();
    }
  };
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

  const details = await download(window, url, {
    saveAs: true,
    openFolderWhenDone: true,
  });

  details.on('done', () => {
    const line = `${details.getFilename()} download to ${details.getSavePath()}.`;
    console.log(chalk.green(line));
    log.info(line);
  });
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
      log.info(chalk.blue(`File ${id} has been shutdown.`));
      window.loadURL(plutoURL.url);
    } else {
      dialog.showErrorBox(res.statusText, res.data);
    }
  } catch (error) {
    // dialog.showErrorBox('Cannot shutdown file', 'We are logging this error');
    log.error(chalk.red(error));
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
      log.info(chalk.blue(`File ${id} has been moved to ${filePath}.`));
      return filePath;
    }
    dialog.showErrorBox(res.statusText, res.data);
  } catch (error) {
    dialog.showErrorBox(
      'Cannot move file',
      'Please check if you are using a valid file name.'
    );
    log.error(chalk.red(error));
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
