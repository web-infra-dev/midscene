/**
 * Unified logger for the record system
 * Only logs critical information to reduce noise
 */

import type { ChromeRecordedEvent } from '@midscene/record';

interface LogContext {
  sessionId?: string;
  tabId?: number;
  events?: ChromeRecordedEvent[];
  eventsCount?: number;
  action?: string;
}

class RecordLogger {
  private readonly prefix = '[Record]';
  private readonly isDev = process.env.NODE_ENV === 'development';

  /**
   * Log critical errors that affect functionality
   */
  error(message: string, context?: LogContext, error?: any) {
    const contextStr = context ? this.formatContext(context) : '';
    console.error(`${this.prefix} ERROR: ${message}${contextStr}`, error);
  }

  /**
   * Log important state changes and operations
   */
  info(message: string, context?: LogContext) {
    if (!this.isDev) return;

    const contextStr = context ? this.formatContext(context) : '';
    console.log(`${this.prefix} ${message}${contextStr}`);
  }

  /**
   * Log warnings for recoverable issues
   */
  warn(message: string, context?: LogContext) {
    const contextStr = context ? this.formatContext(context) : '';
    console.warn(`${this.prefix} WARN: ${message}${contextStr}`);
  }

  /**
   * Log successful operations
   */
  success(message: string, context?: LogContext) {
    if (!this.isDev) return;

    const contextStr = context ? this.formatContext(context) : '';
    console.log(`${this.prefix} ✓ ${message}${contextStr}`);
  }

  private formatContext(context: LogContext): string {
    const parts: string[] = [];
    if (context.sessionId) parts.push(`session:${context.sessionId.slice(-8)}`);
    if (context.tabId) parts.push(`tab:${context.tabId}`);
    if (context.eventsCount !== undefined)
      parts.push(`events:${context.eventsCount}`);
    if (context.action) parts.push(`action:${context.action}`);

    return parts.length > 0 ? ` [${parts.join(', ')}]` : '';
  }
}

export const recordLogger = new RecordLogger();
