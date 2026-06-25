# PlutoDesktop → Electrobun: feasibility & migration report

*Date: 2026-06-24 · Target platform: Windows only · Author: investigation for JuliaPluto/PlutoDesktop*

## TL;DR

Rewriting PlutoDesktop on **[Electrobun](https://www.electrobun.dev/)** is **feasible and well-aligned with your goals**, but it is a *rewrite of the shell*, not a port. The Julia/Pluto half of the project (the part that actually matters and is hardest to maintain) is almost entirely reusable. The Electron-specific glue (~2,200 lines of TypeScript) would be rewritten against Electrobun's APIs, and would likely shrink.

The single biggest reason this is attractive for *your* situation: **you target Windows only, and on Windows Electrobun renders with Edge WebView2 — which is Chromium-based.** So the Pluto frontend keeps running on the same engine family it's already developed and tested against, while you stop shipping and updating your own copy of Chromium.

**Recommendation: prototype first.** Build a 1–2 day spike that (a) spawns the bundled Julia/Pluto server and (b) loads the Pluto editor in an Electrobun window. That spike resolves ~80% of the technical risk. The remaining risk is concentrated in a handful of Electron APIs this app uses that have no documented Electrobun equivalent (see [§5 Risks](#5-risks-and-open-questions)).

---

## 1. What Electrobun is

Electrobun is a young (v1.x, ~12k GitHub stars, actively developed in 2026) framework for building desktop apps in TypeScript. The key differences from Electron:

| | Electron | Electrobun |
|---|---|---|
| Main-process runtime | Node.js (bundled) | **Bun** (bundled) |
| Renderer | **Bundled Chromium** (~150 MB) | **OS-native WebView** — Edge WebView2 on Windows, WebKit on macOS, WebKitGTK on Linux |
| Typical installer size | ~80–150 MB | **~14–16 MB** |
| Updates | Full re-download (Squirrel) | **Differential (bsdiff) patches**, often KB-sized |
| Build tooling | electron-forge + webpack (in this repo) | Built-in bundler (`electrobun.config.ts`) |

API modules it ships today: `BrowserWindow`, `BrowserView`, `ApplicationMenu`, `Tray`, `ContextMenu`, `Utils`, `Updater`, `Events`, `Paths`, plus type-safe **RPC** for main↔webview communication.

### The important nuance for your goals

Your goal "**No Chrome dependency**" is *mostly* met, with one honest caveat:

- ✅ You **stop bundling and shipping Chromium**. Your installer drops from ~80–150 MB of app shell to ~15 MB. App size and your update/maintenance burden for the browser engine both go away.
- ⚠️ On Windows the renderer is **Edge WebView2, which is itself Chromium-based**. So you don't escape Chromium as a *rendering engine* — but it becomes an **OS-managed component** that Microsoft ships and security-patches through Windows Update, not something you bundle and chase CVEs on. That is exactly the security/size win you're after.
- ✅ **For a Windows-only target this is the best-case scenario.** The Pluto frontend is a large, modern JS app; it already runs in Chromium-family browsers, so WebView2 is the lowest-risk possible engine. (The usual Electrobun caveat — "rendering differs across native WebViews" — mainly bites cross-platform apps that also ship to macOS/WebKit. You don't.)

---

## 2. How the current app is built (what we have to replace)

The codebase is small and the architecture is clear. Roughly 2,240 lines of TypeScript across 17 files in `src/`, plus a 354-line `scripts/generateAssets.js`.

```
Electron main process
 ├─ startup.ts      spawn Julia child process → run_pluto.jl (the Pluto server)
 ├─ index.ts        create BrowserWindow(s); webRequest route interception; downloads
 ├─ pluto.ts        open/move/export/shutdown notebooks; talk to Pluto HTTP API
 ├─ preload.ts      contextBridge → window.plutoDesktop (IPC to renderer)
 ├─ baseEventListeners.ts   ipcMain handlers
 ├─ menu.ts         native app menu + context menu
 ├─ windowHelpers.ts  multi-window registry
 ├─ globals/paths/util/store/logger/...
generateAssets.js   download Julia, extract, instantiate a bundled depot, ship it
```

Key behaviors:

1. **Spawns Julia** (`child_process.spawn`) running `assets/run_pluto.jl`, with `JULIA_DEPOT_PATH` pointed at a bundled, pre-populated depot. Parses stdout to discover the server URL/secret.
2. **Loads the bundled Pluto frontend from `file://`** (`Pluto.jl/frontend/*.html`) with `?secret=…&pluto_server_url=http://localhost:PORT`.
3. **Intercepts web requests** (`session.webRequest.onBeforeRequest`) to catch Pluto's `new`/`open`/`edit`/`notebookupload` routes and turn them into native actions (spawn window, show file dialog, etc.).
4. **Native dialogs** for open/move/export (`dialog.showOpenDialog/showSaveDialog/showErrorBox`).
5. **Downloads/export** via `session.will-download` + `webContents.downloadURL`; PDF export via `webContents.print()`.
6. **Native menus + context menus**, multi-window, "open in new window".
7. **Auto-update** via Squirrel (`MakerSquirrel`).
8. **First-run depot copy** from the read-only install dir to a writable appData dir.

The runtime dependency list is already tiny: `detect-port`, `electron-log`, `electron-squirrel-startup`, `electron-store`. The bulk of `package.json` is *build* tooling (forge makers, webpack loaders, eslint).

---

## 3. How each piece maps onto Electrobun

| Current (Electron) | Electrobun equivalent | Confidence |
|---|---|---|
| `child_process.spawn(julia, …)` | **`Bun.spawn`** (with `JULIA_DEPOT_PATH` env, stdout parsing) | ✅ High — core Bun feature |
| `BrowserWindow`, multi-window | **`BrowserWindow`** from `electrobun/bun` | ✅ High |
| `preload.ts` + `ipcMain`/`contextBridge` | **Electrobun RPC** (type-safe, bidirectional, request/response + pub/sub) | ✅ High — cleaner than current IPC |
| `Menu` / app menu | **`ApplicationMenu`** (supported on Windows) | ✅ High |
| Context menu | **`ContextMenu`** API | ✅ High |
| `app.getPath('userData'/'appData')` | **`Paths`** API | ✅ High |
| `shell.openExternal`, `showItemInFolder` | **`Utils.openPath` / open-external** | 🟡 Medium |
| `electron-store` (config) | Drop it — write a JSON file via `Bun.file`/`Bun.write` | ✅ High |
| `electron-log` | Drop it — Bun console + a small file logger | ✅ High |
| `detect-port` | Drop it — bind port 0 / small Bun helper, or let Pluto pick | ✅ High |
| **Auto-update (Squirrel)** | **`Updater`** (bsdiff differential updates) — *different model, needs an update feed* | 🟡 Medium |
| **File association `.jl`/`.pluto.jl`** | **`app.fileAssociations` config → `open-url` event** (added v1.18, 2026) | 🟡 Medium |
| Windows installer (`MakerSquirrel`) | Built-in **self-extracting installer / .zip**; or 3rd-party `electrobun-builder` (NSIS/WiX/MSIX) | 🟡 Medium |
| **`session.webRequest.onBeforeRequest` route interception** | **No direct equivalent** — needs redesign (see §4) | 🔴 Risk |
| **`session.will-download` / `webContents.downloadURL`** | Download interception in WebView2 not clearly exposed | 🔴 Risk |
| **`webContents.print()` (PDF export)** | Printing not clearly exposed | 🔴 Risk |
| `nativeTheme` (dark mode bg) | Likely available / can be worked around | 🟡 Medium |

So the bulk of the app maps cleanly. The risk is concentrated in three Chromium/Electron-net-stack features: **request interception, download handling, and printing.**

---

## 4. The one architectural decision that de-risks most of this

The current app does something subtle: it loads the Pluto **frontend** from `file://` and then *intercepts navigation* to rewrite Pluto's server routes into native actions. That interception (`onBeforeRequest`) is the feature with no clean Electrobun equivalent.

**You probably don't need it in a rewrite.** Pluto already serves a complete, working web app at `http://localhost:PORT/?secret=…`. The simpler architecture:

> **Point the Electrobun webview directly at the localhost Pluto server**, instead of loading the frontend from `file://` and intercepting routes.

This removes the entire `createRequestListener()` mechanism and a chunk of `pluto.ts`. Pluto's own routing (`new`, `open`, `edit`) then "just works" inside the webview, exactly as it does in a browser.

What you'd re-implement natively on top of that:
- **Native open/move/export dialogs** — triggered via RPC from a small injected script or menu items, rather than by intercepting requests. (Pluto can also be configured to use its own in-browser file pickers.)
- **"Open in new window"** — handle the webview's new-window/navigation event → spawn a new `BrowserWindow`.
- **File associations** — `app.fileAssociations` + `open-url` event hands you the path; you POST it to Pluto's `open` HTTP endpoint and navigate the webview to the returned `edit?id=…` URL. This is *cleaner* than today's flow.

This is the single most important design call in the migration. It trades a fragile Electron-specific hack for standard HTTP + native events, and it is what makes "less code" realistic. **Validate it in the spike.**

---

## 5. Risks and open questions

Ordered by how much they could hurt. Each should be answered in a prototype before committing.

1. **🔴 Native file dialogs (open/save).** The app depends on `showOpenDialog`/`showSaveDialog` for opening, moving, and exporting notebooks. Electrobun's `Utils` covers filesystem helpers, but a documented native open/save *dialog* API was not confirmed. **Mitigation:** verify the API; if absent, Pluto's in-browser file pickers can cover open, and Bun FFI to the Win32 common dialogs is a fallback. *This is the top thing to verify.*
2. **🔴 Download & export handling.** Pluto export uses `webContents.downloadURL` + a save dialog, and `will-download`. WebView2 supports download events, but Electrobun's exposure of them is unconfirmed. **Mitigation:** fetch the export bytes over HTTP from Pluto's export endpoints in the Bun main process and write the file yourself — sidesteps webview download plumbing entirely.
3. **🔴 PDF export (`webContents.print`).** No confirmed printing API. **Mitigation:** Pluto's HTML export already exists; PDF can be deferred, done via the WebView2 print API if exposed, or generated from the HTML export.
4. **🟡 Auto-update model change.** Electrobun's `Updater` uses its own bsdiff feed format — better (KB-sized patches) but you must stand up an update feed and migrate signing. Existing installs on Squirrel won't auto-cross-grade to an Electrobun updater; plan a one-time re-install bump.
5. **🟡 Framework maturity.** Electrobun is v1.x and moving fast; multiple sources note **docs occasionally lag the code**. Expect to read source and pin a version. For a community project on hold ("under development, on hold" per the README), tying to a young framework is a real maintenance consideration — though arguably no worse than chasing Electron major upgrades (this repo is already on Electron 39 with a wall of `overrides` for CVEs).
6. **🟡 Windows installer & code signing.** Built-in self-extracting installer exists; for MSI/MSIX/NSIS and richer signing there's the third-party `electrobun-builder`. File-association *registration* in the installer needs verification end-to-end (the `open-url` event is confirmed; the installer-side registry registration is the part to test).
7. **🟡 Bundling a large Julia depot.** Today the depot ships as `extraResource` and is copied to a writable dir on first run. Electrobun bundles arbitrary resources too, but confirm large (hundreds of MB) bundled assets and the first-run copy work with its packaging and **differential updater** (you don't want a Julia-version bump to force a full multi-hundred-MB re-download — structure the bundle so the depot is a stable, separately-versioned layer if possible).

---

## 6. Effort & how the goals score

**Rough effort:** the Julia side (`run_pluto.jl`, `precompile.jl`, `env_for_julia`, depot generation logic) is reusable nearly as-is. The Electron shell is a rewrite, but it's ~2,200 lines and the hard parts (menus, IPC, multi-window) have direct Electrobun analogues. Realistic estimate: **a 1–2 day spike to kill the top risks, then ~1–3 weeks** for a feature-equivalent shell, dominated by re-implementing dialogs/downloads/export and the installer + auto-update pipeline.

| Your goal | Verdict | Notes |
|---|---|---|
| **Improve maintainability** | ✅ Likely | Drops webpack + forge + 4 runtime deps; standard HTTP+RPC instead of request interception. Counter-risk: dependence on a young framework. |
| **Less code** | ✅ Likely | Removing the `onBeforeRequest` route hack (§4) + `electron-store`/`electron-log`/`detect-port` glue is a real reduction. |
| **Fewer dependencies** | ✅ Strong | Build toolchain collapses into Electrobun's bundler; runtime deps go to ~0. |
| **No bundled Chrome / smaller / more secure** | ✅ Strong (with nuance) | Installer ~15 MB vs ~80–150 MB; engine becomes OS-managed WebView2 instead of a bundled Chromium you must patch. Engine is still Chromium-*based*. |
| **Bundle Julia + pre-populated depot** | ✅ Supported | Resource bundling + first-run copy carries over; verify interaction with differential updater (§5.7). |
| **Auto-update** | ✅ Supported | `Updater` with tiny diffs; requires new feed + signing setup and a migration bump (§5.4). |
| **Easy Windows install** | ✅ Supported | Self-extracting installer built in; `electrobun-builder` for MSI/MSIX/NSIS. |
| **File-type association** | ✅ Supported | `app.fileAssociations` + `open-url` (v1.18+); verify installer-side registration. |
| **Run Pluto server in Julia, view in window** | ✅ Core fit | `Bun.spawn` for Julia + `BrowserWindow` pointed at localhost is exactly Electrobun's sweet spot. |

---

## 7. Recommendation & next step

**Proceed to a spike, decide after.** Electrobun fits every hard requirement on paper and directly advances all four goals, and Windows-only + WebView2 removes the usual cross-platform rendering risk. The honest blockers are (1) three Electron net-stack features this app uses — dialogs, downloads, printing — and (2) framework youth.

Concrete next step — a throwaway prototype that answers the make-or-break questions:

1. `Bun.spawn` the bundled Julia running `run_pluto.jl`; parse the URL/secret from stdout. *(Validates the whole backend half.)*
2. Open a `BrowserWindow` pointed straight at `http://localhost:PORT/?secret=…` and confirm the Pluto editor renders and runs a cell in WebView2. *(Validates §4 — the architecture that deletes the most code.)*
3. Try a **native save dialog** and a **notebook export** (fetch export bytes over HTTP and write the file). *(Validates risks §5.1–5.2, the top two.)*
4. Register a `.pluto.jl` **file association** and confirm a double-clicked file arrives via `open-url`. *(Validates the file-association requirement end-to-end.)*

If those four pass, the rest is mechanical re-implementation against documented APIs.

---

### Sources

- [Electrobun homepage](https://www.electrobun.dev/) / [Blackboard docs](https://blackboard.sh/electrobun/docs/)
- [Electrobun v1 launch](https://blackboard.sh/blog/electrobun-v1/) · [InfoWorld first look](https://www.infoworld.com/article/4137964/first-look-electrobun-for-typescript-powered-desktop-apps.html)
- [Better Stack: Building desktop apps with Electrobun](https://betterstack.com/community/guides/scaling-nodejs/electrobun-desktop-apps-typescript/)
- [Electrobun v1.18.0 changelog (file associations, open-url)](https://docs.electrobunny.ai/electrobun/guides/changelog/v1-18-0/)
- [Electrobun GitHub](https://github.com/blackboardsh/electrobun) · [electrobun-builder (Windows packaging/signing)](https://github.com/Catharacta/electrobun-builder)
- [Electrobun IPC & Isolation](https://www.electrobun.dev/docs/guides/Architecture/IPC%20and%20Isolation) · [Bun.spawn IPC](https://bun.com/docs/guides/process/ipc)
