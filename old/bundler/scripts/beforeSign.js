/*





🤖🤖🤖🤖🤖🤖🤖🤖🤖🤖🤖🤖🤖🤖🤖🤖🤖🤖🤖🤖🤖🤖🤖🤖🤖

This file is completely written by AI and not really reviewed. It's not working super well.

See https://github.com/JuliaPluto/PlutoDesktop/pull/91



*/

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

/**
 * Ensures all components of the macOS app are signed consistently with ad-hoc signature
 * This is necessary when no Developer ID certificate is available
 * This runs in the afterPack hook, which executes after packaging but before electron-builder's signing step
 */
export default async function afterPack(context) {
  const { electronPlatformName, appOutDir } = context;

  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  if (!fs.existsSync(appPath)) {
    console.warn('App bundle not found, skipping beforeSign');
    return;
  }

  // Check if we have a valid Developer ID certificate
  try {
    const identities = execSync('security find-identity -v -p codesigning', {
      encoding: 'utf8',
    });
    const hasValidIdentity = identities.includes('Developer ID Application');

    if (hasValidIdentity) {
      // Valid certificate exists, let electron-builder handle signing normally
      return;
    }
  } catch (error) {
    // No valid certificate found, proceed with ad-hoc signing
  }

  console.log(
    'No valid Developer ID certificate found, ensuring ad-hoc signing...',
  );

  const frameworksPath = path.join(appPath, 'Contents', 'Frameworks');
  const electronFrameworkPath = path.join(
    frameworksPath,
    'Electron Framework.framework',
  );

  // Sign Electron Framework first (deep signing)
  if (fs.existsSync(electronFrameworkPath)) {
    try {
      // Sign the framework binary first
      const frameworkBinary = path.join(
        electronFrameworkPath,
        'Versions',
        'A',
        'Electron Framework',
      );
      if (fs.existsSync(frameworkBinary)) {
        execSync(
          `codesign --force --sign - --timestamp=none --options runtime "${frameworkBinary}"`,
          { stdio: 'inherit' },
        );
      }
      // Then sign the framework bundle
      execSync(
        `codesign --force --sign - --timestamp=none "${electronFrameworkPath}"`,
        { stdio: 'inherit' },
      );
      console.log('Signed Electron Framework with ad-hoc signature');
    } catch (error) {
      console.warn('Failed to sign Electron Framework:', error.message);
    }
  }

  // Sign all other frameworks
  if (fs.existsSync(frameworksPath)) {
    const frameworks = fs.readdirSync(frameworksPath);
    for (const framework of frameworks) {
      if (framework === 'Electron Framework.framework') {
        continue; // Already handled above
      }

      const frameworkPath = path.join(frameworksPath, framework);
      if (
        fs.statSync(frameworkPath).isDirectory() &&
        framework.endsWith('.framework')
      ) {
        const binaryName = framework.replace('.framework', '');
        const binaryPath = path.join(frameworkPath, binaryName);
        if (fs.existsSync(binaryPath)) {
          try {
            execSync(
              `codesign --force --sign - --timestamp=none --options runtime "${binaryPath}"`,
              { stdio: 'inherit' },
            );
            execSync(
              `codesign --force --sign - --timestamp=none "${frameworkPath}"`,
              { stdio: 'inherit' },
            );
            console.log(`Signed ${framework} with ad-hoc signature`);
          } catch (error) {
            console.warn(`Failed to sign ${framework}:`, error.message);
          }
        }
      }
    }
  }

  // Sign the main executable
  const mainExecutable = path.join(appPath, 'Contents', 'MacOS', appName);
  if (fs.existsSync(mainExecutable)) {
    try {
      execSync(
        `codesign --force --sign - --timestamp=none --options runtime "${mainExecutable}"`,
        { stdio: 'inherit' },
      );
      console.log('Signed main executable with ad-hoc signature');
    } catch (error) {
      console.warn('Failed to sign main executable:', error.message);
    }
  }

  // Finally, sign the entire app bundle (this ensures all components have matching Team IDs)
  // Note: We don't use --deep as it's deprecated, and we've already signed all components
  try {
    execSync(
      `codesign --force --sign - --timestamp=none --options runtime "${appPath}"`,
      { stdio: 'inherit' },
    );
    console.log('Signed entire app bundle with ad-hoc signature');
  } catch (error) {
    console.warn('Failed to sign app bundle:', error.message);
  }
}
