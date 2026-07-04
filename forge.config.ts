import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { PublisherGithub } from '@electron-forge/publisher-github';
import { WebpackPlugin } from '@electron-forge/plugin-webpack';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

import { mainConfig } from './webpack.main.config';
import { rendererConfig } from './webpack.renderer.config';
import generateAssets from './scripts/generateAssets.js';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    extraResource: [
      './generated_assets',
    ],
  },
  rebuildConfig: {},
  hooks: {
    generateAssets: generateAssets,
  },
  makers: [
    new MakerSquirrel({
      // Fixed name (instead of the default, which includes the version) so that
      // https://github.com/JuliaPluto/PlutoDesktop/releases/latest/download/PlutoSetup.exe
      // is a permanent download link.
      setupExe: 'PlutoSetup.exe',
      setupIcon: './assets/icon.ico',
      // Shown in Windows "Apps & features"; must be a URL, not a local path.
      iconUrl:
        'https://raw.githubusercontent.com/JuliaPluto/PlutoDesktop/main/assets/icon.ico',
    }),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  publishers: [
    new PublisherGithub({
      repository: {
        owner: 'JuliaPluto',
        name: 'PlutoDesktop',
      },
      // Draft or prerelease-flagged releases are invisible to
      // update.electronjs.org and to the /releases/latest download link.
      draft: false,
      prerelease: false,
      generateReleaseNotes: true,
    }),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new WebpackPlugin({
      // default port 3000 is popular and often taken by other dev servers
      port: 3010,
      mainConfig,
      renderer: {
        config: rendererConfig,
        entryPoints: [
          {
            html: './src/index.html',
            js: './src/renderer.ts',
            name: 'main_window',
            preload: {
              js: './src/preload.ts',
            },
          },
        ],
      },
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
