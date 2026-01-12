import type { PuppeteerAgent } from '@midscene/web/puppeteer';
import type { AgentProxy } from './agent-proxy';

type Agent = AgentProxy & Omit<PuppeteerAgent, 'page' | 'browser'>;

declare global {
  var agent: Agent;
}
