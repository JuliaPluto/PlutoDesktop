/**
 * This file includes all the CLI functionalities.
 * You can call something like "pluto -n="test.pluto.jl""
 */

import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';

const arg = yargs(hideBin(process.argv))
  .option('project', {
    alias: 'p',
    type: 'string',
    description: 'Open project in this location',
  })
  .option('url', {
    alias: 'u',
    type: 'string',
    description: 'Open a pluto URL in Pluto Desktop',
  })
  .option('notebook', {
    alias: 'n',
    type: 'string',
    description: 'Open a .pluto.jl notebook in Pluto Desktop',
  })
  .help()
  .parseSync();

const checkIfCalledViaCLI = (args: string[]) => {
  if (args && args.length > 1) {
    return true;
  }
  return false;
};

export { arg, checkIfCalledViaCLI };
