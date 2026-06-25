import Electrobun, {
  ApplicationMenu,
  BrowserWindow,
  Updater,
  Utils,
} from "electrobun/bun";
import path from "node:path";

import { PlutoExport } from "./enums";
import { generalLogger } from "./logger";
import { registerWindowsFileAssociations } from "./windowsAssociations";
import { initGlobals, startup } from "./startup";
import Pluto from "./pluto";
import { isExtMatch } from "./util";

const windows = new Set<Pluto>();
let startupComplete = false;
const pendingFiles: string[] = [];

export function createPlutoWindow(landingUrl?: string | null): Pluto {
  console.log("Pluto Desktop: creating window");
  const pluto = new Pluto(
    new BrowserWindow({
      title: "Pluto.jl Desktop",
      url: landingUrl ?? "views://loading/index.html",
      frame: {
        x: 80,
        y: 80,
        width: 1100,
        height: 820,
      },
      renderer: "native",
      navigationRules: JSON.stringify([
        "http://127.0.0.1:*/*",
        "http://localhost:*/*",
        "https://*/*",
      ]),
    }),
  );

  windows.add(pluto);
  pluto.window.on("close", () => {
    windows.delete(pluto);
  });
  pluto.window.webview.on("new-window-open", (event: unknown) => {
    const detail = getEventDetail(event);
    if (detail?.url && Pluto.isPlutoUrl(detail.url)) {
      createPlutoWindow(detail.url);
      return;
    }
    if (detail?.url) Utils.openExternal(detail.url);
  });
  pluto.window.webview.on("did-navigate", () => buildMenu());
  pluto.window.webview.on("did-navigate-in-page", () => buildMenu());
  pluto.window.activate();

  buildMenu();
  return pluto;
}

async function main() {
  console.log("Pluto Desktop: main starting");
  registerWindowsFileAssociations();
  collectLaunchFiles(process.argv).forEach((file) => pendingFiles.push(file));

  const firstWindow = createPlutoWindow();
  console.log("Pluto Desktop: initializing Julia/Pluto");
  await initGlobals();
  await startup((status) => {
    for (const window of windows) {
      window.showStatus(status);
    }
  });
  startupComplete = true;

  await firstWindow.open("new");
  await openPendingFiles();
  scheduleAutoUpdateCheck();
}

Electrobun.events.on("open-url", async (event: unknown) => {
  const url = getOpenUrl(event);
  if (!url) return;
  const file = fileUrlToPath(url);
  if (!file) return;
  pendingFiles.push(file);
  if (startupComplete) await openPendingFiles();
});

Electrobun.events.on("before-quit", () => {
  Pluto.close();
});

ApplicationMenu.on("application-menu-clicked", async (event: unknown) => {
  const action = (event as { data?: { action?: string } })?.data?.action;
  const focused = Pluto.focused() ?? [...windows][0];

  switch (action) {
    case "new-window":
      createPlutoWindow();
      break;
    case "new-notebook":
      await (focused ?? createPlutoWindow()).open("new");
      break;
    case "open-notebook":
      await (focused ?? createPlutoWindow()).open("path");
      break;
    case "close-window":
      focused?.close();
      break;
    case "reload":
      focused?.reload();
      break;
    case "toggle-devtools":
      focused?.window.webview.toggleDevTools();
      break;
    case "fullscreen":
      focused?.window.setFullScreen(!focused.window.isFullScreen());
      break;
    case "reveal":
      await focused?.revealCurrentNotebook();
      break;
    case "move":
      await focused?.moveCurrentNotebook();
      break;
    case "export-notebook":
      await focused?.exportCurrentNotebook(PlutoExport.FILE);
      break;
    case "export-html":
      await focused?.exportCurrentNotebook(PlutoExport.HTML);
      break;
    case "export-state":
      await focused?.exportCurrentNotebook(PlutoExport.STATE);
      break;
    case "export-pdf":
      await focused?.exportCurrentNotebook(PlutoExport.PDF);
      break;
    case "check-updates":
      await checkForUpdates(true);
      break;
  }
});

function buildMenu() {
  const focused = Pluto.focused() ?? [...windows][0];
  const hasNotebook = Boolean(focused?.currentNotebookId());

  ApplicationMenu.setApplicationMenu([
    {
      label: "&File",
      submenu: [
        { label: "New Window", action: "new-window", accelerator: "n" },
        { label: "New Notebook", action: "new-notebook" },
        { label: "Open Notebook", action: "open-notebook", accelerator: "o" },
        { type: "divider" },
        {
          label: "Reveal in File Explorer",
          action: "reveal",
          enabled: hasNotebook,
        },
        { label: "Move Notebook", action: "move", enabled: hasNotebook },
        { type: "divider" },
        { label: "Close", action: "close-window", accelerator: "w" },
      ],
    },
    {
      label: "&View",
      submenu: [
        { label: "Reload", action: "reload", accelerator: "r" },
        { label: "Toggle Full Screen", action: "fullscreen" },
        { label: "Toggle Developer Tools", action: "toggle-devtools" },
      ],
    },
    {
      label: "&Export",
      hidden: !hasNotebook,
      submenu: [
        { label: "Pluto Notebook", action: "export-notebook" },
        { label: "HTML File", action: "export-html" },
        { label: "Pluto Statefile", action: "export-state" },
        { label: "PDF File", action: "export-pdf" },
      ],
    },
    {
      label: "&Help",
      submenu: [
        { label: "Check for Updates", action: "check-updates" },
      ],
    },
  ]);
}

async function openPendingFiles() {
  while (pendingFiles.length > 0) {
    const file = pendingFiles.shift();
    if (!file) continue;
    const pluto = createPlutoWindow();
    await pluto.open("path", file);
  }
}

function collectLaunchFiles(args: string[]) {
  return args
    .map((arg) => fileUrlToPath(arg) ?? arg)
    .filter((arg) => path.isAbsolute(arg) && isExtMatch(arg));
}

function fileUrlToPath(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "file:") return null;
    return decodeURIComponent(url.pathname.replace(/^\//, ""));
  } catch {
    return null;
  }
}

function getOpenUrl(event: unknown) {
  return (event as { data?: { url?: string } })?.data?.url;
}

function getEventDetail(event: unknown) {
  const detail = (event as { data?: { detail?: unknown } })?.data?.detail;
  if (typeof detail === "string") {
    try {
      return JSON.parse(detail) as { url?: string };
    } catch {
      return { url: detail };
    }
  }
  return detail as { url?: string } | undefined;
}

function scheduleAutoUpdateCheck() {
  setTimeout(() => {
    void checkForUpdates(false);
  }, 15_000);
}

async function checkForUpdates(interactive: boolean) {
  try {
    const update = await Updater.checkForUpdate();
    if (!update.updateAvailable) {
      if (interactive) {
        await Utils.showMessageBox({
          type: "info",
          title: "Pluto.jl Desktop",
          message: "Pluto.jl Desktop is up to date.",
          buttons: ["OK"],
        });
      }
      return;
    }

    const { response } = await Utils.showMessageBox({
      type: "question",
      title: "Update available",
      message: `Version ${update.version || "latest"} is available.`,
      detail: "Download and install it now?",
      buttons: ["Install", "Later"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response !== 0) return;

    await Updater.downloadUpdate();
    await Updater.applyUpdate();
  } catch (error) {
    generalLogger.warn("Update check failed", error);
    if (interactive) {
      await Utils.showMessageBox({
        type: "error",
        title: "Update failed",
        message: "Could not check for updates.",
        detail: String(error),
        buttons: ["OK"],
      });
    }
  }
}

void main().catch(async (error) => {
  generalLogger.error("Pluto Desktop failed to start", error);
  await Utils.showMessageBox({
    type: "error",
    title: "Pluto.jl Desktop",
    message: "Pluto Desktop could not start.",
    detail: String(error),
    buttons: ["Quit"],
  });
  Utils.quit();
});
