import type { BrowserContext, Page } from 'playwright';
import type { Awaitable } from '../engine/types';
import type { NodeExecutionContext } from '../node/types';

export type PlaywrightCookie = Parameters<
  BrowserContext['addCookies']
>[0][number];
export type PlaywrightNodeContext<TContext> = NodeExecutionContext<
  unknown,
  TContext
>;

/** Context passed to a configured Playwright cookie profile resolver. */
export interface PlaywrightCookieProfileContext<TContext> {
  /** Profile reference from the setCookies Node input. */
  profile: string;
  /** Project Context for the current workflow. */
  context: TContext;
  /** Cancellation signal for the current Node execution. */
  signal: AbortSignal;
}

/** Dependencies and source resolvers used by the Playwright preset Nodes. */
export interface CreatePlaywrightNodesOptions<TContext> {
  /** Return the Playwright Page associated with the current workflow. */
  getPage(ctx: PlaywrightNodeContext<TContext>): Awaitable<Page>;
  /** Return the base URL used to resolve relative gotoUrl inputs. */
  getBaseUrl?(
    ctx: PlaywrightNodeContext<TContext>,
  ): Awaitable<string | undefined>;
  /**
   * Return the environment used by setCookies. Defaults to process.env when
   * omitted.
   */
  getEnv?(
    ctx: PlaywrightNodeContext<TContext>,
  ): Awaitable<Readonly<Record<string, string | undefined>>>;
  /** Resolve a named cookie profile without placing cookie values in YAML. */
  getCookieProfile?(
    input: PlaywrightCookieProfileContext<TContext>,
  ): Awaitable<readonly PlaywrightCookie[]>;
  /**
   * Resolve a storage-state reference to a file path. References are resolved
   * from process.cwd() when omitted.
   */
  resolveStorageStatePath?(
    path: string,
    ctx: PlaywrightNodeContext<TContext>,
  ): Awaitable<string>;
}
