import path from 'node:path';
import { AgentOverChromeBridge } from '@/bridge-mode/agent-cli-side';
import { afterEach, describe, expect, it, rs } from '@rstest/core';
import dotenv from 'dotenv';

dotenv.config({
  path: path.resolve(__dirname, '../../../../../.env'),
});

rs.setConfig({
  testTimeout: 300 * 1000,
});

type BrowserTabSummary = Awaited<
  ReturnType<AgentOverChromeBridge['getBrowserTabList']>
>[number];

const trackedAgents: AgentOverChromeBridge[] = [];

/**
 * Check whether the Bridge and model parameters are configured for this environment.
 */
function isBridgeAiTestReady(): boolean {
  const hasBridgeMode = Boolean(process.env.BRIDGE_MODE);
  const hasModelName = Boolean(process.env.MIDSCENE_MODEL_NAME);
  const hasApiKey = Boolean(
    process.env.MIDSCENE_MODEL_API_KEY || process.env.OPENAI_API_KEY,
  );
  return hasBridgeMode && hasModelName && hasApiKey;
}

const describeIfReady = isBridgeAiTestReady() ? describe : describe.skip;

/**
 * Create a Bridge agent for the current test with stricter cleanup enabled.
 */
function createTrackedAgent(): AgentOverChromeBridge {
  const agent = new AgentOverChromeBridge({
    enableWaterFlowAnimation: false,
    closeNewTabsAfterDisconnect: true,
    closeConflictServer: true,
  });
  trackedAgents.push(agent);
  return agent;
}

/**
 * Destroy all Bridge agents created by this test to avoid leftover connections.
 */
async function destroyTrackedAgents(): Promise<void> {
  while (trackedAgents.length > 0) {
    const agent = trackedAgents.pop();
    if (!agent) continue;
    try {
      await agent.destroy();
    } catch (error) {
      console.warn('[bridge-test] failed to destroy agent:', error);
    }
  }
}

/**
 * Create an Example Domain URL with a unique token for precise tab lookup.
 */
function createExampleTarget(label: string): { token: string; url: string } {
  const token = `midscene-bridge-${label}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  return {
    token,
    url: `https://example.com/?${token}`,
  };
}

/**
 * Get the active tab in the current window.
 */
async function getCurrentActiveTab(
  agent: AgentOverChromeBridge,
): Promise<BrowserTabSummary> {
  const activeTab = (await agent.getBrowserTabList()).find(
    (tab) => tab.currentActiveTab,
  );
  expect(activeTab, 'expected a current active browser tab').toBeDefined();
  return activeTab as BrowserTabSummary;
}

/**
 * Find the tab created by this test using its unique token.
 */
async function findTabByToken(
  agent: AgentOverChromeBridge,
  token: string,
): Promise<BrowserTabSummary> {
  const matchedTab = (await agent.getBrowserTabList()).find((tab) =>
    tab.url.includes(token),
  );
  expect(
    matchedTab,
    `expected a browser tab that contains token ${token}`,
  ).toBeDefined();
  return matchedTab as BrowserTabSummary;
}

/**
 * Use an AI assertion to verify that the controlled page is connected to Example Domain.
 */
async function expectExampleDomain(
  agent: AgentOverChromeBridge,
): Promise<void> {
  await agent.aiAssert('the page shows "Example Domain" as the main heading');
}

afterEach(async () => {
  await destroyTrackedAgents();
}, 60_000);

describeIfReady(
  'Bridge 标签激活行为',
  {
    timeout: 3 * 60 * 1000,
  },
  () => {
    it('仅验证 activateTab=false 时新标签页不会抢占当前活动标签页', async () => {
      const observer = createTrackedAgent();
      const target = createExampleTarget('background');

      const activeTabBefore = await getCurrentActiveTab(observer);

      await observer.connectNewTabWithUrl(target.url, {
        activateTab: false,
      });

      const createdTab = await findTabByToken(observer, target.token);
      const activeTabAfter = await getCurrentActiveTab(observer);

      expect(createdTab.currentActiveTab).toBe(false);
      expect(createdTab.id).not.toBe(activeTabBefore.id);
      expect(activeTabAfter.id).toBe(activeTabBefore.id);

      await expectExampleDomain(observer);

      const activeTabAfterAiAssert = await getCurrentActiveTab(observer);
      expect(activeTabAfterAiAssert.id).toBe(activeTabBefore.id);
    });
  },
);
