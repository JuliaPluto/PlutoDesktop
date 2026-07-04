/**
 * File for managing a local backend process which notebooks are run on
 */

import * as fs from 'node:fs';
import {
  DEPOT_LOCATION,
  getAssetPath,
  getGeneratedAssetPath,
} from './paths.ts';
import { generalLogger, juliaLogger } from './logger.ts';
import { app, dialog } from 'electron';
import { spawn } from 'node:child_process';

export const plutoProject =
  process.env.DEBUG_PROJECT_PATH ?? getAssetPath('env_for_julia');

let _julia: string | null = null;
export const findJulia = () => {
  if (_julia !== null) return _julia;
  // The generated_assets directory always exists in a packaged app; in
  // development it's created by the first `npm start` or `npm run make`.
  const generatedAssetsDir = getGeneratedAssetPath('.');
  const files = fs.existsSync(generatedAssetsDir)
    ? fs.readdirSync(generatedAssetsDir)
    : [];

  const julia_dir = files.find((s) => /^julia-\d+.\d+.\d+$/.test(s));

  if (julia_dir == null) {
    const message = `Couldn't find the bundled Julia in ${generatedAssetsDir}. Pluto Desktop cannot start without it — please reinstall the app.`;
    generalLogger.error('JULIA-NOT-FOUND', message);
    dialog.showErrorBox('Julia not found', message);
    app.exit(1);
    throw new Error(message);
  }

  const juliaExecutable = process.platform === 'win32' ? 'julia.exe' : 'julia';
  _julia = getGeneratedAssetPath(julia_dir, 'bin', juliaExecutable);

  return _julia;
};

let _plutoLocation: string | null = null;
export function findPluto(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (_plutoLocation !== null) resolve(String(_plutoLocation));

    const juliaCmd = findJulia();
    let resolved = false;

    const options = [
      `--project=${plutoProject}`,
      getAssetPath('locate_pluto.jl'),
    ];
    const proc = spawn(juliaCmd, options, {
      env: { ...process.env, JULIA_DEPOT_PATH: DEPOT_LOCATION },
    });
    proc.stdout.on('data', (chunk) => {
      _plutoLocation = chunk.toString();
      resolved = true;
      resolve(String(_plutoLocation));
    });
    proc.stderr.on('error', (err) => {
      juliaLogger.error('Error determining Pluto.jl package location:', err);
      reject();
    });
    proc.on('close', () => {
      if (!resolved) {
        reject('Pluto could not be found with `locate_pluto.jl`!');
      }
    });
  });
}
