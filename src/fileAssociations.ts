/**
 * Windows file-type association handling.
 *
 * This registers Pluto as an application that *can* open Pluto notebooks, so it
 * shows up in the Explorer "Open with" list for `.jl` (and the other Pluto
 * extensions). It deliberately does NOT make Pluto the default handler for any
 * extension — that stays the user's choice.
 *
 * The registration is written on Squirrel install/update and removed on
 * uninstall (see handleSquirrelFileAssociations). Everything lives under
 * HKCU\Software\Classes, so no administrator elevation is needed (Squirrel
 * installs per-user anyway).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { generalLogger } from './logger.ts';

/** ProgID describing "a Pluto notebook file". Namespaced to avoid collisions. */
const PROG_ID = 'PlutoDesktop.Notebook';
const FRIENDLY_NAME = 'Pluto Notebook';

/**
 * Extensions to advertise in the "Open with" list. Windows resolves a file's
 * handler by its FINAL extension only, so we register the single-segment
 * extensions Pluto understands (see PLUTO_FILE_EXTENSIONS in util.ts). Compound
 * forms like `.pluto.jl` or `.jl.txt` collapse to `.jl` / `.txt`; we
 * deliberately never touch `.txt`.
 */
const ASSOCIATED_EXTENSIONS = ['.jl', '.pluto', '.plutojl', '.nbjl', '.pljl'];

const CLASSES_KEY = 'HKCU\\Software\\Classes';
const PROG_KEY = `${CLASSES_KEY}\\${PROG_ID}`;

/** Run a `reg` command, swallowing (but logging) failures so one bad write
 * never aborts the rest of the registration. */
const runReg = (args: string[]): boolean => {
  try {
    execFileSync('reg', args, { windowsHide: true, stdio: 'ignore' });
    return true;
  } catch (error) {
    generalLogger.warn(`reg ${args.join(' ')} failed:`, error);
    return false;
  }
};

/**
 * The exe to launch when opening a notebook. Squirrel installs each version
 * under `app-<version>/` and places a small forwarding stub one level up (next
 * to Update.exe) that always launches the newest version and forwards CLI
 * arguments. Targeting that stub keeps the association valid across
 * auto-updates. Falls back to the running exe when the stub isn't present
 * (e.g. non-Squirrel or development runs).
 */
const resolveLauncherExe = (): string => {
  const exeName = path.basename(process.execPath);
  const stub = path.resolve(path.dirname(process.execPath), '..', exeName);
  return fs.existsSync(stub) ? stub : process.execPath;
};

/**
 * If an extension's default handler (its `(Default)` value) is our own ProgID,
 * remove it. A previous version registered associations the "make default" way;
 * since we only ever want to be a candidate, undo that. This never touches a
 * user's explicit default (that lives in Explorer's UserChoice, not here) or a
 * default owned by another application.
 */
const clearDefaultIfOurs = (ext: string): void => {
  try {
    const out = execFileSync('reg', ['query', `${CLASSES_KEY}\\${ext}`, '/ve'], {
      windowsHide: true,
    }).toString();
    // reg prints "(Default)    REG_SZ    <value>"; only clear it if it's ours.
    if (new RegExp(`REG_SZ\\s+${PROG_ID}\\s*$`, 'm').test(out)) {
      runReg(['delete', `${CLASSES_KEY}\\${ext}`, '/ve', '/f']);
      generalLogger.info(`Cleared stale default handler for ${ext}`);
    }
  } catch {
    // Key or (Default) value doesn't exist — nothing to clear.
  }
};

/**
 * Register Pluto as an "Open with" candidate for Pluto notebook extensions.
 * Idempotent: safe to run on every install and update.
 */
export const registerFileAssociations = (): void => {
  if (process.platform !== 'win32') return;

  const exe = resolveLauncherExe();
  generalLogger.info('Registering Pluto notebook file associations for', exe);

  // The ProgID: how Windows opens a Pluto notebook.
  runReg(['add', PROG_KEY, '/ve', '/d', FRIENDLY_NAME, '/f']);
  runReg(['add', PROG_KEY, '/v', 'FriendlyTypeName', '/d', FRIENDLY_NAME, '/f']);
  runReg(['add', `${PROG_KEY}\\DefaultIcon`, '/ve', '/d', `${exe},0`, '/f']);
  runReg([
    'add',
    `${PROG_KEY}\\shell\\open\\command`,
    '/ve',
    '/d',
    `"${exe}" "%1"`,
    '/f',
  ]);

  for (const ext of ASSOCIATED_EXTENSIONS) {
    // Advertise as a candidate via OpenWithProgids — this adds us to the
    // "Open with" list WITHOUT changing the default handler.
    runReg([
      'add',
      `${CLASSES_KEY}\\${ext}\\OpenWithProgids`,
      '/v',
      PROG_ID,
      '/t',
      'REG_NONE',
      '/f',
    ]);
    clearDefaultIfOurs(ext);
  }
};

/** Remove everything registerFileAssociations wrote. */
export const unregisterFileAssociations = (): void => {
  if (process.platform !== 'win32') return;
  generalLogger.info('Unregistering Pluto notebook file associations');

  for (const ext of ASSOCIATED_EXTENSIONS) {
    runReg([
      'delete',
      `${CLASSES_KEY}\\${ext}\\OpenWithProgids`,
      '/v',
      PROG_ID,
      '/f',
    ]);
    clearDefaultIfOurs(ext);
  }
  runReg(['delete', PROG_KEY, '/f']);
};

/**
 * Called at startup. When the app is being run by Squirrel with an install/
 * update/uninstall lifecycle flag, (un)register the file associations. Returns
 * nothing; the caller still lets electron-squirrel-startup drive the shortcut
 * handling and the subsequent app.quit().
 */
export const handleSquirrelFileAssociations = (): void => {
  if (process.platform !== 'win32') return;
  switch (process.argv[1]) {
    case '--squirrel-install':
    case '--squirrel-updated':
      registerFileAssociations();
      break;
    case '--squirrel-uninstall':
      unregisterFileAssociations();
      break;
    default:
      break;
  }
};
