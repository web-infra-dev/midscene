import type { PuppeteerTestRunnerAgent } from './types';

export { resolveWebUrl, throwIfAborted } from '../../common/test-runner/utils';

export const requirePuppeteerAgent = (
  agent: unknown,
): PuppeteerTestRunnerAgent => {
  if (
    !agent ||
    typeof agent !== 'object' ||
    !('interface' in agent) ||
    !agent.interface ||
    typeof agent.interface !== 'object' ||
    !('underlyingPage' in agent.interface) ||
    !agent.interface.underlyingPage
  ) {
    throw new TypeError(
      'getAgent() must return a Puppeteer Agent with an underlying Page.',
    );
  }
  return agent as PuppeteerTestRunnerAgent;
};
