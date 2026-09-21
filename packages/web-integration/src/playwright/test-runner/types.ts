import type { BrowserContext, Page } from 'playwright';

type Awaitable<T> = T | Promise<T>;

export type PlaywrightCookie = Parameters<
  BrowserContext['addCookies']
>[0][number];
/** Runtime resources supplied by the test runner to Playwright Nodes. */
export interface PlaywrightNodeContext<TContext> {
  input: unknown;
  context: TContext;
  signal: AbortSignal;
}

/** Context passed to a configured Playwright cookie profile resolver. */
export interface PlaywrightCookieProfileContext<TContext> {
  /** Profile reference from the setCookies Node input. */
  profile: string;
  /** The Agent executing the current Node. */
  context: TContext;
  /** Cancellation signal for the current Node execution. */
  signal: AbortSignal;
}

/** Dependencies and source resolvers used by the Playwright preset Nodes. */
export interface PlaywrightTestRunnerOptions {
  /**
   * Return the environment used by setCookies. Defaults to process.env when
   * omitted.
   */
  getEnv?(
    ctx: PlaywrightNodeContext<PlaywrightTestRunnerAgent>,
  ): Awaitable<Readonly<Record<string, string | undefined>>>;
  /** Resolve a named cookie profile without placing cookie values in YAML. */
  getCookieProfile?(
    input: PlaywrightCookieProfileContext<PlaywrightTestRunnerAgent>,
  ): Awaitable<readonly PlaywrightCookie[]>;
  /**
   * Resolve a storage-state reference to a file path. References are resolved
   * from process.cwd() when omitted.
   */
  resolveStorageStatePath?(
    path: string,
    ctx: PlaywrightNodeContext<PlaywrightTestRunnerAgent>,
  ): Awaitable<string>;
}

/** The runtime resources used by Playwright Agent Nodes. */
export interface PlaywrightTestRunnerAgent {
  interface: { underlyingPage: Page };
  readonly testRunner?: PlaywrightTestRunnerOptions;
}
