import { type AgentOpt, Agent as PageAgent } from '@midscene/core/agent';
import type ChromeExtensionProxyPage from './page';

export class ChromeExtensionProxyPageAgent extends PageAgent {
  // biome-ignore lint/complexity/noUselessConstructor: <explanation>
  constructor(page: ChromeExtensionProxyPage, opts?: AgentOpt) {
    super(page, opts);
  }
}
