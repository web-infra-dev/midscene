import path from 'node:path';
import { AgentOverChromeBridge } from '@/bridge-mode/agent-cli-side';
import dotenv from 'dotenv';
import { afterEach, describe, expect, it, vi } from 'vitest';

dotenv.config({
  path: path.resolve(__dirname, '../../../../../.env'),
});

vi.setConfig({
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
 * Track the agent created by the current test for cleanup in afterEach.
 */
function trackAgent(agent: AgentOverChromeBridge): AgentOverChromeBridge {
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
      // Force-close tabs created by this test to avoid leftover tabs in Chrome.
      await agent.destroy(true);
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
});

describeIfReady(
  'Bridge 标签激活行为',
  {
    timeout: 3 * 60 * 1000,
  },
  () => {
    it('后台打开新标签页时保留原始活动标签页', async () => {
      const observer = trackAgent(
        new AgentOverChromeBridge({
          enableWaterFlowAnimation: false,
        }),
      );
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
    });

    it('省略 activateTab 时保持旧行为并激活新标签页', async () => {
      const observer = trackAgent(
        new AgentOverChromeBridge({
          enableWaterFlowAnimation: false,
        }),
      );
      const target = createExampleTarget('foreground-default');

      const activeTabBefore = await getCurrentActiveTab(observer);

      await observer.connectNewTabWithUrl(target.url);

      const createdTab = await findTabByToken(observer, target.token);
      const activeTabAfter = await getCurrentActiveTab(observer);

      expect(createdTab.currentActiveTab).toBe(true);
      expect(activeTabAfter.id).toBe(createdTab.id);
      expect(activeTabAfter.id).not.toBe(activeTabBefore.id);

      await expectExampleDomain(observer);
    });

    it('连接当前前台标签页时不改变现有标签选择', async () => {
      const opener = trackAgent(
        new AgentOverChromeBridge({
          enableWaterFlowAnimation: false,
        }),
      );
      const target = createExampleTarget('current-tab');

      await opener.connectNewTabWithUrl(target.url);
      const activeTabBeforeReconnect = await getCurrentActiveTab(opener);
      expect(activeTabBeforeReconnect.url).toContain(target.token);

      const reconnectAgent = trackAgent(
        new AgentOverChromeBridge({
          enableWaterFlowAnimation: false,
        }),
      );

      const currentTabBeforeConnect = await getCurrentActiveTab(reconnectAgent);
      expect(currentTabBeforeConnect.id).toBe(activeTabBeforeReconnect.id);

      await reconnectAgent.connectCurrentTab();

      const currentTabAfterConnect = await getCurrentActiveTab(reconnectAgent);
      expect(currentTabAfterConnect.id).toBe(currentTabBeforeConnect.id);
      expect(currentTabAfterConnect.url).toContain(target.token);

      await expectExampleDomain(reconnectAgent);
    });

    it('旧的 setActiveTabId 仍可将先前创建的后台标签页切到前台', async () => {
      const opener = trackAgent(
        new AgentOverChromeBridge({
          enableWaterFlowAnimation: false,
        }),
      );
      const target = createExampleTarget('manual-foreground');

      const activeTabBefore = await getCurrentActiveTab(opener);

      await opener.connectNewTabWithUrl(target.url, {
        activateTab: false,
      });

      const backgroundTab = await findTabByToken(opener, target.token);
      expect(backgroundTab.currentActiveTab).toBe(false);

      const switcher = trackAgent(
        new AgentOverChromeBridge({
          enableWaterFlowAnimation: false,
        }),
      );

      await switcher.setActiveTabId(backgroundTab.id);

      const activeTabAfter = await getCurrentActiveTab(switcher);
      expect(activeTabAfter.id).toBe(backgroundTab.id);
      expect(activeTabAfter.id).not.toBe(activeTabBefore.id);

      await expectExampleDomain(switcher);
    });
  },
);
