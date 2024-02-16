/**
 * File for managing a local backend process which notebooks are run on
 */

import * as fs from 'node:fs';
import { DEPOT_LOCATION, getAssetPath } from './paths';
import { generalLogger, juliaLogger } from './logger';
import { spawn } from 'node:child_process';

export const plutoProject =
  process.env.DEBUG_PROJECT_PATH ?? getAssetPath('env_for_julia');

let _julia: string | null = null;
export const findJulia = () => {
  if (_julia !== null) return _julia;
  const files = fs.readdirSync(getAssetPath('.'));

  let julia_dir = files.find((s) => /^julia-\d+.\d+.\d+$/.test(s));
  let result;

  if (julia_dir == null) {
    generalLogger.error(
      "Couldn't find Julia in assets, falling back to the `julia` command."
    );
    result = `julia`;
  } else {
    result = getAssetPath(julia_dir, 'bin', 'julia.exe');
  }

  // cache the result
  _julia = result;

  return result;
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
