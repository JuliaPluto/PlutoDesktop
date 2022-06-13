import { BrowserWindow, dialog } from 'electron';
import log from 'electron-log';
import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import chalk from 'chalk';
import axios from 'axios';
import electronDl, { download } from 'electron-dl';
import fs from 'node:fs';
import { PlutoExport } from '../../types/enums';

// console.log(Pluto);

electronDl();

let plutoURL: PlutoURL | null = null;

/**
 * @param path path to a .pluto.jl file
 * @returns * a URL to openend .pluto.jl notebook if valid path passed
 * * a URL to a new notebook if no path passed
 * * an Error in all other cases
 */
const openNotebook: (path?: string) => Promise<string | Error> = async (
  path?: string
) => {
  if (path && !path.includes('.pluto.jl'))
    return {
      name: 'pluto-cannot-open-notebook',
      message: 'Not a valid .pluto.jl file',
    };
  if (plutoURL) {
    const res = await axios.post(
      `http://localhost:${plutoURL.port}/${path ? 'open' : 'new'}?secret=${
        plutoURL.secret
      }${path ? `&path=${path}` : ''}`
    );
    if (res.status === 200) {
      return `http://localhost:${plutoURL.port}/edit?secret=${plutoURL.secret}&id=${res.data}`;
    }
    return {
      name: 'pluto-cannot-open-notebook',
      message: 'Please check if you are using the correct secret.',
    };
  }

  return {
    name: 'pluto-not-initialized',
    message: 'Please wait for pluto to initialize.',
  };
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
  win: BrowserWindow,
  getAssetPath: (...paths: string[]) => string,
  project?: string,
  notebook?: string
) => {
  if (plutoURL) {
    log.info('LAUNCHING\n', 'project:', project, '\nnotebook:', notebook);
    if (notebook) {
      const res = await openNotebook(notebook);
      if (typeof res === 'string') {
        win.loadURL(res);
      } else {
        dialog.showErrorBox(res.name, res.message);
      }
    }
    return;
  }

  win.webContents.send('pluto-url', 'loading');

  const p = getAssetPath('../project/');
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p);
  }

  const loc = project ?? p;

  log.info('LAUNCHING\n', 'project:', project, '\nnotebook:', notebook);

  let res: ChildProcessWithoutNullStreams | null;

  if (notebook) {
    res = spawn('julia', [
      `--project=${loc}`,
      getAssetPath(`script.jl`),
      notebook,
    ]);
  } else res = spawn('julia', [`--project=${loc}`, getAssetPath(`script.jl`)]);

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

        win.webContents.send('pluto-url', plutoURL);
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
      win.webContents.send('pluto-url', 'updating');
    else if (dataString.includes('No Changes'))
      win.webContents.send('pluto-url', 'no_update');
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

        win.webContents.send('pluto-url', plutoURL);
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

export { runPluto, updatePluto, openNotebook, exportNotebook };
