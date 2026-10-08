import type { PortableWebCookie, WebCookieSourceOptions } from './cookies';

export type WebNavigationWaitUntil =
  | 'commit'
  | 'domcontentloaded'
  | 'load'
  | 'networkidle'
  | 'networkidle0'
  | 'networkidle2';

export interface WebNavigationOptions {
  waitUntil: WebNavigationWaitUntil;
  timeoutMs: number;
}

export interface WebCookieFilters {
  name?: string;
  domain?: string;
  path?: string;
}

export interface WebViewportSize {
  width: number;
  height: number;
}

/** Browser-neutral operations used by the built-in Web Test Runner Nodes. */
export interface WebTestDriver {
  currentUrl(): string;
  baseUrl(): string | undefined;
  goto(
    url: string,
    options: WebNavigationOptions,
  ): Promise<{ status: number | null }>;
  title(): Promise<string>;
  setCookies(cookies: readonly PortableWebCookie[]): Promise<void>;
  clearCookies(filters: WebCookieFilters): Promise<void>;
  setViewportSize(size: WebViewportSize): Promise<WebViewportSize>;
}

export interface WebTestRunnerOptions<TAgent>
  extends WebCookieSourceOptions<TAgent> {
  /** Base URL used to resolve relative gotoUrl inputs before first navigation. */
  baseURL?: string;
}

/** A browser integration only implements this adapter, not individual Nodes. */
export interface WebTestDriverAdapter<
  TAgent,
  TOptions extends WebTestRunnerOptions<TAgent>,
> {
  requireAgent(agent: unknown): TAgent;
  createDriver(agent: TAgent): WebTestDriver;
  getOptions(agent: TAgent): TOptions | undefined;
}
