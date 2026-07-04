import { app } from 'electron';
import path from 'path';

// In development, __filename lives in .webpack/main/, so two levels up is the
// project root. In a packaged app, assets are found via process.resourcesPath.
export const source_root_dir = path.join(path.dirname(__filename), '..', '..');

export const RESOURCES_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'assets')
  : path.join(source_root_dir, 'assets');

// Julia and the pre-instantiated Julia depot are downloaded/built into
// generated_assets/ at build time (scripts/generateAssets.js) and shipped
// next to assets/ (see extraResource in forge.config.ts). In development the
// directory only exists after running `npm run make` (or package) once.
export const GENERATED_ASSETS_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'generated_assets')
  : path.join(source_root_dir, 'generated_assets');

export const APPDATA_PATH = app.getPath('appData');

export const getAssetPath = (...paths: string[]): string => {
  return path.join(RESOURCES_PATH, ...paths);
};

export const getGeneratedAssetPath = (...paths: string[]): string => {
  return path.join(GENERATED_ASSETS_PATH, ...paths);
};

export const getWritablePath = (...paths: string[]): string => {
  return path.join(APPDATA_PATH, 'pluto', ...paths);
};

export const READONLY_DEPOT_LOCATION = getGeneratedAssetPath('julia_depot');
export const DEPOT_LOCATION = getWritablePath('julia_depot');
