import path from "node:path";

import { generalLogger } from "./logger";

const extensions = ["jl", "pluto", "plutojl", "nbjl", "pljl"];
const progId = "PlutoDesktop.Notebook";

export function registerWindowsFileAssociations() {
  if (process.platform !== "win32") return;
  if (process.env.PLUTO_DESKTOP_REGISTER_ASSOCIATIONS === "0") return;

  const exePath = process.execPath;
  if (!exePath.toLowerCase().endsWith(".exe")) return;

  try {
    addRegKey(`HKCU\\Software\\Classes\\${progId}`, "", "Pluto Notebook");
    addRegKey(
      `HKCU\\Software\\Classes\\${progId}\\DefaultIcon`,
      "",
      `${exePath},0`,
    );
    addRegKey(
      `HKCU\\Software\\Classes\\${progId}\\shell\\open\\command`,
      "",
      `"${exePath}" "%1"`,
    );

    for (const extension of extensions) {
      addRegKey(`HKCU\\Software\\Classes\\.${extension}`, "", progId);
    }
  } catch (error) {
    generalLogger.warn("Could not register Windows file associations", error);
  }
}

function addRegKey(key: string, name: string, value: string) {
  const args = ["add", key, "/f", "/ve", "/d", value];
  if (name) args.splice(3, 0, "/v", name);
  const result = Bun.spawnSync(["reg.exe", ...args], {
    stdout: "ignore",
    stderr: "pipe",
  });

  if (!result.success) {
    throw new Error(
      `reg.exe failed for ${key}: ${new TextDecoder().decode(result.stderr)}`,
    );
  }
}

export function fileAssociationCommandFor(exePath: string) {
  return `"${path.normalize(exePath)}" "%1"`;
}
