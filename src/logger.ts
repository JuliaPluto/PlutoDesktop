import log from 'electron-log';
import util from 'util';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  white: '\x1b[37m',
  red: '\x1b[31m',
  blue: '\x1b[94m',
  grey: '\x1b[90m',
  magenta: '\x1b[95m',
  yellow: '\x1b[33m',
  bgYellowBlack: '\x1b[43m\x1b[30m',
};

const colorize = (color: string, text: string) => `${color}${text}${colors.reset}`;

const functions = {
  debug: (prefix: string, ...params: any[]) =>
    console.debug(prefix, '>', colorize(colors.white, params.join(' '))),
  error: (prefix: string, ...params: any[]) =>
    console.error(prefix, '>', colorize(colors.red, params.join(' '))),
  info: (prefix: string, ...params: any[]) =>
    console.info(prefix, '>', colorize(colors.blue, params.join(' '))),
  log: (prefix: string, ...params: any[]) =>
    console.log(prefix, '>', colorize(colors.grey, params.join(' '))),
  silly: (prefix: string, ...params: any[]) =>
    console.log(prefix, '>', colorize(colors.magenta, params.join(' '))),
  verbose: (prefix: string, ...params: any[]) =>
    console.log(prefix, '>', colorize(colors.grey, params.join(' '))),
  warn: (prefix: string, ...params: any[]) =>
    console.warn(prefix, '>', colorize(colors.yellow, params.join(' '))),
  announce: (prefix: string, ...params: any[]) =>
    console.warn(prefix, '>', colorize(colors.bgYellowBlack, ` ${params.join(' ')} `)),
  request: (...params: any[]) =>
    console.warn(colorize(colors.bgYellowBlack, ' request '), '>', params.join(' ')),
  response: (...params: any[]) =>
    console.warn(colorize(colors.bgYellowBlack, ' response '), '>', params.join(' ')),
};

const format = '{y}-{m}-{d} {h}:{i}:{s}.{ms} {level} {label} > {text}';

/**
 * **generalLogger** is the logger that logs the electron main process.
 */
const generalLogger = log.create({ logId: 'general-log' });
generalLogger.variables.label = 'general';
generalLogger.levels.push('announce');
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
const juliaLogger = log.create({ logId: 'julia-log' });
juliaLogger.variables.label = 'julia';
juliaLogger.transports.file.format = format;
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
 * **backgroundLogger** logs about the things happening in the background, like autoUpdate.
 */
const backgroundLogger = log.create({ logId: 'background-log' });
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