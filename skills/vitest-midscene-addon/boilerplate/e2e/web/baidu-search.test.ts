import { describe, expect, it } from 'vitest';
import { WebTest } from '../../src/context';

describe('百度搜索', () => {
  const ctx = WebTest.setup('https://baidu.com');

  it('应该成功搜索', async () => {
    await ctx.agent.aiAct('在搜索框中输入"新年快乐"，然后点击百度一下');
    await ctx.page.waitForLoadState('networkidle');
    const title = await ctx.page.title();
    expect(title).toContain('新年快乐');
  });

  it('应该能切换搜索词', async () => {
    await ctx.agent.aiAct('在搜索框中输入"Midscene"，然后点击百度一下');
    await ctx.page.waitForLoadState('networkidle');
    const title = await ctx.page.title();
    expect(title).toContain('Midscene');
  });

  it.skipIf(process.env.CI)('应该能搜索今天天气', async () => {
    await ctx.agent.aiAct('在搜索框中输入"今天天气"，然后点击百度一下');
    await ctx.page.waitForLoadState('networkidle');
    const title = await ctx.page.title();
    expect(title).toContain('今天天气');
  });

  it.skip('应该能打开百度首页', async () => {
    await ctx.page.waitForLoadState('networkidle');
    const title = await ctx.page.title();
    expect(title).toContain('百度');
  });
});
