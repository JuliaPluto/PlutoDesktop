# Maintenance guide

Notes for maintainers of Pluto Desktop: versioning, updating the bundled Pluto and Julia, and making a release.

## Versioning scheme

Pluto Desktop versions are derived from the bundled [Pluto.jl](https://github.com/fonsp/Pluto.jl) version:

```
<pluto-version>-build.<n>
```

where `n` counts the desktop releases based on that Pluto version. For example, `1.0.1-build.2` is the second desktop release that bundles Pluto v1.0.1.

Why this exact format:

- A four-part version (`1.0.1.2`) is not valid semver, and npm / Electron Forge reject it.
- The dot in `build.2` matters: semver compares dot-separated prerelease identifiers one by one, and purely numeric ones compare *numerically*. Without the dot, `build10` would sort *before* `build4` (lexical comparison).
- Semver treats `-build.n` as a prerelease, so `1.0.1-build.1 < 1.0.1`. This is harmless as long as every release uses the suffix — never ship a bare `x.y.z`.

Don't edit the version by hand; use the script below, which keeps `package.json`, `package-lock.json`, and the Julia environment in sync.

## Updating the bundled Pluto version

```sh
npm run set-pluto-version -- <pluto-version> [build-number]

# examples
npm run set-pluto-version -- 1.0.2      # first desktop release on Pluto v1.0.2
npm run set-pluto-version -- 1.0.2      # run again: auto-increments to 1.0.2-build.2
npm run set-pluto-version -- 1.0.2 5    # explicitly set the build number
```

The script ([scripts/setPlutoVersion.mjs](scripts/setPlutoVersion.mjs)) does four things:

1. Sets the package version to `<pluto-version>-build.<n>` via `npm version`, updating `package.json` and `package-lock.json`. Without an explicit build number, it starts at `1` and auto-increments when the current version is already based on the same Pluto version.
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

1. Run `npm run set-pluto-version -- <pluto-version>` and commit the changes.
2. Build with `npm run make`. Asset generation downloads Julia, instantiates the Pluto environment into a bundled depot, and packages everything.
3. Tag and publish through the usual release flow.
