# AGENTS.md

Guidance for AI agents working in this repository.

## Electron UI inspection

This Electron Forge app can be launched with Chrome DevTools Protocol enabled so agents can inspect the rendered UI instead of coding blind.

Use:

```sh
npm run start:inspect
```

This starts Electron with `--remote-debugging-port=9333` and sets `SKIP_GENERATE_ASSETS=1` so local inspection does not block on Julia asset provisioning. If you need the full asset hook, use:

```sh
npm run start:inspect:assets
```

Once the app is running, inspect it from another terminal:

```sh
npm run inspect:tabs
npm run inspect:snapshot
npm run inspect:snapshot:interactive
npm run inspect:screenshot
```

Screenshots are written under `.agent-browser/`, which is ignored by git.

## Agent-browser notes

`agent-browser` is installed as a dev dependency. Prefer the npm scripts over global installs.

For this app, `agent-browser tab` and `agent-browser connect 9333` may fail with `CDP error (Target.createTarget): Not supported`. The Electron CDP endpoint still works. Use `npm run inspect:tabs`, which reads `http://localhost:9333/json/list` through `scripts/listCdpTargets.mjs`.

`agent-browser --cdp 9333 snapshot` and `agent-browser --cdp 9333 screenshot` work against the running Electron window.

## Local-change hygiene

Do not stage unrelated user changes. In particular, check `git status -sb` before committing and stage explicit files when the worktree is mixed.
