export { PlaywrightAiFixture } from './playwright';
export type { PlayWrightAiFixtureType } from './playwright';

export { Agent as PageAgent, type AgentOpt } from '@midscene/core/agent';
export {
  PuppeteerAgent,
  PuppeteerBrowserAgent,
  type PuppeteerBrowserAgentCreateOpt,
  type PuppeteerBrowserAgentOpt,
} from './puppeteer';
export {
  PlaywrightAgent,
  PlaywrightBrowserAgent,
  type PlaywrightBrowserAgentCreateOpt,
  type PlaywrightBrowserAgentOpt,
} from './playwright';
export { StaticPageAgent, StaticPage } from './static';
export { WebMidsceneTools } from './agent-tools';
export { webPlaygroundPlatform } from './platform';
export { WebCdpMidsceneTools } from './agent-tools-cdp';
