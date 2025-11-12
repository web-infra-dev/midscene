/**
 * CDP Browser Connector
 * Connect to any CDP-compatible browser via WebSocket URL
 */

// Core connector function
export { connectToCdp } from './connector';

// Remote browser page implementation
export { RemoteBrowserPage } from './page';

// Types
export type { BrowserEngine, CdpConnectionOptions } from './types';
export { CdpConnectionError } from './types';
