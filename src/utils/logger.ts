enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const LEVEL_LABELS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: "DEBUG",
  [LogLevel.INFO]: "INFO",
  [LogLevel.WARN]: "WARN",
  [LogLevel.ERROR]: "ERROR",
};

const currentLevel: LogLevel =
  LogLevel[
    (process.env.LOG_LEVEL?.toUpperCase() ?? "INFO") as keyof typeof LogLevel
  ] ?? LogLevel.INFO;

function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  if (level < currentLevel) return;
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${LEVEL_LABELS[level]}]`;
  const suffix = data ? ` ${JSON.stringify(data)}` : "";
  console.log(`${prefix} ${message}${suffix}`);
}

export const logger = {
  debug: (msg: string, data?: Record<string, unknown>) => log(LogLevel.DEBUG, msg, data),
  info: (msg: string, data?: Record<string, unknown>) => log(LogLevel.INFO, msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => log(LogLevel.WARN, msg, data),
  error: (msg: string, data?: Record<string, unknown>) => log(LogLevel.ERROR, msg, data),
};
