export { PlaywrightAiFixture } from './playwright';
export type { PlayWrightAiFixtureType } from './playwright';
export type { WebPage, WebPageAgentOpt } from './web-element';
export type { WebUIContext } from '@midscene/core';

export { Agent as PageAgent, type AgentOpt } from '@midscene/core/agent';
export { PuppeteerAgent } from './puppeteer';
export { PlaywrightAgent } from './playwright';
export { StaticPageAgent, StaticPage } from './static';
export { connectToCdp, RemoteBrowserPage } from './remote-browser';
export type { BrowserEngine, CdpConnectionOptions } from './remote-browser';
export { WebPageContextParser } from './web-element';
