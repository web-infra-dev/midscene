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
 * 判断当前运行环境是否已经配置好 Bridge 和模型参数。
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
 * 记录当前用例创建的 agent，方便在 afterEach 中统一回收。
 */
function trackAgent(agent: AgentOverChromeBridge): AgentOverChromeBridge {
  trackedAgents.push(agent);
  return agent;
}

/**
 * 回收本用例创建的所有 Bridge agent，避免连接残留影响后续测试。
 */
async function destroyTrackedAgents(): Promise<void> {
  while (trackedAgents.length > 0) {
    const agent = trackedAgents.pop();
    if (!agent) continue;
    try {
      // 强制关闭本用例创建的标签页，避免后台连接测试在 Chrome 中留下残留 Tab。
      await agent.destroy(true);
    } catch (error) {
      console.warn('[bridge-test] failed to destroy agent:', error);
    }
  }
}

/**
 * 生成带唯一 token 的 Example Domain URL，便于在标签列表中准确定位目标页。
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
 * 获取当前窗口中处于激活状态的标签页。
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
 * 根据唯一 token 查找本用例创建的标签页。
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
 * 使用 AI 断言当前受控页已经稳定连接到 Example Domain。
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
