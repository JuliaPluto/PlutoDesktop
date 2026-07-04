import { app, dialog } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

import { Globals } from './globals.ts';
import { getAssetPath } from './paths.ts';
import { findJulia } from './plutoProcess.ts';
import {
  canCheckForUpdates,
  checkForUpdates,
  getUpdateStatusText,
  hasDownloadedUpdate,
  restartToUpdate,
} from './updater.ts';

const readTomlValue = (filePath: string, pattern: RegExp): string | null => {
  try {
    return fs.readFileSync(filePath, 'utf8').match(pattern)?.[1] ?? null;
  } catch {
    return null;
  }
};

// The version of the Pluto package the app is running: read from the located
// package's Project.toml, or from the version pinned in the bundled
// environment if Pluto hasn't been located yet.
const getPlutoVersion = (): string =>
  (Globals.PLUTO_LOCATION &&
    readTomlValue(
      path.join(Globals.PLUTO_LOCATION, 'Project.toml'),
      /^version\s*=\s*"([^"]+)"/m,
    )) ||
  readTomlValue(
    getAssetPath('env_for_julia', 'Project.toml'),
    /^Pluto\s*=\s*"=([^"]+)"/m,
  ) ||
  'Unknown';

// findJulia() always returns a path inside the bundled julia-X.Y.Z directory.
const getJuliaVersion = (): string =>
  findJulia().match(/julia-(\d+\.\d+\.\d+)(?:[\\/]|$)/)?.[1] ?? 'Unknown';

export const showAboutDialog = async (): Promise<void> => {
  // Reopen the dialog after "Check for updates" so the new status is visible.
  for (;;) {
    const buttons = [
      ...(hasDownloadedUpdate() ? ['Restart to update'] : []),
      ...(canCheckForUpdates() ? ['Check for updates'] : []),
      'OK',
    ];

    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: 'About Pluto.jl Desktop',
      message: 'Pluto.jl Desktop',
      detail: [
        `Version: ${app.getVersion()}`,
        `Pluto version: ${getPlutoVersion()}`,
        `Julia version: ${getJuliaVersion()}`,
        `Updates: ${getUpdateStatusText()}`,
      ].join('\n'),
      buttons,
      cancelId: buttons.length - 1,
      defaultId: buttons.length - 1,
    });

    const clicked = buttons[response];
    if (clicked === 'Restart to update') restartToUpdate();
    if (clicked !== 'Check for updates') return;
    checkForUpdates();
  }
};
