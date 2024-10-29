import { PageAgent } from '@/common/agent';
import type ChromeExtensionProxyPage from './page';

export class ChromeExtensionProxyPageAgent extends PageAgent {
  constructor(page: ChromeExtensionProxyPage) {
    super(page, {});
  }
}
