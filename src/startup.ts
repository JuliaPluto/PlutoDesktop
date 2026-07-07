import * as fs from 'node:fs';
import * as path from 'node:path';
import { generalLogger, juliaLogger } from './logger.ts';
import { getAssetPath, PLUTO_SYSIMAGE_LOCATION } from './paths.ts';
import {
  findJulia,
  findPluto,
  getServerDepotPath,
  plutoProject,
} from './plutoProcess.ts';
import type { App } from 'electron';
import { dialog } from 'electron';
import { spawn } from 'node:child_process';
import { detect } from 'detect-port';
import Pluto from './pluto.ts';
import { Globals } from './globals.ts';
import { GlobalWindowManager } from './windowHelpers.ts';

export async function initGlobals() {
  generalLogger.log(`Julia found at: ${findJulia()}`);

  // strip a trailing path separator
  Globals.PLUTO_LOCATION = (await findPluto()).replace(/[/\\]$/, '');
  generalLogger.log(`Pluto found at: ${Globals.PLUTO_LOCATION}`);

  Globals.PLUTO_PORT = await detect(7122);
  generalLogger.log(`Pluto will run on port: ${Globals.PLUTO_PORT}`);
}

export async function startup(app: App, loadingUrl: string) {
  // In packaged Windows builds, MAIN_WINDOW_WEBPACK_ENTRY is a file:// URL
  // built from a backslash path (`file://C:\...`), while webContents.getURL()
  // returns Chromium's canonical form (`file:///C:/...`). Normalize so the
  // comparison below works in both development and production.
  const normalizedLoadingUrl = new URL(loadingUrl).href;

  const options = [`--project=${plutoProject}`];
  if (fs.existsSync(PLUTO_SYSIMAGE_LOCATION)) {
    // The Pluto server image (scripts/generateAssets.js). It has Pluto and all
    // its dependencies precompiled, so the server starts fast, offline, and
    // without touching a depot. Notebook workers ignore it and use the default
    // sysimage (Malt launches them with just the julia executable path).
    options.push(`--sysimage=${PLUTO_SYSIMAGE_LOCATION}`);
    generalLogger.info(
      `System image found at ${PLUTO_SYSIMAGE_LOCATION}. Julia will use this instead of the default`,
    );
  } else {
    generalLogger.warn(
      `No Pluto sysimage at ${PLUTO_SYSIMAGE_LOCATION}; starting Pluto without one (slower; dev only).`,
    );
  }

  options.push(getAssetPath('run_pluto.jl'));
  // See run_pluto.jl for info about these command line arguments.
  options.push(path.join(app.getPath('userData'), 'unsaved_notebooks'));
  options.push(Globals.PLUTO_SECRET);
  options.push(String(Globals.PLUTO_PORT));

  try {
    const res = spawn(findJulia(), options, {
      env: { ...process.env, JULIA_DEPOT_PATH: getServerDepotPath() },
    });

    const loggerListener = (data: Buffer) => {
      const plutoLog = data.toString();

      if (!Globals.PLUTO_URL) {
        if (plutoLog.includes('?secret=')) {
          const entryUrl = plutoLog.match(/http\S+/g)?.[0];

          if (entryUrl) {
            const tempURL = new URL(entryUrl);
            if (tempURL.hostname === 'localhost')
              // there are issues with IPv6 and Node.JS on certain hardware / operating systems
              // the loopback IP is generally safer
              tempURL.hostname = '127.0.0.1';

            Globals.PLUTO_URL = new URL(`${tempURL.protocol}//${tempURL.host}`);
            GlobalWindowManager.all((p) => {
              void p.onServerReady(normalizedLoadingUrl);
            });
            Globals.markStarted();

            generalLogger.verbose('Entry url found:', Globals.PLUTO_URL);
          }
        } else if (
          plutoLog.includes(
            'failed to send request: The server name or address could not be resolved',
          )
        ) {
          generalLogger.error(
            'INTERNET-CONNECTION-ERROR',
            'Pluto install failed, no internet connection.',
          );
          dialog.showErrorBox(
            'CANNOT-INSTALL-PLUTO',
            'Please check your internet connection!',
          );
          app.exit();
        }
      }

      juliaLogger.info(plutoLog);
    };

    res.stdout.on('data', loggerListener);
    res.stderr.on('data', loggerListener);

    // An intentional kill (e.g. when the last window closes) exits with a
    // non-zero code on Windows; only report unexpected exits as a crash.
    let killedIntentionally = false;

    res.once('close', (code) => {
      if (code !== 0 && !killedIntentionally) {
        dialog.showErrorBox('Pluto crashed', `Exit code: ${code}`);
      }
      juliaLogger.info(`child process exited with code ${code}`);
    });

    Pluto.closePlutoFunction = () => {
      juliaLogger.verbose('Killing Pluto process.');
      killedIntentionally = true;
      res.kill();
    };
  } catch (e) {
    generalLogger.error('PLUTO-RUN-ERROR', e);
  }
}
