/**
 * Type definitions for CDP Browser Connector
 */

import type { WebPageAgentOpt } from '../web-element';

/**
 * Browser engine type
 */
export type BrowserEngine = 'puppeteer' | 'playwright';

/**
 * CDP connection options
 */
export interface CdpConnectionOptions extends WebPageAgentOpt {
  /**
   * Browser engine to use
   * @default 'puppeteer'
   */
  engine?: BrowserEngine;

  /**
   * Connection timeout in milliseconds
   * @default 30000
   */
  connectionTimeout?: number;
}

/**
 * CDP connection error
 */
export class CdpConnectionError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'CdpConnectionError';
  }
}
