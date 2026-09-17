import type {
  CookieProfileContext,
  WebCookieSourceOptions,
  WebNodeContext,
} from '@/common/test-runner/cookies';
import type { CookieParam, Page } from 'puppeteer';

export type PuppeteerCookie = CookieParam;
export type PuppeteerNodeContext<TContext> = WebNodeContext<TContext>;
export type PuppeteerCookieProfileContext<TContext> =
  CookieProfileContext<TContext>;

/** Dependencies and source resolvers used by the Puppeteer preset Nodes. */
export interface PuppeteerTestRunnerOptions
  extends WebCookieSourceOptions<PuppeteerTestRunnerAgent> {
  /** Base URL used to resolve relative gotoUrl inputs before first navigation. */
  baseURL?: string;
  getCookieProfile?(
    input: PuppeteerCookieProfileContext<PuppeteerTestRunnerAgent>,
  ): readonly PuppeteerCookie[] | Promise<readonly PuppeteerCookie[]>;
}

/** Runtime resources used by Puppeteer Agent Nodes. */
export interface PuppeteerTestRunnerAgent {
  interface: { underlyingPage: Page };
  readonly testRunner?: PuppeteerTestRunnerOptions;
}
