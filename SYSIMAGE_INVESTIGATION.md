# Sysimage approach — investigation log

Branch: `sysimage-approach` (based off `julia-1.12-depot-stacking`).

## Goal (restated)

1. The app must always work **without internet**.
2. If the app ships its own Julia depot, that depot must **not keep growing on
   every update**; ideally **no writes except logs**.
3. **Userland (notebook) code must use the normal global Julia depot** and the
   **default Julia sysimage**. Anything the app ships is only for launching the
   Pluto *server*.

## New approach being investigated

Instead of shipping a big **depot** (package sources + ~68 MB of precompile
caches that invalidate on relocation), ship Pluto compiled into a **sysimage**
and launch the Pluto server with `--sysimage`. Pluto is designed to run from a
sysimage. Notebook worker processes must keep using the *default* sysimage.

Reference: an old commit that had (commented-out) PackageCompiler sysimage
generation — https://github.com/JuliaPluto/PlutoDesktop/tree/0527a557a7fba7fca2e5ed0ce04e9760788ee634

## Key questions

- **Q1.** Can we build a Pluto sysimage with the bundled Julia (1.12.6)?
- **Q2.** Can we launch the Pluto server from that sysimage **without** the
  Pluto packages living in a depot (i.e. no `compiled/` caches, minimal/no
  `packages/`)? What is the *minimum* on-disk footprint required?
- **Q3.** Do notebook worker processes (userland) use the **default** sysimage,
  not the Pluto one? And do they use the user's normal depot?

---

## Findings so far (static code reading)

### The frontend forces Pluto *source* to exist on disk (independent of sysimage)

`src/pluto.ts` `resolveHtmlPath` (line ~562) loads the editor UI as a **local
file**:

```
file:///${PLUTO_LOCATION}/frontend/editor.html?...&pluto_server_url=http://localhost:PORT...
```

`PLUTO_LOCATION` comes from `findPluto()` → `assets/locate_pluto.jl` →
`Base.locate_package(Base.identify_package("Pluto"))`, which resolves the Pluto
package's source path **from the active project's manifest**. So regardless of
the sysimage, we must ship Pluto's `frontend/` (realistically the whole Pluto
package source) on disk, and the env manifest must point at it.

Implication: the sysimage removes the need for the **`compiled/` caches** (68 MB,
the part that invalidates), and possibly avoids needing package *sources* for
Pluto's dependencies — but **Pluto's own source dir must ship** for the frontend.

### Q3 (userland → default sysimage) looks already-solved by Malt

`Pluto.jl/src/evaluation/WorkspaceManager.jl` launches workers via
`Malt.Worker(; exeflags=_convert_to_flags(compiler_options))`.

- `Configuration.jl`: `SYSIMAGE_DEFAULT = nothing`, and `_convert_to_flags` only
  emits `--sysimage=...` when the field is non-`nothing`. So **no** `--sysimage`
  flag is passed to workers by default.
- `Malt.jl` (`Malt/OteGQ/src/Malt.jl`): `Worker(; exename=Base.julia_cmd()[1], ...)`
  and `_get_worker_cmd` builds `` `$exename --startup-file=no $exeflags worker.jl` ``.
  It uses **only the executable path** (`julia_cmd()[1]`), *not* the parent's
  full `julia_cmd()` which would carry `-J<current sysimage>`.

⇒ Workers launch with the **default** sysimage as long as PlutoDesktop does
**not** set `compiler_options.sysimage`. To be verified empirically (Q3 test).

Caveat: workers inherit the parent process **environment**, so whatever
`JULIA_DEPOT_PATH` the server runs with is inherited by workers. For goal (3)
that stack's first entry must be the user's normal depot.

### Size tradeoff (measured)

- Current bundled depot: **119 MB** total = `compiled/` **68 MB** + `packages/` **36 MB** + rest.
- Default `sys.dll` (bundled Julia 1.12.6): **303 MB**.
- An **incremental** Pluto sysimage builds on top of the base ⇒ expect ~**350–450 MB**.

So on raw disk the sysimage is *larger* than the depot, and each Squirrel update
ships a new copy. The win is **robustness**: no precompile caches to invalidate,
**zero writes / zero recompilation** for the server, guaranteed offline. (To be
measured once built.)

---

### What the Pluto *server* reads from `pkgdir(Pluto)` at runtime

`Pluto.jl/src/Pluto.jl`: `project_relative_path(root, xs...)` →
`normpath(joinpath(pkgdir(Pluto), root, xs...))` (frontend uses a
RelocatableFolders `@path`, everything else uses `pkgdir`).

Server-side consumers that must resolve on disk:
- **`src/runner/Loader.jl`** and **`src/runner/PlutoRunner/Project.toml`**
  (`WorkspaceManager.process_preamble`, lines 37-39) — read every time a
  notebook worker is spawned. If `pkgdir(Pluto)` is wrong, **no notebook can
  start.** ← the critical one.
- `sample/*.jl` (sample notebooks), `frontend-dist/*` (HTML export inlining).

⇒ **`pkgdir(Pluto)` must resolve to the shipped on-disk Pluto source** even
though the module itself comes from the sysimage. This is the central Q2 test.

### Consolidated requirements for the sysimage design

Must ship on disk (read-only):
1. `pluto_sysimage.dll` — Pluto + all deps compiled in (no `compiled/` caches).
2. **Pluto's own package source** (`frontend/`, `src/runner/`, `sample/`, …) at
   a fixed path, with an env whose **manifest points Pluto at that path**, so
   `Base.locate_package` (→ `PLUTO_LOCATION`, frontend file://) and
   `pkgdir(Pluto)` (→ worker bootstrap) both resolve.

Possibly NOT needed (the hoped-for win — to be tested in E2):
- Pluto's **dependencies' sources** on disk (they're in the sysimage).
- Any `compiled/` precompile caches (all compiled code is in the sysimage).
- A writable depot for the server at all.

Userland (worker) side, unchanged from a normal Julia:
- Workers load `PlutoRunner` from the on-disk Pluto source into the **user
  depot** using the **default sysimage** — exactly the "userland uses the global
  depot" behavior we want.

## Experiment log

(times are approximate; running with bundled Julia 1.12.6)

### E1 — Build a Pluto sysimage

Build env (isolated): `Pluto = "=1.0.1"` + `PackageCompiler v2.4.0`, built with
bundled Julia **1.12.6**, isolated depot stacked over the Julia share depots.
`create_sysimage(["Pluto"]; incremental=true, project=env)`.

- Instantiate + precompile of the build env: **~1 min** (Pluto 1.0.1 + 42 deps).
  Pluto's `PrecompileTools.@compile_workload` runs during this.
- **First attempt FAILED at the link step**, not at Julia level: PackageCompiler
  on Windows downloads a **mingw-w64** GCC artifact to link the sysimage, and
  extracting it blew past Windows **MAX_PATH (260)** because the build depot was
  under the very long agent scratchpad dir:
  `…\scratchpad\sysimage_build\depot\artifacts\jl_XXXX\extracted_files\mingw64\lib\gcc\x86_64-w64-mingw32\14.2.0\finclude\ieee_arithmetic.mod`.
  → `SystemError: opening file … No such file or directory` on both artifact
  mirrors (the identical error on both = extraction, not network).
- **Fix:** relocate the build depot to a short root (`C:\Users\20245075\jsib`).
  **Lesson for CI/build:** the sysimage build needs a C toolchain (mingw-w64 on
  Windows) — an extra build-time dependency and an offline-build consideration —
  and the build depot/artifact path must stay short on Windows.

Rebuild with the short path: **SUCCESS**.

- Output: `pluto_sysimage.dll` = **411 MB** (default `sys.dll` is 303 MB, so Pluto
  adds ~108 MB of compiled code + embedded folders — see RelocatableFolders below).
- Total build wall-clock (instantiate + precompile + link): a few minutes.

**⇒ Q1 answered: YES.** We can build a Pluto sysimage with the bundled Julia
1.12.6. Only real gotcha is the mingw-w64 toolchain + Windows path length.

### E2 — Launch Pluto from the sysimage with (almost) no depot

Setup: env dev's Pluto at a **shipped source path** (`…/jsib/shipped/Pluto`,
distinct from the build depot's copy). Depot stack = *empty* user depot +
"shipped depot" + Julia's own share depots. **No `packages/`, no `compiled/`.**

First attempt hit a **new requirement**: JLL packages baked into the sysimage
resolve their **binary artifacts at runtime** in `__init__`
(`@artifact_str` → `<depot>/artifacts/<hash>`). `MbedTLS_jll` fatally aborted
startup because its artifact wasn't on disk. Notes:
- The build env resolved `MbedTLS_jll` to a **newer registry version** than the
  one Julia 1.12.6 bundles, so its artifact isn't in the Julia install. Other
  JLLs (OpenSSL, Zlib, …) are still stdlib JLLs and resolved from Julia's share
  depot.
- Fix: ship an **`artifacts/` dir** with the needed JLL binaries. Only ~6 MB
  here (the current depot design already ships ~16 MB of these).

With a tiny artifacts-only shipped depot added, **the probe succeeded**:
`import Pluto` from the sysimage in **0.002 s**, `locate_package(Pluto)` returns
the shipped source (feeds `PLUTO_LOCATION`).

But this "passed" partly because the build path still existed on this machine.
The **true relocation test** (renamed the build Pluto dir away, so no build path
exists) is the important one — and it **also passed**:

```
BUILD_SRC exists on disk? false        (true relocation)
import Pluto OK in 0.002 s (from sysimage)
locate_package -> shipped src ✓  (PLUTO_LOCATION works)
src/runner Loader   isfile=true  scratch=true   …/testdepot/scratchspaces/…/Loader.jl
PlutoRunner.toml    isfile=true  scratch=true   …/scratchspaces/…/PlutoRunner/Project.toml
frontend/editor     isfile=true  scratch=true   …/scratchspaces/…/editor.html
frontend-dist       isfile=true  scratch=true   …/scratchspaces/…/editor.html
sample notebook     isfile=true  scratch=true   …/scratchspaces/…/Basic.jl
```

**Why it works — RelocatableFolders embeds the folders in the sysimage.**
Pluto's `project_relative_path` special-cases the critical dirs to
`RelocatableFolders.@path` consts (`RUNNER_DIR`, `FRONTEND_DIR`,
`FRONTEND_DIST_DIR`, `SAMPLE_DIR`); only *other* roots use `pkgdir(Pluto)`.
`@path` reads **every file into a `Dict{String,Vector{UInt8}}` inside the struct**
at build time, so those folders are **baked into the 411 MB sysimage as blobs**.
At runtime, if the original (build) path is gone, `getpath` **writes the blobs
into a scratchspace** in the first depot and serves from there.

- The only production `project_relative_path` call that uses the `pkgdir`
  fallback is the non-production `test` root. So the fact that `pkgdir(Pluto)`
  stays "baked" to the build path (Julia skips `set_pkgorigin_version_path` for
  sysimage-resident modules — verified in `loading.jl`) **does not matter** in
  practice.

**⇒ Q2 answered: YES.** The Pluto server launches from the sysimage with **no
package sources and no precompile caches in any depot** — only a tiny
`artifacts/` dir. Pluto's own frontend/runner/sample ship *inside* the sysimage.

### E3 — Notebook workers use the DEFAULT sysimage

Started a real Pluto worker the way the server does
(`WorkspaceManager.get_workspace`) from the sysimage server:

```
SERVER SYSIMAGE : …/jsib/pluto_sysimage.dll
WORKER SYSIMAGE : …/julia-1.12.6/lib/julia/sys.dll     ← DEFAULT, not Pluto's
WORKER PROJECT  : …/userdepot/environments/v1.12/Project.toml   ← user global env
WORKER DEPOTS   : userdepot (writable) first
WORKER julia_cmd: julia.exe -C native -J…/lib/julia/sys.dll -g1 --startup-file=no
```

PlutoRunner precompiled into the **user depot** in ~6 s from **stdlib-only**
deps (per its Project.toml). No `--sysimage` flag is passed to the worker.

**⇒ Q3 answered: YES, automatically.** Userland runs on the default sysimage and
the user's normal global depot. Nothing special is required as long as
PlutoDesktop does **not** set `compiler_options.sysimage`.

### E4 — End-to-end server launch (real `run_pluto.jl`)

Launched the actual `assets/run_pluto.jl` under the sysimage. One test-env fix
was needed: `run_pluto.jl` does `copy!(LOAD_PATH, ["@"])`, so the active project
must directly declare every stdlib it imports (`Logging`, `Pkg`) plus `Pluto` —
exactly what the production `env_for_julia/Project.toml` already does.

Result: **server ready (HTTP 200 on `/` and `/edit`) in ~3.7 s** (vs the ~15 s
the current depot design reportedly takes). `/edit` is served from the
scratchspace-materialized frontend.

---

## Answers

| Question | Answer |
|---|---|
| Q1 build a Pluto sysimage with bundled Julia 1.12.6 | **Yes** (411 MB, needs mingw-w64 + short build path on Windows) |
| Q2 launch server from sysimage without Pluto packages in a depot | **Yes** — only a ~6–16 MB `artifacts/` dir; frontend/runner/sample are embedded in the sysimage |
| Q3 userland/workers use the default sysimage & global depot | **Yes, automatically** (Malt uses `julia_cmd()[1]`; `SYSIMAGE_DEFAULT = nothing`) |

Bonus: server startup ~3.7 s (down from ~15 s), and **zero recompilation / zero
writes to any app-managed directory** for the server.

## Recommended architecture

Ship (all read-only):
1. Julia 1.12.6 install (already shipped) — provides the **default** sysimage for
   workers and its stdlib/JLL artifacts.
2. `pluto_sysimage.dll` (~411 MB) in `generated_assets/` — the Pluto server image.
3. A tiny **`artifacts/`-only depot** (~6–16 MB) for JLLs whose versions drift
   from Julia's bundled ones (MbedTLS_jll, …). *Or* pin those JLLs to Julia's
   bundled versions and ship nothing.
4. **Pluto source** (~15–25 MB: `frontend/`, `frontend-dist/`, `src/`, `sample/`,
   `Project.toml`) — needed so `locate_package` → `PLUTO_LOCATION` resolves for
   PlutoDesktop's `file://` frontend. (Alternatively: hardcode this path, since
   we control where we ship it, and drop `locate_pluto.jl`.)
5. `env_for_julia` with `Project.toml` (`Logging`, `Pkg`, `Pluto`) + a `Manifest`
   pointing Pluto at the shipped source via a **relative** path (relocatable).

Server launch: `julia --sysimage=<pluto_sysimage> --project=<env_for_julia> run_pluto.jl …`
with `JULIA_DEPOT_PATH = <user ~/.julia> ; <artifacts depot> ; <julia share depots>`.

Drop from the current design: the **~68 MB `compiled/` caches** (in the sysimage
now) and the **~36 MB `packages/` sources** for Pluto's deps (in the sysimage).

### Net effect vs current depot-stacking design

- **Robustness (the point):** server needs **no precompilation ever** and makes
  **no writes** to any app dir → no cache invalidation, guaranteed offline start.
- **Disk:** bigger — a 411 MB image replaces a 119 MB depot, and Squirrel keeps
  per-version copies. Trades disk for immutability/robustness.
- **Speed:** ~3.7 s server start vs ~15 s.

## Implementation decisions (confirmed by follow-up tests)

- **Keep `env_for_julia` and `set-pluto-version` unchanged.** A follow-up test
  launched the server from the sysimage using the *existing checked-in*
  `assets/env_for_julia` (registry Manifest with `git-tree-sha1`, no packages on
  disk) + an artifacts-only depot → **HTTP 200 in 4.6 s**. `import Pluto` uses
  the sysimage-resident module (matched by UUID); the Manifest is only consulted
  to resolve the UUID + the stdlib set, so its recorded tree-hash/path never has
  to exist on disk. This means the Manifest strategy needs **no changes** and
  `PLUTO_LOCATION` can simply be hardcoded to the shipped `pluto_source/Pluto`.
- **`cpu_target` MUST be passed explicitly.** ⚠️ Earlier I wrongly claimed this
  was a non-issue: `create_sysimage` defaults `cpu_target = NATIVE_CPU_TARGET`
  (`"native"`) — it is `create_app`/`create_library` that default to the
  portable `default_app_cpu_target()`. Building without it produced a
  **native-only sysimage** (the CI runner's CPU), which crashed on end-user
  machines with `ERROR: Unable to find compatible target in cached code image.
  Target 0 (znver3): Rejecting this target due to use of runtime-disabled
  features` (reported by a user on a Zen 3 machine after installing
  v1.0.1-build005). Fix: pass
  `cpu_target=PackageCompiler.default_app_cpu_target()` (portable multi-arch:
  x86_64 `generic;sandybridge,…;haswell,…`, whose `generic` baseline runs on any
  x86_64). A single-machine local test can NOT catch this — it only shows up on
  a different CPU. Fixed in build006.

### Implemented layout (branch `sysimage-approach`)

`generated_assets/` ships: `julia-<ver>/` (unchanged, default sysimage for
workers) + `pluto_sysimage.<dll|so|dylib>` + `pluto_source/Pluto/` (frontend/
src/sample for `PLUTO_LOCATION`) + `pluto_server_depot/artifacts/` (JLL
binaries). No `packages/`, no `compiled/`. Build-time temp depots
(`build_depot`, `build_tools_depot`, `build_tools_env`) are created and deleted
by `generateAssets.js`; PackageCompiler + its mingw toolchain live in the
tools depot so they never reach the shipped artifacts.

## Implementation (branch `sysimage-approach`)

Files changed:

- **`scripts/generateAssets.js`** — replaced the old `prepareJuliaDepot` /
  disabled `precompilePluto` with `buildPlutoSysimage`: instantiate
  `env_for_julia` into a temp `build_depot`; install PackageCompiler into a
  separate temp `build_tools_depot` (so its mingw toolchain never reaches the
  shipped artifacts); `create_sysimage(["Pluto"])` → `pluto_sysimage.*`; extract
  Pluto source → `pluto_source/Pluto/` (minus `test/`, `frontend-bundler/`) and
  JLL artifacts → `pluto_server_depot/artifacts/`; delete temp depots. Added a
  `runJulia` helper and `fixupMacPermissions`. Stale-version cleanup now removes
  the sysimage outputs (and any legacy `julia_depot`).
- **`src/paths.ts`** — replaced `BUNDLED_DEPOT_LOCATION` with
  `PLUTO_SYSIMAGE_LOCATION` (per-platform basename), `PLUTO_SERVER_DEPOT_LOCATION`,
  and `PLUTO_SOURCE_LOCATION`.
- **`src/plutoProcess.ts`** — `getServerDepotPath` now stacks the artifacts-only
  `pluto_server_depot` instead of the full depot; `findPluto` returns the shipped
  `pluto_source/Pluto` directly (no Julia subprocess), keeping `locate_pluto.jl`
  only as a dev/no-sysimage fallback.
- **`src/startup.ts`** — the `--sysimage` flag now points at
  `PLUTO_SYSIMAGE_LOCATION` (was a hardcoded `assets/pluto.so`); warns if absent.
- **`assets/run_pluto.jl`** — comments updated for the sysimage design; the
  `Pkg.instantiate()` branch is now just a dev/no-sysimage repair path.
- **`scripts/setPlutoVersion.mjs`** — deletes the sysimage build outputs (not
  `julia_depot`) so the next build rebuilds from the new Pluto.
- **`MAINTENANCE.md`** — rewrote the runtime/depot section for the sysimage.

`env_for_julia` (Project.toml + Manifest) and `set-pluto-version`'s version
plumbing are **unchanged** (see the decision above).

### Validation of the implemented build (real artifacts)

Ran the actual `generateAssets` hook (via a driver) on this machine:

- Outputs in `generated_assets/`: `pluto_sysimage.dll` **410 MB**,
  `pluto_source/Pluto/` **25 MB** (frontend/editor.html present), and
  `pluto_server_depot/artifacts/` **16 MB**. Temp `build_depot` /
  `build_tools_depot` / `build_tools_env` were created and **cleaned up**.
- mingw-w64 downloaded and extracted fine at the real repo path (no MAX_PATH).
- Launching the shipped sysimage + `env_for_julia` via `run_pluto.jl` with a
  **fresh empty user depot** + the production depot stack → **HTTP 200 on `/`
  and `/edit` in ~5 s**.
- Worker test against the shipped artifacts: **server on `pluto_sysimage.dll`,
  worker on the default `sys.dll`**, worker's global env in the user depot.
- **Full Electron app** (`npm run start:inspect`): logs show
  `Pluto found at: …\generated_assets\pluto_source\Pluto`,
  `System image found at …\pluto_sysimage.dll. Julia will use this instead of
  the default`, and `Entry url found` — server up, frontend loading, no errors.
  (In dev, `resolveHtmlPath` still serves the frontend from the local `Pluto.jl`
  checkout; packaged builds use the shipped `pluto_source`.)

## Open considerations / follow-ups

1. **cpu_target** — FIXED in build006: `create_sysimage` defaults to `"native"`,
   so we now pass `cpu_target=PackageCompiler.default_app_cpu_target()`. (build005
   shipped native-only and crashed on other CPUs.)
2. **Worker first-run registry**: the worker's PlutoRunner boot environment
   caused Pkg to install the General registry. On a *truly offline, fresh* user
   machine this could fail. This is **shared with the current design** (which
   strips registries) and independent of the sysimage decision — but goal (1)
   demands a dedicated offline test and, if needed, shipping a registry or a
   pre-built boot environment for workers.
3. **First-launch scratchspace write**: ~15 MB of Pluto frontend/runner is
   written once into the user depot's `scratchspaces/` on first server start
   (RelocatableFolders materialization). One-time, in the user depot (not an app
   dir) — acceptable, but note it isn't literally "zero writes".
4. **Build-time C toolchain**: sysimage builds need mingw-w64 (Windows). On a
   normal repo checkout the build depot path is short enough to dodge MAX_PATH
   (verified: `generated_assets/build_tools_depot/…` builds fine); the pathology
   only appeared under the very long agent scratchpad. CI (GitHub windows-latest)
   has mingw fetched as an artifact and a short workspace path, so no extra setup.
5. **`src/startup.ts` sysimage detection** — done (points at
   `PLUTO_SYSIMAGE_LOCATION`).
6. **`generateAssets.js` build step** — done (`buildPlutoSysimage`).
7. **Installer size**: the ~411 MB sysimage makes `PlutoSetup.exe` and each
   `-full.nupkg` much larger; each Squirrel update ships a full copy. Worth
   confirming this is acceptable before release (it's the main cost of the
   approach). No delta updates with Squirrel.Windows.

## Reproduction

All fixtures live under `C:\Users\20245075\jsib` (short path to dodge MAX_PATH):
`env/` + `build.jl` (build), `probe.jl` + `run_e2.sh` (E2), `e3.jl` + `run_e3.sh`
(E3), `shipped/Pluto` (shipped source), `shipped_depot/artifacts` (JLL artifacts),
`testenv/` (env with relative-ish dev of Pluto).
