import log from 'electron-log';
import * as fs from 'node:fs';
import * as path from 'node:path';
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
};

const colorize = (color: string, text: string) =>
  `${color}${text}${colors.reset}`;

const levelStyles: Record<
  string,
  { color: string; print: (...args: unknown[]) => void }
> = {
  debug: { color: colors.white, print: console.debug },
  error: { color: colors.red, print: console.error },
  info: { color: colors.blue, print: console.info },
  log: { color: colors.grey, print: console.log },
  silly: { color: colors.magenta, print: console.log },
  verbose: { color: colors.grey, print: console.log },
  warn: { color: colors.yellow, print: console.warn },
};

const createLogger = (label: string, fileName: string) => {
  const logger = log.create({ logId: `${label}-log` });
  logger.variables.label = label;
  logger.transports.file.fileName = fileName;
  logger.transports.file.format =
    '{y}-{m}-{d} {h}:{i}:{s}.{ms} {level} {label} > {text}';
  // @ts-expect-error electron-log accepts a plain function as a transport
  logger.transports.console = (message: log.LogMessage) => {
    const text = util.format(...message.data);
    const prefix = `${message.date.toLocaleDateString()} ${message.date.toLocaleTimeString()} ${
      message.level
    } ${label}`;
    const { color, print } = levelStyles[message.level] ?? levelStyles.info;
    print(prefix, '>', colorize(color, text));
  };
  return logger;
};

/**
 * **generalLogger** is the logger that logs the electron main process.
 */
const generalLogger = createLogger('general', 'general.log');

/**
 * **juliaLogger** logs the julia and pluto console.
 */
const juliaLogger = createLogger('julia', 'julia.log');

const getLogsFolder = (): string => {
  const logsFolder = path.dirname(generalLogger.transports.file.getFile().path);
  fs.mkdirSync(logsFolder, { recursive: true });
  return logsFolder;
};

export { generalLogger, juliaLogger, getLogsFolder };
