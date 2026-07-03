import { app } from 'electron';
import path from 'path';

// In development, __filename lives in .webpack/main/, so two levels up is the
// project root. In a packaged app, assets are found via process.resourcesPath.
export const source_root_dir = path.join(path.dirname(__filename), '..', '..');

export const RESOURCES_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'assets')
  : path.join(source_root_dir, 'assets');

export const APPDATA_PATH = app.getPath('appData');

export const getAssetPath = (...paths: string[]): string => {
  return path.join(RESOURCES_PATH, ...paths);
};

export const getWritablePath = (...paths: string[]): string => {
  return path.join(APPDATA_PATH, 'pluto', ...paths);
};

export const READONLY_DEPOT_LOCATION = getAssetPath('julia_depot');
export const DEPOT_LOCATION = getWritablePath('julia_depot');
