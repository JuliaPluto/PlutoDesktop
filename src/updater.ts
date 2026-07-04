import { app, autoUpdater } from 'electron';
import { updateElectronApp, UpdateSourceType } from 'update-electron-app';

import { generalLogger } from './logger.ts';

type UpdateStatus =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'downloading'
  | 'ready'
  | 'error';

// update.electronjs.org only serves updates for macOS and Windows, and
// update-electron-app is a no-op during development.
const updatesSupported =
  app.isPackaged && ['darwin', 'win32'].includes(process.platform);

let status: UpdateStatus = updatesSupported ? 'idle' : 'disabled';

export const initializeAutoUpdates = (): void => {
  autoUpdater.on('checking-for-update', () => {
    status = 'checking';
  });
  autoUpdater.on('update-available', () => {
    status = 'downloading';
  });
  autoUpdater.on('update-not-available', () => {
    status = 'up-to-date';
  });
  autoUpdater.on('update-downloaded', () => {
    status = 'ready';
  });
  autoUpdater.on('error', () => {
    status = 'error';
  });

  updateElectronApp({
    updateSource: {
      type: UpdateSourceType.ElectronPublicUpdateService,
      repo: 'JuliaPluto/PlutoDesktop',
    },
    updateInterval: '1 hour',
    logger: generalLogger,
  });
};

export const getUpdateStatusText = (): string => {
  switch (status) {
    case 'disabled':
      return 'Automatic updates are disabled in this build';
    case 'checking':
      return 'Checking for updates…';
    case 'up-to-date':
      return 'Up to date';
    case 'downloading':
      return 'Downloading update…';
    case 'ready':
      return 'Update downloaded, restart to install';
    case 'error':
      return 'Could not check for updates';
    case 'idle':
    default:
      return 'Not checked yet';
  }
};

export const canCheckForUpdates = (): boolean =>
  updatesSupported &&
  (status === 'idle' || status === 'up-to-date' || status === 'error');

export const hasDownloadedUpdate = (): boolean => status === 'ready';

export const checkForUpdates = (): void => {
  if (canCheckForUpdates()) autoUpdater.checkForUpdates();
};

export const restartToUpdate = (): void => {
  if (hasDownloadedUpdate()) autoUpdater.quitAndInstall();
};
