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
 * 创建用于当前测试的 Bridge agent，默认开启更强的清理策略。
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
 * 回收本用例创建的所有 Bridge agent，避免连接残留影响后续测试。
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
