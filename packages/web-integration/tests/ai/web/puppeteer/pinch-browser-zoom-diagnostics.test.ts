import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TEST_TIMEOUT,
  createTestContext,
  getFixturePath,
} from './test-utils';
import { launchPage } from './utils';

describe(
  'Browser pinch zoom diagnostics (Web)',
  () => {
    const ctx = createTestContext();

    it('records viewport drift when pinching around the target center', async () => {
      const htmlPath = getFixturePath('pinch-browser-zoom-integer-target.html');
      const { page, originPage, reset } = await launchPage(
        `file://${htmlPath}`,
        {
          viewport: {
            width: 390,
            height: 844,
            isMobile: true,
            hasTouch: true,
            deviceScaleFactor: 2,
          },
        },
      );
      ctx.resetFn = reset;

      await originPage.waitForFunction(
        () => document.readyState === 'complete',
        { timeout: 10_000 },
      );

      await originPage.waitForFunction(() => {
        const target = document.getElementById('target');
        if (!target) return false;
        const rect = target.getBoundingClientRect();
        return rect.left === 80 && rect.top === 180;
      });

      const beforeZoom = await originPage.evaluate(() => {
        const target = document.getElementById('target');
        if (!(target instanceof HTMLElement)) {
          throw new Error('target not found');
        }
        const rect = target.getBoundingClientRect();
        return {
          centerX: rect.left + rect.width / 2,
          centerY: rect.top + rect.height / 2,
          rect: {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          },
          viewport: {
            scale: window.visualViewport?.scale ?? 1,
            offsetLeft: window.visualViewport?.offsetLeft ?? 0,
            offsetTop: window.visualViewport?.offsetTop ?? 0,
            pageLeft: window.visualViewport?.pageLeft ?? window.scrollX,
            pageTop: window.visualViewport?.pageTop ?? window.scrollY,
            width: window.visualViewport?.width ?? window.innerWidth,
            height: window.visualViewport?.height ?? window.innerHeight,
          },
        };
      });

      const pinchInput = {
        centerX: Math.round(beforeZoom.centerX),
        centerY: Math.round(beforeZoom.centerY),
        startDistance: 120,
        endDistance: 300,
        duration: 600,
      };

      await page.pinch(
        pinchInput.centerX,
        pinchInput.centerY,
        pinchInput.startDistance,
        pinchInput.endDistance,
        pinchInput.duration,
      );

      await originPage.waitForFunction(
        () => (window.visualViewport?.scale ?? 1) > 1.05,
        { timeout: 10_000 },
      );

      const afterZoom = await originPage.evaluate(() => {
        const target = document.getElementById('target');
        if (!(target instanceof HTMLElement)) {
          throw new Error('target not found');
        }
        const rect = target.getBoundingClientRect();
        return {
          centerX: rect.left + rect.width / 2,
          centerY: rect.top + rect.height / 2,
          rect: {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          },
          viewport: {
            scale: window.visualViewport?.scale ?? 1,
            offsetLeft: window.visualViewport?.offsetLeft ?? 0,
            offsetTop: window.visualViewport?.offsetTop ?? 0,
            pageLeft: window.visualViewport?.pageLeft ?? window.scrollX,
            pageTop: window.visualViewport?.pageTop ?? window.scrollY,
            width: window.visualViewport?.width ?? window.innerWidth,
            height: window.visualViewport?.height ?? window.innerHeight,
          },
        };
      });

      const diagnostics = {
        pinchInput,
        beforeZoom,
        afterZoom,
        drift: {
          deltaX: Number((afterZoom.centerX - beforeZoom.centerX).toFixed(2)),
          deltaY: Number((afterZoom.centerY - beforeZoom.centerY).toFixed(2)),
        },
      };

      console.log(JSON.stringify(diagnostics, null, 2));

      expect(afterZoom.viewport.scale).toBeGreaterThan(1.05);
    });
  },
  DEFAULT_TEST_TIMEOUT,
);
