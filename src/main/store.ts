import chalk from 'chalk';
import Store from 'electron-store';

const store = new Store<SettingsStore>({
  defaults: { 'JULIA-PATH': 'julia-1.7.3\\bin\\julia.exe' },
});

console.log(chalk.green('STORE:'), store.store);

export default store;
