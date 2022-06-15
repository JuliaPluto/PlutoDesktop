import chalk from 'chalk';
import Store from 'electron-store';

const store = new Store();

console.log(chalk.green('STORE:'), store.store);

export default store;
