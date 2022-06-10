import { BrowserWindow } from 'electron';
import log from 'electron-log';
import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import chalk from 'chalk';
import Pluto from '../global';

const runPluto = async (
  win: BrowserWindow,
  getAssetPath: (...paths: string[]) => string,
  project?: string,
  notebook?: string
) => {
  win.webContents.send('pluto-url', 'loading');

  const loc = project ?? '.';

  let res: ChildProcessWithoutNullStreams | null;

  if (notebook) {
    res = spawn('julia', [
      `--project=${loc}`,
      getAssetPath(`script.jl`),
      notebook,
    ]);
  } else res = spawn('julia', [`--project=${loc}`, getAssetPath(`script.jl`)]);

  let secret: string | null = null;

  res.stdout.on('data', (data: { toString: () => any }) => {
    //   console.log(`stdout: ${data}`);
    const plutoLog = data.toString();
    if (secret === null) {
      if (plutoLog.includes('?secret=')) {
        const match = plutoLog.match(/secret=\S+/g);
        const matchItems = match[0].split('=').reverse();
        [secret] = matchItems;

        const urlMatch = plutoLog.match(/http\S+/g);
        const entryUrl = urlMatch[0];

        const url = new URL(entryUrl);
        const plutoURL: Pluto.PlutoURL = {
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

    if (dataString.includes('Updating'))
      win.webContents.send('pluto-url', 'updating');
    else if (dataString.includes('No Changes'))
      win.webContents.send('pluto-url', 'no_update');
    if (secret === null) {
      const plutoLog = dataString;
      if (plutoLog.includes('?secret=')) {
        const match = plutoLog.match(/secret=\S+/g);
        const matchItems = match[0].split('=').reverse();
        [secret] = matchItems;

        const urlMatch = plutoLog.match(/http\S+/g);
        const entryUrl = urlMatch[0];

        const url = new URL(entryUrl);
        const plutoURL: Pluto.PlutoURL = {
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

export { runPluto, updatePluto };
