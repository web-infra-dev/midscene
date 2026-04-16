/**
 * Shared constants for CDP proxy discovery between cdp-proxy.ts and mcp-tools-cdp.ts.
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const PROXY_ENDPOINT_FILE = join(
  tmpdir(),
  'midscene-cdp-proxy-endpoint',
);
export const PROXY_PID_FILE = join(tmpdir(), 'midscene-cdp-proxy-pid');
export const PROXY_UPSTREAM_FILE = join(
  tmpdir(),
  'midscene-cdp-proxy-upstream',
);
export const TARGET_ID_FILE = join(tmpdir(), 'midscene-cdp-target-id');
