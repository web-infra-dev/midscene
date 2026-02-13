import { PuppeteerAgent } from '@/puppeteer';
import { imageInfoOfBase64 } from '@midscene/shared/img';
import { describe, expect, it } from 'vitest';
import { launchPage } from './utils';

// A page with content tall/wide enough to trigger both scrollbars.
// Uses a classic (non-overlay) scrollbar style to ensure scrollbars occupy space.
const scrollablePageContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Scrollbar Size Test</title>
  <style>
    /* Force classic (non-overlay) scrollbars so they take up layout space */
    ::-webkit-scrollbar { width: 15px; height: 15px; }
    ::-webkit-scrollbar-track { background: #f0f0f0; }
    ::-webkit-scrollbar-thumb { background: #888; border-radius: 4px; }
    body { margin: 0; }
  </style>
</head>
<body>
  <!-- Oversized content to force both vertical and horizontal scrollbars -->
  <div style="width: 3000px; height: 3000px; background: linear-gradient(135deg, #ff0000, #0000ff);">
    Scrollable content
  </div>
</body>
</html>
`;

describe('Page.size() with scrollbars', () => {
  it('context size and screenshot dimensions should match the viewport (DPR=1, with scrollbars)', async () => {
    const viewportWidth = 800;
    const viewportHeight = 600;

    const { originPage, reset } = await launchPage('about:blank', {
      viewport: {
        width: viewportWidth,
        height: viewportHeight,
        deviceScaleFactor: 1,
      },
    });
    await originPage.setContent(scrollablePageContent);

    const agent = new PuppeteerAgent(originPage, {});
    const context = await agent.getUIContext();

    // context.size should equal the viewport logical dimensions,
    // regardless of scrollbar presence
    expect(context.size.width).toBe(viewportWidth);
    expect(context.size.height).toBe(viewportHeight);

    // The screenshot (after agent processing) should be resized to match the logical viewport
    const imgInfo = await imageInfoOfBase64(context.screenshot.base64);
    expect(imgInfo.width).toBe(viewportWidth);
    expect(imgInfo.height).toBe(viewportHeight);

    await reset();
  });

  it('context size and screenshot dimensions should match the viewport (DPR=2, with scrollbars)', async () => {
    const viewportWidth = 400;
    const viewportHeight = 300;

    const { originPage, reset } = await launchPage('about:blank', {
      viewport: {
        width: viewportWidth,
        height: viewportHeight,
        deviceScaleFactor: 2,
      },
    });
    await originPage.setContent(scrollablePageContent);

    const agent = new PuppeteerAgent(originPage, {});
    const context = await agent.getUIContext();

    // context.size should be logical pixels, not physical
    expect(context.size.width).toBe(viewportWidth);
    expect(context.size.height).toBe(viewportHeight);

    // The screenshot should be resized from physical (800x600) to logical (400x300)
    const imgInfo = await imageInfoOfBase64(context.screenshot.base64);
    expect(imgInfo.width).toBe(viewportWidth);
    expect(imgInfo.height).toBe(viewportHeight);

    await reset();
  });
});
