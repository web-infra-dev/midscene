/**
 * Remote Browser AI Online Order Test
 * Converted from playwright/ai-online-order.spec.ts
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { launchRemoteBrowser, logVncUrl } from './utils';

// Sleep utility
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Set longer timeout for AI tests
vi.setConfig({
  testTimeout: 600 * 1000, // 10 minutes
});

describe('ai online order', () => {
  let resetFn: (() => Promise<void>) | null = null;

  afterEach(async () => {
    if (resetFn) {
      await resetFn();
      resetFn = null;
    }
  });

  it('ai online order', async () => {
    const { agent, page, vncUrl, reset } = await launchRemoteBrowser({
      cacheId: 'remote-browser-ai-online-order',
    });
    resetFn = reset;
    logVncUrl(vncUrl);

    // Set mobile viewport (Puppeteer uses setViewport, not setViewportSize)
    await page.setViewport({ width: 400, height: 905 });

    // Navigate to Heytea online order page
    await page.goto('https://heyteavivocity.meuu.online/home');

    // Wait for page to load
    await sleep(3000);

    // Switch language to Chinese
    await agent.aiAction(
      '点击顶部语言切换按钮(英文、中文)，在弹出的下拉列表中点击中文',
    );

    // Scroll and wait
    await agent.aiAction('向下滚动一屏');
    await sleep(2000);

    // Tap product specification button with deep think
    await agent.aiTap('点击多肉葡萄的规格按钮', {
      deepThink: true,
    });

    // Select options
    await agent.aiAction('点击不使用吸管、点击冰沙推荐、点击正常冰推荐');
    await agent.aiAction('向下滚动一屏');
    await sleep(2000);

    // More option selections
    await agent.aiAction('点击标准甜、点击绿妍（推荐）,点击标准口味');
    await agent.aiAction('滚动到最下面');

    // Confirm selection
    await agent.aiAction('点击页面下边的"选好了"按钮');
    await sleep(2000);

    // Open shopping cart
    await agent.aiAction('点击屏幕右上角购物袋按钮');

    // Query cart details
    const cardDetail = await agent.aiQuery<{
      productName: string;
      productPrice: string;
      productDescription: string;
    }>({
      productName: '商品名称，在价格上面',
      productPrice: '商品价格， string',
      productDescription:
        '商品描述（饮品的各种参数，吸管、冰沙等），在价格下面',
    });

    // Log cart details
    console.log('商品订单详情：', {
      productName: cardDetail.productName,
      productPrice: cardDetail.productPrice,
      productDescription: cardDetail.productDescription,
    });

    // Verify order details
    expect(cardDetail.productName).toContain('多肉葡萄');
    expect(cardDetail.productDescription).toContain('绿妍');
  });
});
