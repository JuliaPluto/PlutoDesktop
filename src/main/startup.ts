import * as fs from 'node:fs';
import * as path from 'node:path';
import { generalLogger, juliaLogger } from './logger.ts';
import { DEPOT_LOCATION, READONLY_DEPOT_LOCATION, getAssetPath } from './paths.ts';
import { findJulia, findPluto } from './plutoProcess.ts';
import { copyDirectoryRecursive, setAxiosDefaults } from './util.ts';
import type { App } from 'electron';
import { dialog } from 'electron';
import chalk from 'chalk';
import { spawn } from 'node:child_process';
import Pluto from './pluto.ts';
import { Globals } from './globals.ts';
import { GlobalWindowManager } from './windowHelpers.ts';

export async function initGlobals() {
  Globals.JULIA = findJulia();
  generalLogger.log(`Julia found at: ${Globals.JULIA}`);
  Globals.JULIA_PROJECT =
    process.env.DEBUG_PROJECT_PATH ?? getAssetPath('env_for_julia');
  let loc = await findPluto();
  if (loc.endsWith('/') || loc.endsWith('\\')) {
    loc = loc.slice(0, loc.length - 1);
  }
  console.log(loc);
  Globals.PLUTO_LOCATION = loc;
  generalLogger.log(`Pluto found at: ${Globals.PLUTO_LOCATION}`);
}

export async function startup(app: App) {
  const statusUpdate = (status: string) =>
    GlobalWindowManager.all((p) =>
      p.getBrowserWindow().webContents.send('pluto-url', status)
    );

  statusUpdate('loading');

  const SYSIMAGE_LOCATION = getAssetPath('pluto.so');

  // ensure depot has been copied from read-only installation directory to writable directory
  if (!fs.existsSync(DEPOT_LOCATION)) {
    generalLogger.verbose('Copying julia_depot from installation directory...');
    copyDirectoryRecursive(READONLY_DEPOT_LOCATION, DEPOT_LOCATION);
  }

  const options = [`--project=${Globals.JULIA_PROJECT}`];
  // if (!process.env.DEBUG_PROJECT_PATH) {
  if (fs.existsSync(SYSIMAGE_LOCATION))
    options.push(`--sysimage=${SYSIMAGE_LOCATION}`);
  generalLogger.info(
    `System image found at ${SYSIMAGE_LOCATION}. Julia will use this instead of the default`
  );
  // }

  options.push(getAssetPath('run_pluto.jl'));
  // See run_pluto.jl for info about these command line arguments.
  options.push(DEPOT_LOCATION ?? '');
  options.push(path.join(app.getPath('userData'), 'unsaved_notebooks'));
  options.push(Globals.PLUTO_SECRET);

  try {
    generalLogger.verbose(
      'Executing',
      chalk.bold(Globals.JULIA),
      'with options',
      chalk.bold(options.toLocaleString().replace(',', ' '))
    );
    const res = spawn(Globals.JULIA, options, {
      env: { ...process.env, JULIA_DEPOT_PATH: DEPOT_LOCATION },
    });

    const loggerListener = (data: any) => {
      const dataString = data.toString();

      if (dataString.includes('Updating')) statusUpdate('updating');

      if (dataString.includes('Loading') || dataString.includes('loading'))
        statusUpdate('loading');

      if (!Globals.PLUTO_URL) {
        const plutoLog = dataString;
        if (plutoLog.includes('?secret=')) {
          const urlMatch = plutoLog.match(/http\S+/g);
          const entryUrl = urlMatch[0];

          const tempURL = new URL(entryUrl);
          Globals.PLUTO_URL = new URL(`${tempURL.protocol}//${tempURL.host}`);

          statusUpdate('loaded');
          setAxiosDefaults(Globals.PLUTO_URL);

          generalLogger.verbose('Entry url found:', Pluto.url);
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

      juliaLogger.info(dataString);
    };

    res.stdout.on('data', loggerListener);
    res.stderr.on('data', loggerListener);

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
}
