import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  Menu,
  MenuItem,
  MenuItemConstructorOptions,
  shell,
} from "electron";
import { release } from "os";
import { join } from "path";
import { runPluto } from "./runPluto";
import "./samples/electron-store";
import { saveSetting } from "./samples/electron-store";
import "./samples/npm-esm-packages";
import prompt from "electron-prompt";
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import { Argv } from "yargs";
const {
  setupTitlebar,
  attachTitlebarToWindow,
} = require("custom-electron-titlebar/main");

// setupTitlebar();

// Disable GPU Acceleration for Windows 7
if (release().startsWith("6.1")) app.disableHardwareAcceleration();

// Set application name for Windows 10+ notifications
if (process.platform === "win32") app.setAppUserModelId(app.getName());

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

const arg = yargs(hideBin(process.argv))
  .option("project", {
    alias: "p",
    type: "string",
    description: "Open project in this location",
  })
  .option("url", {
    alias: "u",
    type: "string",
    description: "Open a pluto URL in Pluto Desktop",
  })
  .option("notebook", {
    alias: "n",
    type: "string",
    description: "Open a .pluto.jl notebook in Pluto Desktop",
  })
  .help()
  .parseSync();

const checkIfCalledViaCLI = (args: string[]) => {
  if (args && args.length > 1) {
    return true;
  }
  return false;
};

const isMac = process.platform === "darwin";

const getMenu = (win: BrowserWindow) => {
  const template: (MenuItem | MenuItemConstructorOptions)[] = [
    { role: "appMenu" },
    {
      label: "File",
      submenu: [
        {
          label: "Copy current URL",
          click: () => {
            const url = win.webContents.getURL();
            if (url.includes("secret")) clipboard.writeText(url);
            else
              dialog.showErrorBox(
                "Pluto not started yet",
                "Please wait for pluto to start and then try again!"
              );
          },
        },
        {
          label: "Load URL",
          click: async () => {
            const r = await prompt({
              title: "Get Pluto URL",
              label: "URL: ",
              value: "http://localhost:1234/?secret=abcdef",
              inputAttrs: {
                type: "url",
              },
              type: "input",
            });

            if (r) {
              if (r.includes("localhost") && r.includes("secret"))
                win.loadURL(r);
              else
                dialog.showErrorBox(
                  "Invalid url",
                  "Seems like you have entered an invalid url, please try again!"
                );
            }
          },
        },
        {
          label: "Open pluto notebook in this window",
          click: async () => {
            const r = await dialog.showOpenDialog(win, {
              message: "Please select a Pluto Notebook.",
              filters: [{ name: "Pluto Notebook", extensions: ["pluto.jl"] }],
              properties: ["openFile"],
            });

            if (r && r.filePaths.length > 0)
              runPluto(win, arg.project, r.filePaths[0]);
          },
        },
        {
          label: "Open pluto notebook in new window",
          click: async () => {
            const r = await dialog.showOpenDialog(win, {
              message: "Please select a Pluto Notebook.",
              filters: [{ name: "Pluto Notebook", extensions: ["pluto.jl"] }],
              properties: ["openFile"],
            });

            if (r && r.filePaths.length > 0)
              createWindow(undefined, undefined, r.filePaths[0]);
          },
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    // { role: 'editMenu' }
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
      ],
    },
    // { role: 'viewMenu' }
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    // { role: 'windowMenu' }
    {
      label: "Window",
      submenu: [
        {
          label: "Create new",
          click: () => {
            createWindow();
          },
        },
        {
          label: "Duplicate",
          click: () => {
            createWindow(win.webContents.getURL());
          },
        },
        { role: "minimize" },
        { role: "zoom" },
      ],
    },
    {
      role: "help",
      submenu: [
        {
          label: "Learn More",
          click: async () => {
            const { shell } = require("electron");
            await shell.openExternal("https://electronjs.org");
          },
        },
      ],
    },
    {
      label: "Settings",
      submenu: [
        {
          label: "Set Julia Path",
          click: async () => {
            const res = await dialog.showOpenDialog(win, {
              message: "Find and select Julia executable.",
              filters: [{ name: "julia.exe", extensions: ["exe"] }],
            });

            if (res.filePaths.length > 0) {
              saveSetting("julia-path", res.filePaths[0]);
            }
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  return menu;
};

let win: BrowserWindow | null = null;

const createWindow = async (
  url?: string,
  project?: string,
  notebook?: string
) => {
  if (checkIfCalledViaCLI(process.argv)) {
    url = arg.url;
    project = arg.project;
    notebook = arg.notebook;
  }

  win = new BrowserWindow({
    title: "⚡ Pluto ⚡",
    height: 600,
    width: 800,
    resizable: true,
    // frame: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
    },
  });

  win.setMenu(getMenu(win));

  if (url) win.loadURL(url);
  else {
    if (app.isPackaged) {
      win.loadFile(join(__dirname, "../renderer/index.html"));
    } else {
      // 🚧 Use ['ENV_NAME'] avoid vite:define plugin
      const url = `http://${process.env["VITE_DEV_SERVER_HOST"]}:${process.env["VITE_DEV_SERVER_PORT"]}`;

      win.loadURL(url);
      // win.webContents.openDevTools();
    }
    const val = runPluto(win, project, notebook);
    // val.then(() => attachTitlebarToWindow(win));
  }

  // Test active push message to Renderer-process
  win.webContents.on("did-finish-load", () => {
    win?.webContents.send("main-process-message", new Date().toLocaleString());
  });

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https:")) shell.openExternal(url);
    return { action: "deny" };
  });
};

app.whenReady().then(() => createWindow());

app.on("window-all-closed", () => {
  win = null;
  if (process.platform !== "darwin") app.quit();
});

app.on("second-instance", () => {
  if (win) {
    // Focus on the main window if the user tried to open another
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on("activate", () => {
  const allWindows = BrowserWindow.getAllWindows();
  if (allWindows.length) {
    allWindows[0].focus();
  } else {
    createWindow();
  }
});
