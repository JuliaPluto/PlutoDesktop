import { readFileSync } from "node:fs";
import type { ElectrobunConfig } from "electrobun";

const packageJson = JSON.parse(readFileSync("./package.json", "utf8"));

export default {
  app: {
    name: "Pluto.jl Desktop",
    identifier: "org.plutojl.desktop",
    version: packageJson.version,
    description: "Pluto.jl Desktop",
    fileAssociations: [
      {
        name: "Pluto Notebook",
        ext: ["jl", "pluto", "plutojl", "nbjl", "pljl"],
        role: "Editor",
      },
    ],
  },
  runtime: {
    exitOnLastWindowClosed: true,
  },
  build: {
    targets: "win-x64",
    bun: {
      entrypoint: "src/index.ts",
      sourcemap: "linked",
    },
    views: {
      desktop: {
        entrypoint: "src/desktop/preload.ts",
        sourcemap: "linked",
      },
    },
    copy: {
      "src/loading/index.html": "views/loading/index.html",
      assets: "assets",
      generated_assets: "generated_assets",
    },
    win: {
      bundleCEF: false,
      defaultRenderer: "native",
      icon: "assets/icon.ico",
    },
  },
  scripts: {
    preBuild: "./scripts/generateAssets.js",
  },
  release: {
    baseUrl:
      process.env.PLUTO_DESKTOP_RELEASE_BASE_URL ??
      "https://github.com/JuliaPluto/PlutoDesktop/releases/latest/download",
    generatePatch: process.env.PLUTO_DESKTOP_GENERATE_PATCH !== "0",
  },
} satisfies ElectrobunConfig;
