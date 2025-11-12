/**
 * GEM Browser Remote Browser MCP + VNC Integration
 * Constants and environment configurations
 */

/**
 * GEM Browser deployment environments
 */
export const GEM_BROWSER_ENVIRONMENTS = {
  /** Internal CN environment - https://agent-browser-puppeteer.bytedance.net */
  CN: 'https://agent-browser-puppeteer.bytedance.net',

  /** Internal i18n environment - https://agent-browser-puppeteer.byteintl.net */
  I18N: 'https://agent-browser-puppeteer.byteintl.net',

  /** Internal BOE environment - https://agent-browser-puppeteer-boe.bytedance.net */
  BOE: 'https://agent-browser-puppeteer-boe.bytedance.net',

  /** External Volcano Engine environment */
  VOLCANO: 'https://sd18itejj5ce3htvrcnu0.apigateway-cn-beijing.volceapi.com',
} as const;

/**
 * Supported Playwright environments
 */
export const GEM_BROWSER_PLAYWRIGHT_ENVIRONMENTS = {
  CN: 'https://agent-browser-playwright.bytedance.net',
  I18N: 'https://agent-browser-playwright.byteintl.net',
  BOE: 'https://agent-browser-playwright-boe.bytedance.net',
} as const;

/**
 * Environment types
 */
export type GemBrowserEnvironment = keyof typeof GEM_BROWSER_ENVIRONMENTS;

/**
 * Browser engine types
 */
export type BrowserEngine = 'puppeteer' | 'playwright';

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
  /** Default TTL in minutes for FaaS instances */
  TTL_MINUTES: 60,

  /** Default display width */
  DISPLAY_WIDTH: 1920,

  /** Default display height */
  DISPLAY_HEIGHT: 1080,

  /** Default request timeout in milliseconds (60 seconds for instance creation) */
  REQUEST_TIMEOUT: 60000,

  /** Default connection timeout in milliseconds */
  CONNECTION_TIMEOUT: 30000,
} as const;

/**
 * API endpoints
 */
export const API_ENDPOINTS = {
  /** Create instance endpoint */
  CREATE: '/create',

  /** Ping endpoint for health check and TTL update */
  PING: '/v1/ping',

  /** CDP JSON version endpoint */
  CDP_VERSION: '/cdp/json/version',

  /** VNC endpoint */
  VNC: '/vnc/index.html',

  /** MCP endpoint */
  MCP: '/mcp',
} as const;

/**
 * HTTP headers
 */
export const HEADERS = {
  /** Create sandbox v2 header */
  CREATE_SANDBOX_V2: 'X-Faas-Create-Sandbox-V2',

  /** Instance name header */
  INSTANCE_NAME: 'X-Faas-Instance-Name',

  /** Delete sandbox header */
  DELETE_SANDBOX: 'X-Faas-Delete-Sandbox',

  /** Sandbox TTL header */
  SANDBOX_TTL_MINUTES: 'X-Faas-Sandbox-TTL-Minutes',

  /** JWT token header */
  JWT_TOKEN: 'X-JWT-TOKEN',
} as const;

/**
 * TTL constraints in minutes
 */
export const TTL_CONSTRAINTS = {
  /** Minimum TTL in minutes */
  MIN: 3,

  /** Maximum TTL in minutes */
  MAX: 24 * 60, // 24 hours
} as const;

/**
 * Common display resolutions
 */
export const COMMON_RESOLUTIONS = {
  /** 1920x1080 - Full HD */
  FHD: { width: 1920, height: 1080 },

  /** 1280x720 - HD */
  HD: { width: 1280, height: 720 },

  /** 640x720 - Mobile portrait */
  MOBILE_PORTRAIT: { width: 640, height: 720 },

  /** 375x667 - iPhone SE */
  IPHONE_SE: { width: 375, height: 667 },

  /** 390x844 - iPhone 12/13/14 */
  IPHONE_12: { width: 390, height: 844 },
} as const;

/**
 * User agents
 */
export const USER_AGENTS = {
  /** Desktop Chrome user agent */
  CHROME_DESKTOP:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',

  /** iPhone user agent */
  IPHONE:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',

  /** iPad user agent */
  IPAD: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',

  /** Android user agent */
  ANDROID:
    'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
} as const;
