import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TEST_TIMEOUT,
  createTestContext,
  getFixturePath,
} from './test-utils';
import { launchPage } from './utils';

describe(
  'Browser pinch zoom click coordinates (Web)',
  () => {
    const ctx = createTestContext();

    it('clicks correctly with zoomed viewport coordinates without remapping', async () => {
      const htmlPath = getFixturePath('pinch-browser-zoom-click.html');
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

      await originPage.waitForFunction(
        () => {
          const target = document.getElementById('target');
          if (!target) return false;
          const rect = target.getBoundingClientRect();
          return rect.top >= 0 && rect.bottom <= window.innerHeight;
        },
        { timeout: 10_000 },
      );

      const before = await originPage.evaluate(() => ({
        scale: window.visualViewport?.scale ?? 1,
      }));
      expect(before.scale).toBe(1);

      const beforeZoomRect = await originPage.evaluate(() => {
        const target = document.getElementById('target');
        if (!(target instanceof HTMLElement)) {
          throw new Error('target not found');
        }
        const rect = target.getBoundingClientRect();
        return {
          centerX: rect.left + rect.width / 2,
          centerY: rect.top + rect.height / 2,
        };
      });

      await originPage.mouse.click(
        beforeZoomRect.centerX,
        beforeZoomRect.centerY,
      );

      const preZoomEvents = await originPage.evaluate(() => window.__eventLog);
      expect(preZoomEvents.some((event) => event.type === 'click')).toBe(true);

      await originPage.evaluate(() => {
        window.__eventLog = [];
      });

      const viewportSize = await page.size();
      await page.pinch(
        Math.round(viewportSize.width / 2),
        Math.round(viewportSize.height / 2),
        120,
        300,
        600,
      );

      await originPage.waitForFunction(
        () => (window.visualViewport?.scale ?? 1) > 1.05,
        { timeout: 10_000 },
      );

      const zoomed = await originPage.evaluate(() => {
        const target = document.getElementById('target');
        if (!(target instanceof HTMLElement)) {
          throw new Error('target not found');
        }
        const rect = target.getBoundingClientRect();
        return {
          rect: {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            centerX: rect.left + rect.width / 2,
            centerY: rect.top + rect.height / 2,
          },
          viewport: {
            scale: window.visualViewport?.scale ?? 1,
            offsetLeft: window.visualViewport?.offsetLeft ?? 0,
            offsetTop: window.visualViewport?.offsetTop ?? 0,
          },
        };
      });

      expect(zoomed.viewport.scale).toBeGreaterThan(1.05);

      const remappedX =
        zoomed.viewport.offsetLeft +
        zoomed.rect.centerX / zoomed.viewport.scale;
      const remappedY =
        zoomed.viewport.offsetTop + zoomed.rect.centerY / zoomed.viewport.scale;

      const hitTest = await originPage.evaluate(
        ({ directX, directY, remappedX, remappedY }) => ({
          directHit: document.elementFromPoint(directX, directY)?.id ?? null,
          remappedHit:
            document.elementFromPoint(remappedX, remappedY)?.id ?? null,
        }),
        {
          directX: zoomed.rect.centerX,
          directY: zoomed.rect.centerY,
          remappedX,
          remappedY,
        },
      );

      expect(hitTest.directHit).toBe('target');
      expect(hitTest.remappedHit).toBe('target');
    });
  },
  DEFAULT_TEST_TIMEOUT,
);
