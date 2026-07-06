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

// The Pluto server sysimage, built at build time (scripts/generateAssets.js).
// Launching `julia --sysimage=<this>` gives the server Pluto and all its
// dependencies precompiled, so it needs no depot packages, no precompilation,
// and works offline. Notebook workers keep using the DEFAULT Julia sysimage.
const SYSIMAGE_BASENAME =
  process.platform === 'win32'
    ? 'pluto_sysimage.dll'
    : process.platform === 'darwin'
      ? 'pluto_sysimage.dylib'
      : 'pluto_sysimage.so';
export const PLUTO_SYSIMAGE_LOCATION = getGeneratedAssetPath(SYSIMAGE_BASENAME);

// The small, read-only depot shipped alongside the sysimage. It holds only the
// JLL binary artifacts the server needs at runtime (e.g. MbedTLS_jll) whose
// versions differ from the ones bundled with Julia — no package sources and no
// precompile caches (those are in the sysimage). Stacked read-only behind the
// user's depot; everything Pluto installs for notebooks goes to the user depot.
export const PLUTO_SERVER_DEPOT_LOCATION = getGeneratedAssetPath('pluto_server_depot');

// Pluto's own package source, extracted from the build at build time. Needed on
// disk so PLUTO_LOCATION (used by the file:// frontend, see src/pluto.ts) and
// Base.locate_package resolve. The Pluto *module* itself comes from the sysimage.
export const PLUTO_SOURCE_LOCATION = getGeneratedAssetPath('pluto_source', 'Pluto');
