import { createRequire } from 'node:module';
import type { AgentTestRunnerNodeProvider } from '@midscene/core/agent/test';
import { describe, expect, it, rs } from '@rstest/core';
import { createMidsceneNodes } from '../src/midscene';

const require = createRequire(import.meta.url);
describe('observe platform catalogs', () => {
  it.each([
    ['@midscene/android', 'AndroidAgent'],
    ['@midscene/ios', 'IOSAgent'],
    ['@midscene/harmony', 'HarmonyAgent'],
    ['@midscene/computer', 'ComputerAgent'],
    ['@midscene/web/puppeteer', 'PuppeteerAgent'],
    ['@midscene/web/puppeteer', 'PuppeteerBrowserAgent'],
    ['@midscene/web/playwright', 'PlaywrightAgent'],
    ['@midscene/web/playwright', 'PlaywrightBrowserAgent'],
  ])(
    'inherits exactly one observe Node without acquiring a device: %s / %s',
    (entry, name) => {
      const agentClass = require(entry)[name] as AgentTestRunnerNodeProvider;
      const getAgent = rs.fn();
      const nodes = createMidsceneNodes({ agentClass, getAgent });
      expect(nodes.filter((node) => node.name === 'observe')).toHaveLength(1);
      expect(getAgent).not.toHaveBeenCalled();
    },
  );
});
