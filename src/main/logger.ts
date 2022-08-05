/* eslint-disable @typescript-eslint/ban-ts-comment */

import axios from 'axios';
import {
  errorLogger,
  requestLogger,
  responseLogger,
  setGlobalConfig,
} from 'axios-logger';
import chalk from 'chalk';
import log from 'electron-log';
import util from 'util';

const functions = {
  debug: (prefix: string, ...params: any[]) =>
    console.debug(prefix, '>', chalk.white(params)),
  error: (prefix: string, ...params: any[]) =>
    console.error(prefix, '>', chalk.red(params)),
  info: (prefix: string, ...params: any[]) =>
    console.info(prefix, '>', chalk.blueBright(params)),
  log: (prefix: string, ...params: any[]) =>
    console.log(prefix, '>', chalk.grey(params)),
  silly: (prefix: string, ...params: any[]) =>
    console.log(prefix, '>', chalk.magentaBright(params)),
  verbose: (prefix: string, ...params: any[]) =>
    console.log(prefix, '>', chalk.grey(params)),
  warn: (prefix: string, ...params: any[]) =>
    console.warn(prefix, '>', chalk.yellow(params)),
  announce: (prefix: string, ...params: any[]) =>
    console.warn(prefix, '>', chalk.bgYellow.black(params)),
  request: (...params: any[]) =>
    console.warn(chalk.bgYellow.black(' request '), '>', params),
  response: (...params: any[]) =>
    console.warn(chalk.bgYellow.black(' response '), '>', params),
};

const format = '{y}-{m}-{d} {h}:{i}:{s}.{ms} {level} {label} > {text}';

/**
 * **generalLogger** is the logger that logs the electron main process.
 */

const generalLogger = log.create('general-log');
generalLogger.variables.label = 'general';
generalLogger.levels.add('announce');
generalLogger.transports.file.format = format;
// @ts-ignore
generalLogger.transports.console = (message) => {
  const text = util.format(...message.data);
  const prefix = `${message.date.toLocaleDateString()} ${message.date.toLocaleTimeString()} ${
    message.level
  } general`;
  switch (message.level) {
    case 'debug':
      functions.debug(prefix, text);
      break;
    case 'error':
      functions.error(prefix, text);
      break;
    case 'info':
      functions.info(prefix, text);
      break;
    // @ts-ignore
    case 'log':
      functions.log(prefix, text);
      break;
    case 'silly':
      functions.silly(prefix, text);
      break;
    case 'verbose':
      functions.verbose(prefix, text);
      break;
    case 'warn':
      functions.warn(prefix, text);
      break;
    // @ts-ignore
    case 'announce':
      functions.announce(prefix, text);
      break;
    default:
      functions.info(prefix, text);
      break;
  }
};
generalLogger.transports.console.useStyles = true;

/**
 * **juliaLogger** logs the julia and pluto console.
 */

const juliaLogger = log.create('julia-log');
juliaLogger.variables.label = 'julia';
juliaLogger.transports.file.format = format;
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
juliaLogger.transports.console = (message) => {
  const text = util.format(...message.data);
  const prefix = `${message.date.toLocaleDateString()} ${message.date.toLocaleTimeString()} ${
    message.level
  } julia`;
  switch (message.level) {
    case 'debug':
      functions.debug(prefix, text);
      break;
    case 'error':
      functions.error(prefix, text);
      break;
    case 'info':
      functions.info(prefix, text);
      break;
    // @ts-ignore
    case 'log':
      functions.log(prefix, text);
      break;
    case 'silly':
      functions.silly(prefix, text);
      break;
    case 'verbose':
      functions.verbose(prefix, text);
      break;
    case 'warn':
      functions.warn(prefix, text);
      break;
    default:
      functions.info(prefix, text);
      break;
  }
};
juliaLogger.transports.console.useStyles = true;

/**
 * Logger setup for axios
 */
setGlobalConfig({
  dateFormat: 'HH:MM:ss',
  params: true,
});
axios.interceptors.request.use(requestLogger, errorLogger);
axios.interceptors.response.use(responseLogger, errorLogger);

/**
 * **backgroundLogger** logs about the things happening in the background, like autoUpdate.
 */

const backgroundLogger = log.create('background-log');
backgroundLogger.variables.label = 'background';
backgroundLogger.transports.file.level = 'info';
backgroundLogger.transports.file.fileName = 'background.log';
backgroundLogger.transports.file.format = format;
// @ts-ignore
backgroundLogger.transports.console = (message) => {
  const text = util.format(...message.data);
  const prefix = `${message.date.toLocaleDateString()} ${message.date.toLocaleTimeString()} ${
    message.level
  } background`;
  switch (message.level) {
    case 'debug':
      functions.debug(prefix, text);
      break;
    case 'error':
      functions.error(prefix, text);
      break;
    case 'info':
      functions.info(prefix, text);
      break;
    // @ts-ignore
    case 'log':
      functions.log(prefix, text);
      break;
    case 'silly':
      functions.silly(prefix, text);
      break;
    case 'verbose':
      functions.verbose(prefix, text);
      break;
    case 'warn':
      functions.warn(prefix, text);
      break;
    default:
      functions.info(prefix, text);
      break;
  }
};
backgroundLogger.transports.console.useStyles = true;

export { generalLogger, juliaLogger, backgroundLogger };
