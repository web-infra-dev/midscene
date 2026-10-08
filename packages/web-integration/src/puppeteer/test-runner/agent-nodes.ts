import { createWebTestRunnerNodeDefinitions } from '@/common/test-runner/nodes';
import { puppeteerTestDriverAdapter } from './driver';

export const puppeteerAgentTestRunnerNodeDefinitions =
  createWebTestRunnerNodeDefinitions(puppeteerTestDriverAdapter);
