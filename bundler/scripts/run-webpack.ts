import webpack from 'webpack';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootPath = path.join(__dirname, '../..');

// Get the config path from args
const configIndex = process.argv.indexOf('--config');
let configPath =
  configIndex !== -1 ? process.argv[configIndex + 1] : './webpack.config.js';

// Resolve relative paths
if (!path.isAbsolute(configPath)) {
  configPath = path.resolve(rootPath, configPath);
}

// Convert to file URL for import
const configUrl = pathToFileURL(configPath).href;

// Dynamically import the config
const configModule = await import(configUrl);
const config = configModule.default;

// Run webpack
const compiler = webpack(config);
compiler.run((err, stats) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  if (stats?.hasErrors()) {
    console.error(stats.toString({ colors: true }));
    process.exit(1);
  }

  console.log(stats?.toString({ colors: true }));
  process.exit(0);
});
