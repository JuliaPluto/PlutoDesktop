import { app } from 'electron';
import * as path from 'node:path';

export const RESOURCES_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'assets')
  : path.join(__dirname, '../../assets');
export const APPDATA_PATH = app.getPath('appData');

export const getAssetPath = (...paths: string[]): string => {
  return path.join(RESOURCES_PATH, ...paths);
};
export const getWritablePath = (...paths: string[]): string => {
  return path.join(APPDATA_PATH, 'pluto', ...paths);
};

export const READONLY_DEPOT_LOCATION = getAssetPath('julia_depot');
export const DEPOT_LOCATION = getWritablePath('julia_depot');
