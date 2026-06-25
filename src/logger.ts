import fs from "node:fs";
import path from "node:path";

import { USER_DATA_PATH } from "./paths";

type Level = "debug" | "error" | "info" | "log" | "verbose" | "warn";

function createLogger(label: string) {
  const logPath = path.join(USER_DATA_PATH, "logs", `${label}.log`);

  const write = (level: Level, params: unknown[]) => {
    const line = `${new Date().toISOString()} ${level} ${label} > ${params
      .map((param) =>
        typeof param === "string" ? param : JSON.stringify(param, null, 2),
      )
      .join(" ")}\n`;
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, line);
    console[level === "verbose" ? "log" : level](line.trimEnd());
  };

  return {
    debug: (...params: unknown[]) => write("debug", params),
    error: (...params: unknown[]) => write("error", params),
    info: (...params: unknown[]) => write("info", params),
    log: (...params: unknown[]) => write("log", params),
    verbose: (...params: unknown[]) => write("verbose", params),
    warn: (...params: unknown[]) => write("warn", params),
  };
}

export const generalLogger = createLogger("general");
export const juliaLogger = createLogger("julia");
export const backgroundLogger = createLogger("background");
