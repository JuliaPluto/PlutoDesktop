import { BrowserWindow, Utils } from "electrobun/bun";

import { PlutoExport } from "./enums";
import { Globals } from "./globals";
import { generalLogger } from "./logger";
import {
  PLUTO_FILE_EXTENSIONS,
  fetchPluto,
  isExtMatch,
  withSearchParams,
} from "./util";
import {
  chooseNotebookFile,
  chooseSavePath,
  showError,
} from "./windowsDialogs";

type OpenKind = "url" | "path" | "new";

const plutoWindows = new Set<Pluto>();
let focusedPluto: Pluto | null = null;

class Pluto {
  static closePlutoFunction: (() => void) | undefined;
  private currentUrlValue: string | null;

  constructor(public readonly window: BrowserWindow) {
    this.currentUrlValue = this.window.webview.url;
    plutoWindows.add(this);
    focusedPluto = this;

    this.window.on("close", () => {
      void this.shutdownCurrentNotebook();
      plutoWindows.delete(this);
      if (focusedPluto === this) focusedPluto = [...plutoWindows][0] ?? null;
      if (plutoWindows.size === 0) Pluto.close();
    });
    this.window.webview.on("did-navigate", (event: unknown) => {
      this.captureNavigation(event);
      focusedPluto = this;
      this.updateTitle();
    });
    this.window.webview.on("did-navigate-in-page", (event: unknown) => {
      this.captureNavigation(event);
      focusedPluto = this;
      this.updateTitle();
    });
  }

  static focused() {
    return focusedPluto;
  }

  static homeUrl() {
    return withSearchParams("/", { secret: Globals.PLUTO_SECRET }).toString();
  }

  static editorUrl(id: string) {
    return withSearchParams("/edit", {
      secret: Globals.PLUTO_SECRET,
      id,
    }).toString();
  }

  static isPlutoUrl(url: string) {
    return Boolean(Globals.PLUTO_URL && url.startsWith(Globals.PLUTO_URL.href));
  }

  static loadingHtml(status: string) {
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Pluto.jl Desktop</title>
    <style>
      html, body {
        width: 100%;
        height: 100%;
        margin: 0;
        background: #f7f7f2;
        color: #1f2430;
        font: 16px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        display: grid;
        place-items: center;
      }
      main {
        text-align: center;
      }
      h1 {
        font-size: 26px;
        font-weight: 650;
        margin: 0 0 8px;
      }
      p {
        margin: 0;
        color: #5c6470;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Pluto.jl Desktop</h1>
      <p>${escapeHtml(status)}</p>
    </main>
  </body>
</html>`;
  }

  showStatus(status: string) {
    if (!Globals.PLUTO_STARTED) {
      this.window.webview.loadHTML(Pluto.loadingHtml(status));
    }
  }

  async open(type: OpenKind = "new", pathOrURL?: string | null) {
    try {
      if (type === "path" && pathOrURL && !isExtMatch(pathOrURL)) {
        await showError("Cannot open notebook", "Not a supported file type.");
        return;
      }

      if (type === "path" && !pathOrURL) {
        pathOrURL = await chooseNotebookFile();
        if (!pathOrURL) return;
      }

      if (!Globals.PLUTO_STARTED) {
        await showError(
          "Pluto is still starting",
          "Please wait for Pluto to finish initializing.",
        );
        return;
      }

      const params: Record<string, string> = { secret: Globals.PLUTO_SECRET };

      if (pathOrURL) {
        if (type === "path") {
          params.path = pathOrURL;
        } else if (type === "url") {
          const url = new URL(pathOrURL);
          const path = url.searchParams.get("path");
          if (path) params.path = path;
          else params.url = pathOrURL;
        }
      }

      const response = await fetchPluto(
        withSearchParams(type === "new" ? "/new" : "/open", params),
        { method: "POST" },
      );
      const body = await response.text();

      if (!response.ok) {
        await showError(
          "Cannot open notebook",
          body || "Pluto rejected the request.",
        );
        return;
      }

      this.loadURL(Pluto.editorUrl(body));
      this.window.activate();
    } catch (error) {
      generalLogger.error("Notebook open failed", error);
      await showError(
        "Cannot open notebook",
        "Please check the path or URL and try again.",
      );
    }
  }

  async exportCurrentNotebook(type: (typeof PlutoExport)[keyof typeof PlutoExport]) {
    const id = this.currentNotebookId();
    if (!id) {
      await showError("Cannot export", "The current window is not a notebook.");
      return;
    }

    if (type === PlutoExport.PDF) {
      await showError(
        "PDF export is not available yet",
        "Electrobun does not expose WebView2 printing yet. Export HTML for now.",
      );
      return;
    }

    const endpoint =
      type === PlutoExport.FILE
        ? "/notebookfile"
        : type === PlutoExport.HTML
          ? "/notebookexport"
          : "/statefile";
    const extension =
      type === PlutoExport.HTML ? "html" : type === PlutoExport.STATE ? "plutostate" : "jl";
    const fileType =
      type === PlutoExport.HTML
        ? "HTML file"
        : type === PlutoExport.STATE
          ? "Pluto Statefile"
          : "Pluto Notebook";

    const destination = await chooseSavePath({
      title: "Select location to export file",
      defaultExtension: extension,
      filterName: fileType,
      filterExtensions: [extension],
    });
    if (!destination) return;

    const response = await fetchPluto(
      withSearchParams(endpoint, {
        secret: Globals.PLUTO_SECRET,
        id,
      }),
    );

    if (!response.ok) {
      await showError("Export failed", await response.text());
      return;
    }

    await Bun.write(destination, await response.arrayBuffer());
  }

  async moveCurrentNotebook() {
    const id = this.currentNotebookId();
    if (!id) {
      await showError("Cannot move notebook", "The current window is not a notebook.");
      return;
    }

    const newPath = await chooseSavePath({
      title: "Select location to move your file",
      defaultExtension: "jl",
      filterName: "Pluto Notebook",
      filterExtensions: PLUTO_FILE_EXTENSIONS.map((ext) => ext.replace(/^\./, "")),
    });
    if (!newPath) return;

    const response = await fetchPluto(
      withSearchParams("/move", {
        secret: Globals.PLUTO_SECRET,
        id,
        newpath: newPath,
      }),
      { method: "POST" },
    );

    if (!response.ok) {
      await showError("Cannot move notebook", await response.text());
    }
  }

  async revealCurrentNotebook() {
    const id = this.currentNotebookId();
    if (!id) {
      await showError("Cannot reveal notebook", "The current window is not a notebook.");
      return;
    }

    const file = await this.getFileLocation(id);
    if (file) Utils.showItemInFolder(file);
    else await showError("File not found", "The notebook file was not found locally.");
  }

  async shutdownCurrentNotebook() {
    const id = this.currentNotebookId();
    if (!id || !Globals.PLUTO_STARTED) return;

    try {
      await fetchPluto(
        withSearchParams("/shutdown", {
          secret: Globals.PLUTO_SECRET,
          id,
        }),
      );
    } catch (error) {
      generalLogger.warn("Notebook shutdown failed", error);
    }
  }

  currentNotebookId() {
    try {
      const url = this.currentUrlValue;
      if (!url) return null;
      return new URL(url).searchParams.get("id");
    } catch {
      return null;
    }
  }

  currentUrl() {
    return this.currentUrlValue;
  }

  reload() {
    this.loadURL(this.currentUrlValue ?? Pluto.homeUrl());
  }

  close() {
    this.window.close();
  }

  static close() {
    Pluto.closePlutoFunction?.();
  }

  private async getFileLocation(id: string) {
    const response = await fetchPluto(
      withSearchParams("/notebooklist", { secret: Globals.PLUTO_SECRET }),
    );
    if (!response.ok) return null;

    const data = await response.json().catch((): null => null);
    if (!data || typeof data !== "object") return null;

    for (const [notebookId, file] of Object.entries(data)) {
      if (notebookId === id && typeof file === "string" && isExtMatch(file)) {
        return file;
      }
    }
    return null;
  }

  private updateTitle() {
    const id = this.currentNotebookId();
    this.window.setTitle(id ? "Pluto Notebook" : "Pluto.jl Desktop");
  }

  private loadURL(url: string) {
    this.currentUrlValue = url;
    this.window.webview.loadURL(url);
  }

  private captureNavigation(event: unknown) {
    const detail = (event as { data?: { detail?: unknown } })?.data?.detail;
    if (typeof detail === "string") {
      this.currentUrlValue = detail;
    }
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

export default Pluto;
