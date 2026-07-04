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
3. Updates [assets/env_for_julia/Manifest.toml](assets/env_for_julia/Manifest.toml) by running `Pkg.update("Pluto")`, so the build-time `Pkg.instantiate()` installs exactly the pinned version. It prefers the Julia binary in `generated_assets/` (the one the app ships) and falls back to `julia` on the PATH.
4. Deletes `generated_assets/julia_depot` if present. The depot caches the previously installed Pluto, and asset generation skips preparation when it exists — a stale depot would silently ship the old Pluto.

Requirements and gotchas:

- Julia must be available (bundled in `generated_assets/` or on the PATH) to update the Manifest. If it isn't, the script prints the manual command and exits nonzero.
- The new Pluto version must already be in the General registry. If you run the script right after tagging a Pluto release, `Pkg` may not see it yet and will fail on the `=x.y.z` compat bound — wait for the registry PR to merge and re-run.
- Commit the resulting changes to `package.json`, `package-lock.json`, `Project.toml`, and `Manifest.toml` together. The Manifest's `project_hash` line must match Project.toml or the build's `Pkg.instantiate()` will fail.

## Updating the bundled Julia version

The Julia version is hardcoded in [scripts/generateAssets.js](scripts/generateAssets.js) (`JULIA_VERSION_PARTS`, near the top). After changing it, delete `generated_assets/` so the next build downloads the new Julia and rebuilds the depot from scratch.

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
