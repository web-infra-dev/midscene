export enum LogLevel {
  VERBOSE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
}

export interface LoggerOptions {
  level?: LogLevel;
  prefix?: string;
  category?: string;
}
