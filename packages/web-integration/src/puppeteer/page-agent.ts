import {
  WebAgentCore,
  resolveBrowserAgentRuntimeOptions,
} from '@/common/browser-agent';
import { applyForceChromeSelectRendering } from '@/common/browser-agent-utils';
import type { WebPageAgentOpt } from '@/web-element';
import type { AgentTestRunnerNodeDefinition } from '@midscene/core/agent';
import { getDebug } from '@midscene/shared/logger';
import type { Page as PuppeteerPage } from 'puppeteer';
import { forceClosePopup } from './base-page';
import { PuppeteerWebPage } from './page';
import { puppeteerAgentTestRunnerNodeDefinitions } from './test-runner/agent-nodes';
import type { PuppeteerTestRunnerOptions } from './test-runner/types';

const debug = getDebug('puppeteer:agent');

export type PuppeteerPageAgentOpt = WebPageAgentOpt & {
  testRunner?: PuppeteerTestRunnerOptions;
};

export class PuppeteerPageAgent extends WebAgentCore<PuppeteerWebPage> {
  static override getTestRunnerNodeDefinitions(): readonly AgentTestRunnerNodeDefinition[] {
    return [
      ...WebAgentCore.getTestRunnerNodeDefinitions(),
      ...puppeteerAgentTestRunnerNodeDefinitions,
    ];
  }

  readonly testRunner?: PuppeteerTestRunnerOptions;

  constructor(page: PuppeteerPage, opts?: PuppeteerPageAgentOpt) {
    if (!page) {
      throw new Error(
        '[midscene] PuppeteerPageAgent requires a valid Puppeteer page instance. Please make sure to pass a valid page object.',
      );
    }
    const webPage = new PuppeteerWebPage(page, opts);
    super(webPage, opts);
    this.testRunner = opts?.testRunner;

    const { forceSameTabNavigation, forceChromeSelectRendering } = opts ?? {};
    const runtimeOptions = resolveBrowserAgentRuntimeOptions({
      agentName: 'PuppeteerPageAgent',
      pageScope: 'page',
      forceSameTabNavigation,
    });

    if (runtimeOptions.forceSameTabNavigation) {
      forceClosePopup(page, debug);
    }

    applyForceChromeSelectRendering(
      page,
      'puppeteer',
      forceChromeSelectRendering,
    );
  }
}

export { PuppeteerPageAgent as PuppeteerAgent };
