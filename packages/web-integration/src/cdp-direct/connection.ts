import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer, { type Browser } from 'puppeteer-core';

export interface CDPConnectOptions {
  /** WebSocket endpoint, e.g. ws://127.0.0.1:9222/devtools/browser/... */
  browserWSEndpoint?: string;
  /** Remote debugging port, e.g. 9222 */
  port?: number;
  /**
   * Chrome user data directory — reads DevToolsActivePort to auto-discover endpoint.
   * Note: must not be in use by another Chrome instance (profile lock).
   */
  userDataDir?: string;
}

export interface CDPLaunchOptions {
  headless?: boolean;
  /**
   * User data directory to preserve session/cookies.
   * Warning: cannot be shared with a running Chrome instance due to profile lock.
   */
  userDataDir?: string;
  /** Path to Chrome executable */
  executablePath?: string;
  /** Extra Chrome launch arguments */
  chromeArgs?: string[];
}

/**
 * Read the DevToolsActivePort file from a Chrome user data directory
 * to discover the WebSocket debugging endpoint.
 */
function discoverChromeEndpoint(userDataDir: string): string {
  const portPath = path.join(userDataDir, 'DevToolsActivePort');
  let fileContent: string;
  try {
    fileContent = fs.readFileSync(portPath, 'utf8');
  } catch (error) {
    throw new Error(
      `Could not read DevToolsActivePort from ${userDataDir}. Make sure Chrome is running with remote debugging enabled (chrome://inspect/#remote-debugging).`,
      { cause: error },
    );
  }

  const [rawPort, rawPath] = fileContent
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => !!line);

  if (!rawPort || !rawPath) {
    throw new Error(
      `Invalid DevToolsActivePort content: '${fileContent.trim()}'`,
    );
  }

  const port = Number.parseInt(rawPort, 10);
  if (Number.isNaN(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid port '${rawPort}' in DevToolsActivePort`);
  }

  return `ws://127.0.0.1:${port}${rawPath}`;
}

/**
 * Get the default Chrome user data directory for the current platform.
 */
function getDefaultChromeUserDataDir(): string {
  const platform = os.platform();
  const home = os.homedir();
  switch (platform) {
    case 'darwin':
      return path.join(
        home,
        'Library',
        'Application Support',
        'Google',
        'Chrome',
      );
    case 'win32':
      return path.join(
        home,
        'AppData',
        'Local',
        'Google',
        'Chrome',
        'User Data',
      );
    default:
      return path.join(home, '.config', 'google-chrome');
  }
}

/**
 * Connect via Puppeteer's HTTP-based browser URL discovery.
 */
async function connectByHttpDiscovery(port: number): Promise<Browser> {
  return puppeteer.connect({
    browserURL: `http://127.0.0.1:${port}`,
    defaultViewport: null,
  });
}

/**
 * Connect via DevToolsActivePort file discovery.
 * If expectedPort is provided, verifies the discovered port matches.
 */
function discoverEndpointWithPortCheck(
  userDataDir: string,
  expectedPort?: number,
): string {
  const endpoint = discoverChromeEndpoint(userDataDir);
  if (expectedPort !== undefined) {
    const match = endpoint.match(/:(\d+)\//);
    const discoveredPort = match ? Number.parseInt(match[1], 10) : -1;
    if (discoveredPort !== expectedPort) {
      throw new Error(
        `DevToolsActivePort port ${discoveredPort} does not match requested port ${expectedPort}`,
      );
    }
  }
  return endpoint;
}

/**
 * Connect to an existing Chrome instance.
 *
 * Supports three discovery methods:
 * 1. Direct WebSocket endpoint (`browserWSEndpoint`)
 * 2. Port number — tries HTTP discovery, falls back to DevToolsActivePort with port validation
 * 3. User data directory — reads DevToolsActivePort file directly
 */
export async function connectToChrome(
  options: CDPConnectOptions,
): Promise<Browser> {
  let browserWSEndpoint: string | undefined = options.browserWSEndpoint;

  if (!browserWSEndpoint && options.port) {
    if (options.userDataDir) {
      browserWSEndpoint = discoverEndpointWithPortCheck(
        options.userDataDir,
        options.port,
      );
    } else {
      try {
        return await connectByHttpDiscovery(options.port);
      } catch (httpError) {
        // HTTP discovery failed (e.g. Chrome uses chrome://inspect remote debugging).
        // Fall back to DevToolsActivePort from default profile, with port validation.
        try {
          browserWSEndpoint = discoverEndpointWithPortCheck(
            getDefaultChromeUserDataDir(),
            options.port,
          );
        } catch {
          throw new Error(
            `Failed to connect to Chrome on port ${options.port}. Make sure Chrome is running with --remote-debugging-port=${options.port}, or enable remote debugging via chrome://inspect.`,
            { cause: httpError },
          );
        }
      }
    }
  }

  if (!browserWSEndpoint && options.userDataDir) {
    browserWSEndpoint = discoverChromeEndpoint(options.userDataDir);
  }

  if (!browserWSEndpoint) {
    throw new Error(
      'Must provide one of: browserWSEndpoint, port, or userDataDir',
    );
  }

  return puppeteer.connect({
    browserWSEndpoint,
    defaultViewport: null,
  });
}

/**
 * Launch a new Chrome instance.
 * If userDataDir is provided, the instance will share sessions/cookies
 * with the user's existing Chrome profile.
 */
export async function launchChrome(
  options?: CDPLaunchOptions,
): Promise<Browser> {
  const {
    headless = false,
    userDataDir,
    executablePath,
    chromeArgs = [],
  } = options || {};

  return puppeteer.launch({
    headless,
    executablePath,
    userDataDir,
    defaultViewport: null,
    channel: executablePath ? undefined : 'chrome',
    args: ['--hide-crash-restore-bubble', ...chromeArgs],
  });
}
