import type { PuppeteerAgent } from '@midscene/web/puppeteer';

declare global {
  /**
   * Global agent instance initialized by the runner based on CLI arguments.
   * Available in all user scripts.
   */
  var agent: PuppeteerAgent;
}
