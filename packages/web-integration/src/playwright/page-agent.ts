import {
  WebAgentCore,
  resolveBrowserAgentRuntimeOptions,
} from '@/common/browser-agent';
import { applyForceChromeSelectRendering } from '@/common/browser-agent-utils';
import type { WebPageAgentOpt } from '@/web-element';
import type { AgentTestRunnerNodeDefinition } from '@midscene/core/agent';
import { getDebug } from '@midscene/shared/logger';
import type { Page as PlaywrightPage } from 'playwright';
import { forceClosePopup } from '../puppeteer/base-page';
import { WebPage as PlaywrightWebPage } from './page';
import { playwrightAgentTestRunnerNodeDefinitions } from './test-runner/agent-nodes';
import type { PlaywrightTestRunnerOptions } from './test-runner/types';

const debug = getDebug('playwright:agent');

export type PlaywrightPageAgentOpt = WebPageAgentOpt & {
  testRunner?: PlaywrightTestRunnerOptions;
};

export class PlaywrightPageAgent extends WebAgentCore<PlaywrightWebPage> {
  static override getTestRunnerNodeDefinitions(): readonly AgentTestRunnerNodeDefinition[] {
    return [
      ...WebAgentCore.getTestRunnerNodeDefinitions(),
      ...playwrightAgentTestRunnerNodeDefinitions,
    ];
  }

  readonly testRunner?: PlaywrightTestRunnerOptions;

  constructor(page: PlaywrightPage, opts?: PlaywrightPageAgentOpt) {
    if (!page) {
      throw new Error(
        '[midscene] PlaywrightPageAgent requires a valid Playwright page instance. Please make sure to pass a valid page object.',
      );
    }
    const webPage = new PlaywrightWebPage(page, opts);
    super(webPage, opts);
    this.testRunner = opts?.testRunner;

    const { forceSameTabNavigation, forceChromeSelectRendering } = opts ?? {};
    const runtimeOptions = resolveBrowserAgentRuntimeOptions({
      agentName: 'PlaywrightPageAgent',
      pageScope: 'page',
      forceSameTabNavigation,
    });

    if (runtimeOptions.forceSameTabNavigation) {
      forceClosePopup(page, debug);
    }

    applyForceChromeSelectRendering(
      page,
      'playwright',
      forceChromeSelectRendering,
    );
  }
}

export { PlaywrightPageAgent as PlaywrightAgent };
