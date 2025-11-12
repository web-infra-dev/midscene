/**
 * CDP (Chrome DevTools Protocol) Browser Connector
 * Connects to any CDP-compatible browser via WebSocket URL
 */

import type { Page as PlaywrightPage } from 'playwright';
import type { Page as PuppeteerPage } from 'puppeteer';
import type { PlaywrightAgent } from '../playwright';
import type { PuppeteerAgent } from '../puppeteer';
import { RemoteBrowserPage } from './page';
import type { CdpConnectionOptions } from './types';

/**
 * Connect to a CDP WebSocket URL and create an Agent
 *
 * @param cdpWsUrl - CDP WebSocket URL (e.g., ws://localhost:9222/devtools/browser/xxx)
 * @param options - Connection options
 * @returns PuppeteerAgent or PlaywrightAgent
 *
 * @example
 * ```typescript
 * // Connect to local Chrome
 * const agent = await connectToCdp('ws://localhost:9222/devtools/browser/xxx', {
 *   engine: 'puppeteer'
 * });
 *
 * // Use AI methods
 * await agent.aiAction('Click the button');
 * const result = await agent.aiQuery('Get title: {title: string}');
 *
 * // Cleanup
 * await agent.destroy();
 * ```
 */
export async function connectToCdp(
  cdpWsUrl: string,
  options: CdpConnectionOptions = {},
): Promise<PuppeteerAgent | PlaywrightAgent> {
  const { engine = 'puppeteer', connectionTimeout, ...agentOptions } = options;

  // 1. Create RemoteBrowserPage and connect
  const remotePage = new RemoteBrowserPage(cdpWsUrl, engine);
  await remotePage.connect({
    connectionTimeout,
    webPageOpts: agentOptions,
  });

  // 2. Get the raw page instance
  const page = remotePage.getPage();

  // 3. Dynamically import and create Agent based on engine
  let agent: PuppeteerAgent | PlaywrightAgent;

  if (engine === 'puppeteer') {
    const { PuppeteerAgent } = await import('../puppeteer');
    agent = new PuppeteerAgent(page as PuppeteerPage, agentOptions);
  } else {
    const { PlaywrightAgent } = await import('../playwright');
    agent = new PlaywrightAgent(page as PlaywrightPage, agentOptions);
  }

  // 4. Ensure remotePage.destroy() is called when agent is destroyed
  const originalDestroy = agent.destroy.bind(agent);
  agent.destroy = async () => {
    await originalDestroy();
    await remotePage.destroy();
  };

  return agent;
}
