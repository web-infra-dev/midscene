import { type AgentOpt, Agent as PageAgent } from '@midscene/core/agent';
import { BROWSER_NAVIGATION_ERROR_PATTERN } from '../puppeteer/base-page';
import type ChromeExtensionProxyPage from './page';

export class ChromeExtensionProxyPageAgent extends PageAgent {
  protected isRetryableContextError(error: unknown): boolean {
    return (
      error instanceof Error &&
      BROWSER_NAVIGATION_ERROR_PATTERN.test(error.message)
    );
  }
}
