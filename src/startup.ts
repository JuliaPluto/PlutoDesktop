import fs from "node:fs";
import path from "node:path";

import { Globals } from "./globals";
import { generalLogger, juliaLogger } from "./logger";
import {
  DEPOT_LOCATION,
  READONLY_DEPOT_LOCATION,
  USER_DATA_PATH,
  getAssetPath,
} from "./paths";
import { findJulia } from "./plutoProcess";
import Pluto from "./pluto";
import { copyDirectoryRecursive, findOpenPort } from "./util";
import { showError } from "./windowsDialogs";

type StatusCallback = (status: string) => void;

export async function initGlobals() {
  Globals.JULIA = findJulia();
  generalLogger.info(`Julia found at: ${Globals.JULIA}`);
  Globals.JULIA_PROJECT =
    process.env.DEBUG_PROJECT_PATH ?? getAssetPath("env_for_julia");

  Globals.PLUTO_PORT = await findOpenPort(7122);
  generalLogger.info(`Pluto will run on port: ${Globals.PLUTO_PORT}`);
}

export async function startup(statusUpdate: StatusCallback) {
  statusUpdate("Loading Pluto...");

  if (!fs.existsSync(DEPOT_LOCATION)) {
    generalLogger.info("Copying Julia depot from app resources...");
    copyDirectoryRecursive(READONLY_DEPOT_LOCATION, DEPOT_LOCATION);
  }

  const options = [`--project=${Globals.JULIA_PROJECT}`];
  const sysimageLocation = getAssetPath("pluto.so");
  if (fs.existsSync(sysimageLocation)) {
    options.push(`--sysimage=${sysimageLocation}`);
  }

  options.push(getAssetPath("run_pluto.jl"));
  options.push(DEPOT_LOCATION);
  options.push(path.join(USER_DATA_PATH, "unsaved_notebooks"));
  options.push(Globals.PLUTO_SECRET);
  options.push(String(Globals.PLUTO_PORT));

  const proc = Bun.spawn([Globals.JULIA, ...options], {
    env: {
      ...process.env,
      JULIA_DEPOT_PATH: DEPOT_LOCATION,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const handleChunk = (chunk: Uint8Array) => {
    const text = new TextDecoder().decode(chunk);

    if (text.includes("Updating")) statusUpdate("Updating Pluto packages...");
    if (text.includes("Loading") || text.includes("loading")) {
      statusUpdate("Loading Pluto...");
    }

    if (!Globals.PLUTO_URL && text.includes("?secret=")) {
      const urlMatch = text.match(/http\S+/g);
      const entryUrl = urlMatch?.[0];
      if (entryUrl) {
        const tempURL = new URL(entryUrl);
        if (tempURL.hostname === "localhost") tempURL.hostname = "127.0.0.1";
        Globals.PLUTO_URL = new URL(`${tempURL.protocol}//${tempURL.host}`);
        statusUpdate("Pluto is ready.");
        generalLogger.info(`Pluto entry URL found: ${Pluto.homeUrl()}`);
        resolveReady();
      }
    }

    if (
      text.includes(
        "failed to send request: The server name or address could not be resolved",
      )
    ) {
      rejectReady(new Error("Pluto install failed, no internet connection."));
    }

    juliaLogger.info(text.trimEnd());
  };

  void readStream(proc.stdout, handleChunk);
  void readStream(proc.stderr, handleChunk);

  proc.exited.then((code) => {
    juliaLogger.info(`Julia process exited with code ${code}`);
    if (code !== 0 && !Globals.PLUTO_STARTED) {
      rejectReady(new Error(`Pluto crashed with exit code ${code}`));
    }
  });

  Pluto.closePlutoFunction = () => {
    generalLogger.info("Stopping Pluto process.");
    proc.kill();
  };

  try {
    await ready;
  } catch (error) {
    await showError("Cannot start Pluto", String(error));
    throw error;
  }
}

async function readStream(
  stream: ReadableStream<Uint8Array> | null,
  onChunk: (chunk: Uint8Array) => void,
) {
  if (!stream) return;
  const reader = stream.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) onChunk(value);
  }
}
