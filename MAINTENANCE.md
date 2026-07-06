# Maintenance guide

Notes for maintainers of Pluto Desktop: versioning, updating the bundled Pluto and Julia, and making a release.

## Versioning scheme

Pluto Desktop versions are derived from the bundled [Pluto.jl](https://github.com/fonsp/Pluto.jl) version:

```
<pluto-version>-buildNNN
```

where `NNN` counts the desktop releases based on that Pluto version, zero-padded to at least three digits. For example, `1.0.1-build002` is the second desktop release that bundles Pluto v1.0.1.

Why this exact format:

- A four-part version (`1.0.1.2`) is not valid semver, and npm / Electron Forge reject it.
- Squirrel.Windows uses NuGet-style comparison and treats the prerelease part as a plain string. Fixed-width numbers keep `build010` after `build009`, while unpadded `build10` would sort before `build9`.
- Semver treats `-buildNNN` as a prerelease, so `1.0.1-build001 < 1.0.1`. This is harmless as long as every release uses the suffix - never ship a bare `x.y.z`.

Don't edit the version by hand; use the script below, which keeps `package.json`, `package-lock.json`, and the Julia environment in sync.

## Updating the bundled Pluto version

```sh
npm run set-pluto-version -- <pluto-version> [build-number]

# examples
npm run set-pluto-version -- 1.0.2      # first desktop release on Pluto v1.0.2
npm run set-pluto-version -- 1.0.2      # run again: auto-increments to 1.0.2-build002
npm run set-pluto-version -- 1.0.2 5    # explicitly set the build number
```

The script ([scripts/setPlutoVersion.mjs](scripts/setPlutoVersion.mjs)) does four things:

1. Sets the package version to `<pluto-version>-buildNNN` via `npm version`, updating `package.json` and `package-lock.json`. Without an explicit build number, it starts at `1` and auto-increments when the current version is already based on the same Pluto version.
2. Pins the exact Pluto version in [assets/env_for_julia/Project.toml](assets/env_for_julia/Project.toml) with a `Pluto = "=x.y.z"` compat entry.
3. Updates [assets/env_for_julia/Manifest.toml](assets/env_for_julia/Manifest.toml) by running `Pkg.update("Pluto")`, so the build-time sysimage is compiled from exactly the pinned version. It prefers the Julia binary in `generated_assets/` (the one the app ships) and falls back to `julia` on the PATH.
4. Deletes the sysimage build outputs (`generated_assets/pluto_sysimage.*`, `pluto_source/`, `pluto_server_depot/`) if present. Asset generation skips the (slow) sysimage build when these exist — stale outputs would silently ship the old Pluto.

Requirements and gotchas:

- Julia must be available (bundled in `generated_assets/` or on the PATH) to update the Manifest. If it isn't, the script prints the manual command and exits nonzero.
- The new Pluto version must already be in the General registry. If you run the script right after tagging a Pluto release, `Pkg` may not see it yet and will fail on the `=x.y.z` compat bound — wait for the registry PR to merge and re-run.
- Commit the resulting changes to `package.json`, `package-lock.json`, `Project.toml`, and `Manifest.toml` together. The Manifest's `project_hash` line must match Project.toml or the build's `Pkg.instantiate()` will fail.

## Updating the bundled Julia version

The Julia version is hardcoded in [scripts/generateAssets.js](scripts/generateAssets.js) (`JULIA_VERSION_PARTS`, near the top). It **must be ≥ 1.11**: notebook workers use the Julia install's own precompile caches (`<julia>/share/julia`), and only Julia 1.11+ makes those relocatable (content hashes and `@depot`-relative paths instead of absolute paths and mtimes). On 1.10 they embed build-machine paths and are rejected after every Squirrel relocation, forcing a multi-minute stdlib recompile.

After changing the version:

1. Regenerate the Manifest with the new Julia, so its `julia_version` and standard-library set match what ships:

   ```sh
   julia --project=assets/env_for_julia -e "import Pkg; Pkg.resolve()"
   ```

   `generateAssets.js` refuses to build if `Manifest.toml`'s `julia_version` doesn't match the bundled Julia, so this step is mandatory. Commit the updated Manifest. (The sysimage must be built with the exact Julia it will run under.)

2. `generateAssets.js` detects a `generated_assets/julia-*` directory from a different version and removes it (along with the sysimage build outputs, which are Julia-version-specific) automatically on the next build. You only need to delete `generated_assets/` by hand if you want to force a clean rebuild.

### How the sysimage is used at runtime

The Pluto server is launched with `julia --sysimage=<generated_assets/pluto_sysimage.*>` (see [src/startup.ts](src/startup.ts)). The sysimage has Pluto and all its dependencies compiled in, so the server needs **no package sources, no precompile caches, and no writes to any depot** — it starts fast and offline. Pluto's own frontend/runner/sample folders are embedded in the sysimage (via RelocatableFolders) and re-materialize into a scratchspace in the user's depot on first launch.

The build (`buildPlutoSysimage` in [scripts/generateAssets.js](scripts/generateAssets.js)) produces three things in `generated_assets/`:

- `pluto_sysimage.<dll|so|dylib>` — the server image.
- `pluto_source/Pluto/` — Pluto's package source. Needed on disk so `PLUTO_LOCATION` (the `file://` frontend in [src/pluto.ts](src/pluto.ts)) and `Base.locate_package` resolve; the Pluto *module* itself comes from the sysimage.
- `pluto_server_depot/artifacts/` — only the JLL binary artifacts the server resolves at runtime whose versions differ from the ones bundled with Julia (e.g. `MbedTLS_jll`).

It also creates temporary `build_depot/`, `build_tools_depot/`, and `build_tools_env/` (PackageCompiler + its mingw toolchain live in the tools depot, isolated from the shipped artifacts) and deletes them when done.

At runtime the server's `JULIA_DEPOT_PATH` is a stack (see `getServerDepotPath` in [src/plutoProcess.ts](src/plutoProcess.ts)):

```
<user depot, usually ~/.julia> ; <pluto_server_depot> ; <julia>/local/share/julia ; <julia>/share/julia
```

- The user's depot comes first, so anything Pluto installs for notebooks — packages, registries, precompile caches — goes there, exactly as in a plain Julia session. Nothing accumulates in app-managed directories.
- `pluto_server_depot` supplies the non-bundled JLL artifacts.
- The Julia-installation depots supply the standard-library caches and Julia's own JLL artifacts; they must be listed explicitly because setting `JULIA_DEPOT_PATH` replaces Julia's default stack.

Notebook (worker) processes inherit this stack but launch with the **default** Julia sysimage — Malt starts them with just the Julia executable path, and Pluto passes no `--sysimage` flag. `PlutoRunner` (stdlib-only deps) precompiles into the user's depot on first notebook launch. So userland runs on plain Julia with the normal global depot, unaffected by the server's sysimage.

## Making a release

Releases are built and published by CI ([.github/workflows/release.yml](.github/workflows/release.yml)). Pushing a version tag triggers a Windows build that publishes a GitHub release — don't build installers by hand.

1. Update the version if needed: `npm run set-pluto-version -- <pluto-version>`, commit.
2. Tag the commit with the package version (`v` prefix) and push:

   ```sh
   git tag "v$(node -p "require('./package.json').version")"
   git push origin main --tags
   ```

3. CI verifies that the tag matches `package.json`, builds, and publishes a release with three assets:
   - `PlutoSetup.exe` — the installer users download. The name is version-independent so that <https://github.com/JuliaPluto/PlutoDesktop/releases/latest/download/PlutoSetup.exe> is a permanent "download the latest version" link (this is what plutojl.org links to).
   - `pluto_desktop-<version>-full.nupkg` and `RELEASES` — consumed by the auto-updater, not by humans.

To test the build locally, run `npm run make`; the same artifacts land in `out/make/squirrel.windows/x64/`.

The release must **not** be marked as draft or prerelease on GitHub (the workflow already gets this right): both flags make a release invisible to the auto-update service *and* to the `releases/latest` download link. This is independent of the semver prerelease suffix in the tag (`-buildNNN`), which is fine.

## Auto-updates

Installed apps check for updates every hour and on startup (see the `updateElectronApp` call in [src/index.ts](src/index.ts)), using Electron's free [update.electronjs.org](https://github.com/electron/update.electronjs.org) service, which requires this repo to stay public. The flow on Windows:

1. The app asks `update.electronjs.org/JuliaPluto/PlutoDesktop/win32-x64/<version>/RELEASES`, which forwards the `RELEASES` index of the newest GitHub release.
2. Squirrel.Windows downloads the new `-full.nupkg` from the GitHub release in the background and installs it.
3. The user gets a small "restart to update" dialog.

Squirrel caveat: NuGet package versions compare the prerelease part as a plain string. The `buildNNN` scheme keeps Squirrel's order aligned with the intended numeric build order through `build999`; `set-pluto-version` warns at build 1000 and above. Prefer bumping the bundled Pluto version before then.

The installer and app are currently **not code-signed**, so first-time installers see a Windows SmartScreen warning ("Windows protected your PC" → More info → Run anyway). Auto-updates are unaffected. To get rid of the warning we'd need a code-signing setup, e.g. Azure Trusted Signing (electron-winstaller's `windowsSign` option).
