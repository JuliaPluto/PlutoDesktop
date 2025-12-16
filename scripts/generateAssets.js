/**
 * @type {import("@electron-forge/shared-types").ForgeSimpleHookFn<"generateAssets">}
 */
export default async (config, platform, arch) => {
  console.log('Running generateAssets hook...');
  console.log('Config:', config);
  console.log('Platform:', platform);
  console.log('Arch:', arch);
  
  console.log('generateAssets hook completed.');
};

