import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const candidates = [
  process.cwd(),
  path.resolve(import.meta.dir, ".."),
  path.resolve(import.meta.dir, "..", ".."),
];

export const APP_ROOT = candidates.find((candidate) =>
  fs.existsSync(path.join(candidate, "assets")),
) ?? process.cwd();

export const ASSETS_PATH = path.join(APP_ROOT, "assets");
export const GENERATED_ASSETS_PATH = path.join(APP_ROOT, "generated_assets");
export const APPDATA_PATH =
  process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
export const USER_DATA_PATH = path.join(APPDATA_PATH, "org.plutojl.desktop");

export function getAssetPath(...parts: string[]) {
  const generatedPath = path.join(GENERATED_ASSETS_PATH, ...parts);
  if (fs.existsSync(generatedPath)) return generatedPath;
  return path.join(ASSETS_PATH, ...parts);
}

export function getGeneratedAssetPath(...parts: string[]) {
  return path.join(GENERATED_ASSETS_PATH, ...parts);
}

export function getWritablePath(...parts: string[]) {
  return path.join(USER_DATA_PATH, ...parts);
}

export const READONLY_DEPOT_LOCATION = getGeneratedAssetPath("julia_depot");
export const DEPOT_LOCATION = getWritablePath("julia_depot");
