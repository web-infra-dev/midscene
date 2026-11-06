import { createWebTestRunnerNodeDefinitions } from '@/common/test-runner/nodes';
import { playwrightTestDriverAdapter } from './driver';

export const playwrightAgentTestRunnerNodeDefinitions =
  createWebTestRunnerNodeDefinitions(playwrightTestDriverAdapter);
