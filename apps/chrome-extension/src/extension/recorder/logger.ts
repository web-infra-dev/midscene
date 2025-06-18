/**
 * Unified logger for the record system
 * Only logs critical information to reduce noise
 */

class RecordLogger {
  private readonly prefix = '[Record]';
  private readonly isDev = localStorage.getItem('DEBUG') === 'true';

  /**
   * Log critical errors that affect functionality
   */
  error(message: string, context?: any, error?: any) {
    console.error(`${this.prefix} ERROR: ${message}`, context, error);
  }

  /**
   * Log important state changes and operations
   */
  info(message: string, context?: any) {
    if (!this.isDev) return;

    console.log(`${this.prefix} ${message}`, context);
  }

  /**
   * Log warnings for recoverable issues
   */
  warn(message: string, context?: any) {
    console.warn(`${this.prefix} WARN: ${message}`, context);
  }

  /**
   * Log successful operations
   */
  success(message: string, context?: any) {
    if (!this.isDev) return;

    console.log(`${this.prefix} ✓ ${message}`, context);
  }

  /**
   * Log debug information (only in development)
   */
  debug(message: string, context?: any) {
    if (!this.isDev) return;
    console.debug(`${this.prefix} DEBUG: ${message}`, context);
  }
}

export const recordLogger = new RecordLogger();
