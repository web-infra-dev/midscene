import { LogLevel, LoggerOptions } from '../types/logger';
import { LOGGER_PREFIX } from '../const';

export class Logger {
  private level: LogLevel;
  private prefix: string;
  private category: string;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? LogLevel.INFO;
    this.prefix = options.prefix ?? LOGGER_PREFIX;
    this.category = options.category ?? '';
  }

  private formatMessage(message: string): string {
    const formattedPrefix = this.prefix ? `[${this.prefix}]` : '';
    const formattedCategory = this.category ? `[${this.category}]` : '';
    return `${formattedPrefix} ${formattedCategory} ${message}`;
  }

  private shouldLog(targetLevel: LogLevel): boolean {
    return targetLevel >= this.level;
  }

  verbose(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.VERBOSE)) {
      console.log(this.formatMessage(message), ...args);
    }
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.debug(this.formatMessage( message), ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.info(this.formatMessage(message), ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage(message), ...args);
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatMessage(message), ...args);
    }
  }
}



