import type {
  CookieProfileContext,
  WebNodeContext,
} from '@/common/test-runner/cookies';
import type { WebTestRunnerOptions } from '@/common/test-runner/driver';
import type { CookieParam, Page } from 'puppeteer';

export type PuppeteerCookie = CookieParam;
export type PuppeteerNodeContext<TContext> = WebNodeContext<TContext>;
export type PuppeteerCookieProfileContext<TContext> =
  CookieProfileContext<TContext>;

/** Dependencies and source resolvers used by the Puppeteer preset Nodes. */
export interface PuppeteerTestRunnerOptions
  extends WebTestRunnerOptions<PuppeteerTestRunnerAgent> {
  getCookieProfile?(
    input: PuppeteerCookieProfileContext<PuppeteerTestRunnerAgent>,
  ): readonly PuppeteerCookie[] | Promise<readonly PuppeteerCookie[]>;
}

/** Runtime resources used by Puppeteer Agent Nodes. */
export interface PuppeteerTestRunnerAgent {
  interface: { underlyingPage: Page };
  readonly testRunner?: PuppeteerTestRunnerOptions;
}
