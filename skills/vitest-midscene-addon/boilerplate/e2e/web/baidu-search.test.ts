import { describe, expect } from 'vitest';
import { WebTest } from '../../src/context';

describe('百度搜索', () => {
  const it = WebTest.init('https://baidu.com');

  it('应该成功搜索', async ({ page, agent }) => {
    await agent.aiAct('在搜索框中输入"新年快乐"，然后点击百度一下');
    await page.waitForLoadState('networkidle');
    const title = await page.title();
    expect(title).toContain('新年快乐');
  });

  it('应该能切换搜索词', async ({ page, agent }) => {
    await agent.aiAct('在搜索框中输入"Midscene"，然后点击百度一下');
    await page.waitForLoadState('networkidle');
    const title = await page.title();
    expect(title).toContain('Midscene');
  });

  it.skipIf(process.env.CI)('应该能搜索今天天气', async ({ page, agent }) => {
    await agent.aiAct('在搜索框中输入"今天天气"，然后点击百度一下');
    await page.waitForLoadState('networkidle');
    const title = await page.title();
    expect(title).toContain('今天天气');
  });

  it.skip('应该能打开百度首页', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const title = await page.title();
    expect(title).toContain('百度');
  });
});
