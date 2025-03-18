import { PageAgent, type PageAgentOpt } from '@/common/agent';
import type ChromeExtensionProxyPage from './page';

export class ChromeExtensionProxyPageAgent extends PageAgent {
  // biome-ignore lint/complexity/noUselessConstructor: <explanation>
  constructor(page: ChromeExtensionProxyPage, opts?: PageAgentOpt) {
    super(page, opts);
  }
}
