const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Ensures all components of the macOS app are signed consistently with ad-hoc signature
 * This is necessary when no Developer ID certificate is available
 */
exports.default = async function beforeSign(context) {
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
    const identities = execSync('security find-identity -v -p codesigning', { encoding: 'utf8' });
    const hasValidIdentity = identities.includes('Developer ID Application');
    
    if (hasValidIdentity) {
      // Valid certificate exists, let electron-builder handle signing normally
      return;
    }
  } catch (error) {
    // No valid certificate found, proceed with ad-hoc signing
  }

  console.log('No valid Developer ID certificate found, ensuring ad-hoc signing...');

  const frameworksPath = path.join(appPath, 'Contents', 'Frameworks');
  const electronFrameworkPath = path.join(
    frameworksPath,
    'Electron Framework.framework',
    'Versions',
    'A',
    'Electron Framework'
  );

  // Sign Electron Framework with ad-hoc signature if it exists
  if (fs.existsSync(electronFrameworkPath)) {
    try {
      execSync(
        `codesign --force --sign - --timestamp=none --options runtime "${electronFrameworkPath}"`,
        { stdio: 'inherit' }
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
      if (fs.statSync(frameworkPath).isDirectory()) {
        const binaryPath = path.join(frameworkPath, framework.replace('.framework', ''));
        if (fs.existsSync(binaryPath)) {
          try {
            execSync(
              `codesign --force --sign - --timestamp=none --options runtime "${binaryPath}"`,
              { stdio: 'inherit' }
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
        { stdio: 'inherit' }
      );
      console.log('Signed main executable with ad-hoc signature');
    } catch (error) {
      console.warn('Failed to sign main executable:', error.message);
    }
  }
};

