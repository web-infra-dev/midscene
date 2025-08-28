export { PlaywrightAiFixture } from './playwright';
export type { PlayWrightAiFixtureType } from './playwright';
export type { WebPage } from './web-element';
export type { WebUIContext } from './web-element';

export { Agent as PageAgent, type AgentOpt } from '@midscene/core/agent';
export { PuppeteerAgent } from './puppeteer';
export { PlaywrightAgent } from './playwright';
export { StaticPageAgent } from './playground/agent';
export { WebPageContextParser } from './web-element';

// Export playground common utilities
export {
  formatErrorMessage,
  executeAction,
  validateStructuredParams,
} from './playground/common';
