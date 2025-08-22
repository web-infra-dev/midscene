import { Agent as PageAgent, type PageAgentOpt } from '@midscene/core/agent';
import type ChromeExtensionProxyPage from './page';

export class ChromeExtensionProxyPageAgent extends PageAgent {
  // biome-ignore lint/complexity/noUselessConstructor: <explanation>
  constructor(page: ChromeExtensionProxyPage, opts?: PageAgentOpt) {
    super(page, opts);
  }
}
