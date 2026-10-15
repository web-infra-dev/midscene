export { resolveWebUrl, throwIfAborted } from '../../common/test-runner/utils';

import type { PlaywrightTestRunnerAgent } from './types';

export const requirePlaywrightAgent = (
  agent: unknown,
): PlaywrightTestRunnerAgent => {
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
      'getAgent() must return a Playwright Agent with an underlying Page.',
    );
  }
  return agent as PlaywrightTestRunnerAgent;
};
