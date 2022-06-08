import { BrowserWindow } from "electron";
import log from "electron-log";
import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { Pluto } from "packages/global";
import isDev from "electron-is-dev";

import path from "node:path";

const runPluto = async (
  win: BrowserWindow,
  project?: string,
  notebook?: string
) => {
  win.webContents.send("pluto-url", "loading");

  const loc = project ?? ".";

  let res: ChildProcessWithoutNullStreams | null;

  if (notebook) {
    res = spawn("julia", [
      "--project=" + loc,
      isDev
        ? "./extraResources/script.jl"
        : path.join(process.resourcesPath, "extraResources", "script.jl"),
      notebook,
    ]);
  } else
    res = spawn("julia", [
      "--project=" + loc,
      isDev
        ? "./extraResources/script.jl"
        : path.join(process.resourcesPath, "extraResources", "script.jl"),
    ]);

  let secret: string | null = null;

  res.stdout.on("data", (data: { toString: () => any }) => {
    //   console.log(`stdout: ${data}`);
    if (secret === null) {
      const plutoLog = data.toString();
      if (plutoLog.includes("?secret=")) {
        const match = plutoLog.match(/secret=\S+/g);
        secret = match[0].split("=").reverse()[0];

        const urlMatch = plutoLog.match(/http\S+/g);
        const entryUrl = urlMatch[0];

        const url = new URL(entryUrl);
        const plutoURL: Pluto.PlutoURL = {
          url: entryUrl,
          port: url.port,
          secret: url.searchParams.get("secret")!,
        };

        win.webContents.send("pluto-url", plutoURL);
        win.loadURL(entryUrl);

        console.log("Entry url found:", plutoURL);
      }
    }
  });

  res.stderr.on("data", (data: any) => {
    data = data.toString();
    const error: Error = {
      name: "pluto-launch-error",
      message: data,
    };

    if (data.includes("Updating"))
      win.webContents.send("pluto-url", "updating");
    else if (data.includes("No Changes"))
      win.webContents.send("pluto-url", "no_update");
    if (secret === null) {
      const plutoLog = data;
      if (plutoLog.includes("?secret=")) {
        const match = plutoLog.match(/secret=\S+/g);
        secret = match[0].split("=").reverse()[0];

        const urlMatch = plutoLog.match(/http\S+/g);
        const entryUrl = urlMatch[0];

        const url = new URL(entryUrl);
        const plutoURL: Pluto.PlutoURL = {
          url: entryUrl,
          port: url.port,
          secret: url.searchParams.get("secret")!,
        };

        win.webContents.send("pluto-url", plutoURL);
        win.loadURL(entryUrl);

        console.log("Entry url found:", plutoURL);
      }
    }

    // win.webContents.send("pluto-url", error);
    log.error(error.name, error.message);
  });

  res.on("close", (code: any) => {
    console.log(`child process exited with code ${code}`);
  });
};

const updatePluto = () => {};

export { runPluto };
