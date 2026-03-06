import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { WebTestContext } from '../../src/context';

describe('百度搜索', () => {
  let ctx: WebTestContext;

  beforeAll(() => WebTestContext.setup());
  afterEach((testCtx) => WebTestContext.collectReport(ctx, testCtx));
  afterAll((suite) => WebTestContext.mergeAndTeardown(suite));

  it('应该成功搜索', async (testCtx) => {
    ctx = await WebTestContext.create('https://baidu.com', testCtx);
    await ctx.agent.aiAct('在搜索框中输入"新年快乐"，然后点击百度一下');
    await ctx.page.waitForLoadState('networkidle');
    const title = await ctx.page.title();
    expect(title).toContain('新年快乐');
  });

  it('应该能切换搜索词', async (testCtx) => {
    ctx = await WebTestContext.create('https://baidu.com', testCtx);
    await ctx.agent.aiAct('在搜索框中输入"Midscene"，然后点击百度一下');
    await ctx.page.waitForLoadState('networkidle');
    const title = await ctx.page.title();
    expect(title).toContain('Midscene');
  });

  it.skipIf(process.env.CI)('应该能搜索今天天气', async (testCtx) => {
    ctx = await WebTestContext.create('https://baidu.com', testCtx);
    await ctx.agent.aiAct('在搜索框中输入"今天天气"，然后点击百度一下');
    await ctx.page.waitForLoadState('networkidle');
    const title = await ctx.page.title();
    expect(title).toContain('今天天气');
  });

  it.skip('应该能打开百度首页', async (testCtx) => {
    ctx = await WebTestContext.create('https://baidu.com', testCtx);
    await ctx.page.waitForLoadState('networkidle');
    const title = await ctx.page.title();
    expect(title).toContain('百度');
  });
});
