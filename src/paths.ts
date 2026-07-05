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

export const getAssetPath = (...paths: string[]): string => {
  return path.join(RESOURCES_PATH, ...paths);
};

export const getGeneratedAssetPath = (...paths: string[]): string => {
  return path.join(GENERATED_ASSETS_PATH, ...paths);
};

// The bundled, read-only Julia depot, prepared at build time
// (scripts/generateAssets.js). It contains the package sources and precompile
// caches needed to launch the Pluto server, and is only ever read: everything
// Pluto installs for notebooks goes to the user's normal depot (see
// getServerDepotPath in plutoProcess.ts).
export const BUNDLED_DEPOT_LOCATION = getGeneratedAssetPath('julia_depot');
