/**
 * Type definitions for GEM Browser Remote Browser integration
 */

import type { AgentOpt } from '@midscene/core';
import type { WebPageAgentOpt } from '../web-element';

// Re-export types from constants
export type { BrowserEngine, GemBrowserEnvironment } from './constants';

/**
 * Display resolution configuration
 */
export interface DisplayResolution {
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
}

/**
 * FaaS instance creation options
 */
export interface FaaSInstanceCreateOptions {
  /** Docker image to use (optional, defaults to server-side default) */
  image?: string;

  /** Environment variables */
  envs?: Record<string, string>;

  /** Metadata for the instance */
  metadata?: Record<string, string>;

  /** Time-to-live in minutes (3-1440) */
  ttlMinutes?: number;

  /** Display width in pixels */
  displayWidth?: number;

  /** Display height in pixels */
  displayHeight?: number;

  /** Browser user agent */
  userAgent?: string;
}

/**
 * FaaS instance information
 */
export interface FaaSInstanceInfo {
  /** Unique sandbox ID */
  sandboxId: string;

  /** Creation timestamp */
  createdAt?: Date;

  /** Expiration timestamp */
  expiresAt?: Date;

  /** Instance status */
  status?: 'creating' | 'running' | 'stopped' | 'error';
}

/**
 * FaaS instance creation response
 */
export interface FaaSInstanceCreateResponse {
  data: {
    sandbox_id: string;
  };
}

/**
 * CDP endpoint information
 */
export interface CdpEndpointInfo {
  /** Browser version */
  Browser: string;

  /** Protocol version */
  'Protocol-Version': string;

  /** User agent */
  'User-Agent': string;

  /** WebKit version */
  'WebKit-Version': string;

  /** WebSocket debugger URL */
  webSocketDebuggerUrl: string;
}

/**
 * Remote browser configuration options
 */
export interface RemoteBrowserOptions extends WebPageAgentOpt {
  /**
   * GEM Browser environment
   * @default 'CN'
   */
  environment?: 'CN' | 'I18N' | 'BOE' | 'VOLCANO';

  /**
   * Custom base URL (overrides environment)
   */
  baseUrl?: string;

  /**
   * Browser engine to use
   * @default 'puppeteer'
   */
  engine?: 'puppeteer' | 'playwright';

  /**
   * Instance TTL in minutes (3-1440)
   * @default 60
   */
  ttlMinutes?: number;

  /**
   * Display resolution
   */
  displayWidth?: number;
  displayHeight?: number;

  /**
   * Browser user agent
   */
  userAgent?: string;

  /**
   * Whether to automatically cleanup the instance on agent disposal
   * @default true
   */
  autoCleanup?: boolean;

  /**
   * Request timeout in milliseconds
   * @default 30000
   */
  requestTimeout?: number;

  /**
   * Connection timeout in milliseconds
   * @default 30000
   */
  connectionTimeout?: number;

  /**
   * Existing sandbox ID to connect to (instead of creating new)
   */
  sandboxId?: string;

  /**
   * Additional environment variables for FaaS instance
   */
  faasEnvs?: Record<string, string>;

  /**
   * Metadata for the FaaS instance
   */
  faasMetadata?: Record<string, string>;

  /**
   * JWT token for authentication
   */
  jwtToken?: string;
}

/**
 * VNC options
 */
export interface VncOptions {
  /**
   * Auto-connect to VNC server
   * @default true
   */
  autoconnect?: boolean;

  /**
   * Additional query parameters for VNC
   */
  query?: Record<string, string>;
}

/**
 * Instance manager configuration
 */
export interface InstanceManagerConfig {
  /** Base URL of the GEM Browser service */
  baseUrl: string;

  /** Request timeout in milliseconds */
  requestTimeout?: number;

  /** JWT token for authentication */
  jwtToken?: string;
}

/**
 * Remote browser page interface (internal)
 */
export interface IRemoteBrowserPage {
  /** Get the sandbox ID */
  getSandboxId(): string;

  /** Get the CDP WebSocket URL */
  getCdpWsUrl(): string;

  /** Get the VNC URL */
  getVncUrl(options?: VncOptions): string;

  /** Check if the page is connected */
  isConnected(): boolean;

  /** Cleanup resources */
  cleanup(): Promise<void>;
}

/**
 * Error types
 */
export class RemoteBrowserError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'RemoteBrowserError';
  }
}

export class FaaSInstanceError extends RemoteBrowserError {
  constructor(message: string, code?: string, details?: unknown) {
    super(message, code, details);
    this.name = 'FaaSInstanceError';
  }
}

export class CdpConnectionError extends RemoteBrowserError {
  constructor(message: string, code?: string, details?: unknown) {
    super(message, code, details);
    this.name = 'CdpConnectionError';
  }
}
