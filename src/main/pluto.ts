import { BrowserWindow, dialog, ipcMain } from 'electron';
import log from 'electron-log';
import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import chalk from 'chalk';
import axios from 'axios';
import electronDl, { download } from 'electron-dl';
import fs from 'node:fs';
import unzip from 'extract-zip';
import { join } from 'node:path';
import isDev from 'electron-is-dev';
import { PlutoExport } from '../../types/enums';
import store from './store';
import { isExtMatch, PLUTO_FILE_EXTENSIONS } from './util';

electronDl();

/**
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
    store.has('JULIA-PATH') &&
    fs.existsSync(getAssetPath(store.get('JULIA-PATH') as string))
  )
    return;

  try {
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
    loading.webContents.send('pluto-url', `File found:${zip}`);
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
      return;
    }
    dialog.showErrorBox(
      'PLUTO-CANNOT-OPEN-NOTEBOOK',
      'Please check if you are using the correct secret.'
    );
    return;
  }

  dialog.showErrorBox(
    'PLUTO-CANNOT-OPEN-NOTEBOOK',
    'Please wait for pluto to initialize.'
  );
};

/**
 * The main function the actually runs a `julia` script that
 * checks and runs `Pluto` with specified options
 * It also updates the render process about the current status in the `pluto-url` channel.
 * @param win the BrowserWindow in which we are tryng to run pluto
 * @param getAssetPath a function to get asset path in dev and prod environment
 * @param project project path
 * @param notebook pluto notebook path
 * @returns nothing
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

  const p = getAssetPath('../project/');
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p);
  }

  const loc = project ?? process.env.DEBUG_PROJECT_PATH ?? p;

  log.info('LAUNCHING\n', 'project:', loc, '\nnotebook:', notebook);

  let res: ChildProcessWithoutNullStreams | null;

  if (!store.has('JULIA-PATH')) {
    dialog.showErrorBox(
      'JULIA NOT FOUND',
      'If dev env, please download latest julia win64 portable zip and place it in the assets folder.'
    );
    return;
  }

  const julia = getAssetPath(store.get('JULIA-PATH') as string);

  if (notebook) {
    res = spawn(julia as string, [
      `--project=${loc}`,
      getAssetPath(`script.jl`),
      notebook,
    ]);
  } else
    res = spawn(julia as string, [
      `--project=${loc}`,
      getAssetPath(`script.jl`),
    ]);

  res.stdout.on('data', (data: { toString: () => any }) => {
    //   console.log(`stdout: ${data}`);
    const plutoLog = data.toString();
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
    console.log(`child process exited with code ${code}`);
  });
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

  let url: string | null;
  let ext: string | null;
  let title: string | null;
  switch (type) {
    case PlutoExport.FILE:
      url = `http://localhost:${plutoURL.port}/notebookfile?secret=${plutoURL.secret}&id=${id}`;
      ext = 'pluto.jl';
      title = 'Pluto Notebook';
      break;
    case PlutoExport.HTML:
      url = `http://localhost:${plutoURL.port}/notebookexport?secret=${plutoURL.secret}&id=${id}`;
      ext = 'html';
      title = 'HTML File';
      break;
    default:
      url = `http://localhost:${plutoURL.port}/statefile?secret=${plutoURL.secret}&id=${id}`;
      ext = 'plutostate';
      title = 'Pluto State File';
      break;
  }

  await download(BrowserWindow.getFocusedWindow()!, url, {
    openFolderWhenDone: true,
    saveAs: true,
  });
};

ipcMain.on(
  'PLUTO-OPEN-NOTEBOOK',
  async (_event, path?: string, forceNew?: boolean): Promise<void> =>
    openNotebook(path, forceNew)
);

const isPlutoRunning = () => plutoURL !== null;

export { runPluto, updatePluto, openNotebook, exportNotebook, isPlutoRunning };
