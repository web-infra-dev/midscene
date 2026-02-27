import { PuppeteerAgent } from '@/puppeteer';
import { imageInfoOfBase64 } from '@midscene/shared/img';
import { describe, expect, it } from 'vitest';
import { launchPage } from './utils';

// A page with content tall/wide enough to trigger both scrollbars.
// Uses a classic (non-overlay) scrollbar style to ensure scrollbars occupy space.
const scrollablePageContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Viewport & Scroll Info</title>
    <style>
        body {
            margin: 0;
            min-height: 200vh;
            min-width: 200vw;
            overflow: scroll;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }

        ::-webkit-scrollbar {
            width: 15px;
            height: 15px;
        }

        ::-webkit-scrollbar-track {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 10px;
        }

        ::-webkit-scrollbar-thumb {
            background: linear-gradient(45deg, #ff6b6b, #ee5a6f);
            border-radius: 10px;
            border: 2px solid rgba(255, 255, 255, 0.2);
        }

        ::-webkit-scrollbar-thumb:hover {
            background: linear-gradient(45deg, #ee5a6f, #ff6b6b);
        }

        #info-panel {
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(255, 255, 255, 0.95);
            padding: 25px 30px;
            border-radius: 15px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
            font-family: 'Courier New', monospace;
            font-size: 16px;
            line-height: 2;
            backdrop-filter: blur(10px);
            border: 3px solid rgba(255, 255, 255, 0.3);
        }

        #info-panel h3 {
            text-align: center;
            margin: 0 0 15px 0;
            font-size: 20px;
            color: #333;
        }

        .info-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 5px;
        }

        .info-label {
            color: #333;
            font-weight: bold;
        }

        .info-value {
            color: #e74c3c;
            font-weight: bold;
            min-width: 80px;
            text-align: right;
            background: rgba(231, 76, 60, 0.1);
            padding: 0 8px;
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <div id="info-panel">
        <h3>Viewport & Scroll Info</h3>
        <div class="info-row">
            <span class="info-label">documentElement.clientWidth:</span>
            <span class="info-value" id="clientWidth">-</span>
        </div>
        <div class="info-row">
            <span class="info-label">documentElement.clientHeight:</span>
            <span class="info-value" id="clientHeight">-</span>
        </div>
        <div class="info-row">
            <span class="info-label">window.innerWidth:</span>
            <span class="info-value" id="innerWidth">-</span>
        </div>
        <div class="info-row">
            <span class="info-label">window.innerHeight:</span>
            <span class="info-value" id="innerHeight">-</span>
        </div>
    </div>

    <script>
        function updateInfo() {
            document.getElementById('clientWidth').textContent = document.documentElement.clientWidth;
            document.getElementById('clientHeight').textContent = document.documentElement.clientHeight;
            document.getElementById('innerWidth').textContent = window.innerWidth;
            document.getElementById('innerHeight').textContent = window.innerHeight;
        }

        setInterval(updateInfo, 100);
        updateInfo();
        window.addEventListener('resize', updateInfo);
    </script>
</body>
</html>
`;

describe('Page.size() with scrollbars', () => {
  it.each([1, 2])(
    'context size and screenshot dimensions should match the viewport (DPR=%d, with scrollbars)',
    async (deviceScaleFactor) => {
      const viewportWidth = 1200;
      const viewportHeight = 800;

      const { originPage, reset } = await launchPage('about:blank', {
        viewport: {
          width: viewportWidth,
          height: viewportHeight,
          deviceScaleFactor,
        },
        preference: {
          // playwright and puppeteer hides scrollbars by default in headless mode, which will cause there is never a scrollbar visible in headless mode.
          // see: https://stackoverflow.com/questions/54937671/chrome-headless-puppeteer-make-screenshot-render-scrollbar
          ignoreDefaultArgs: ['--hide-scrollbars'],
        },
      });
      await originPage.setContent(scrollablePageContent);

      const agent = new PuppeteerAgent(originPage, {});
      const context = await agent.getUIContext();

      // shotSize should match the actual screenshot dimensions (physical pixels)
      const physicalWidth = viewportWidth * deviceScaleFactor;
      const physicalHeight = viewportHeight * deviceScaleFactor;
      expect(
        context.shotSize.width,
        `shotSize.width should be ${physicalWidth} (viewport ${viewportWidth} * DPR ${deviceScaleFactor})`,
      ).toBe(physicalWidth);
      expect(
        context.shotSize.height,
        `shotSize.height should be ${physicalHeight} (viewport ${viewportHeight} * DPR ${deviceScaleFactor})`,
      ).toBe(physicalHeight);

      // The screenshot dimensions should match shotSize (physical pixels)
      const imgInfo = await imageInfoOfBase64(context.screenshot.base64);
      expect(
        imgInfo.width,
        `screenshot width should match shotSize.width (${physicalWidth}px)`,
      ).toBe(physicalWidth);
      expect(
        imgInfo.height,
        `screenshot height should match shotSize.height (${physicalHeight}px)`,
      ).toBe(physicalHeight);

      await agent.recordToReport('screenshot with scrollbars');

      // Verify that clientWidth and clientHeight are smaller than viewport by scrollbar width (15px)
      const clientDimensions = await agent.evaluateJavaScript(
        '(() => ({ width: document.documentElement.clientWidth, height: document.documentElement.clientHeight }))()',
      );
      expect(
        clientDimensions.width,
        `clientWidth should be ${viewportWidth - 15} (viewport ${viewportWidth} - scrollbar 15px)`,
      ).toBe(viewportWidth - 15);
      expect(
        clientDimensions.height,
        `clientHeight should be ${viewportHeight - 15} (viewport ${viewportHeight} - scrollbar 15px)`,
      ).toBe(viewportHeight - 15);

      await reset();
    },
  );
});
