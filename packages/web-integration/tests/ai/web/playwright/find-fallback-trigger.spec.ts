import { PlaywrightWebPage } from '@/playwright';
import { expect, test } from '@playwright/test';

/**
 * This test suite attempts to find real websites and conditions that cause
 * Playwright's page.screenshot() to fail, thereby triggering the CDP fallback
 * in PlaywrightWebPage.screenshotBase64().
 *
 * Run with:
 *   cd packages/web-integration && DEBUG='midscene:web:page*' npx playwright test tests/ai/web/playwright/find-fallback-trigger.spec.ts --reporter=list 2>&1
 */

test.describe('find websites that trigger screenshot fallback', () => {
  test.setTimeout(120_000);

  test.skip(
    !!process.env.CI,
    'These tests hit third-party sites and are not suitable for CI.',
  );

  // Helper: take screenshot and return result info
  async function tryScreenshot(
    page: import('@playwright/test').Page,
    label: string,
  ) {
    const webPage = new PlaywrightWebPage(page);
    const startTime = Date.now();
    try {
      const base64 = await webPage.screenshotBase64();
      const elapsed = Date.now() - startTime;
      console.log(
        `[${label}] Screenshot succeeded in ${elapsed}ms, length=${base64.length}`,
      );
      expect(base64).toContain('data:image/jpeg;base64,');
      expect(base64.length).toBeGreaterThan(100);
      return { success: true, elapsed, length: base64.length };
    } catch (error) {
      const elapsed = Date.now() - startTime;
      console.log(
        `[${label}] Screenshot FAILED in ${elapsed}ms: ${(error as Error).message}`,
      );
      return {
        success: false,
        elapsed,
        error: (error as Error).message,
      };
    }
  }

  // ── Test 1: FlightAware AeroAPI page (original problematic site) ──
  test('FlightAware AeroAPI page', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('https://www.flightaware.com/commercial/aeroapi/', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page.waitForTimeout(2_000);
    await tryScreenshot(page, 'FlightAware');
  });

  // ── Test 2: Race navigation with screenshot using page.goto ──
  // Start a new navigation via page.goto (which Playwright awaits) in parallel
  // with the screenshot. The navigation destroys the execution context.
  test('race page.goto navigation with screenshot', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('https://example.com', {
      waitUntil: 'load',
      timeout: 30_000,
    });
    await page.waitForTimeout(500);

    // Race: navigate away and screenshot simultaneously
    const results = await Promise.allSettled([
      page.goto('https://www.wikipedia.org/', { waitUntil: 'commit' }),
      tryScreenshot(page, 'RaceGoto'),
    ]);

    console.log(
      '[RaceGoto] navigation:',
      results[0].status,
      '| screenshot:',
      results[1].status,
    );
  });

  // ── Test 3: Trigger navigation via evaluate, then immediately screenshot ──
  test('evaluate location.replace then screenshot', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('https://example.com', {
      waitUntil: 'load',
      timeout: 30_000,
    });

    // Use Promise.allSettled to race navigation and screenshot
    const results = await Promise.allSettled([
      page.evaluate(() => {
        window.location.replace('https://www.google.com/');
      }),
      tryScreenshot(page, 'LocationReplace'),
    ]);

    console.log(
      '[LocationReplace] eval:',
      results[0].status,
      results[0].status === 'rejected'
        ? (results[0].reason as Error).message
        : '',
      '| screenshot:',
      results[1].status,
    );
  });

  // ── Test 4: Navigate with form submission (causes full page reload) ──
  test('form POST navigation during screenshot', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('https://example.com', {
      waitUntil: 'load',
      timeout: 30_000,
    });

    const results = await Promise.allSettled([
      page.evaluate(() => {
        const form = document.createElement('form');
        form.method = 'GET';
        form.action = 'https://httpbin.org/get';
        document.body.appendChild(form);
        form.submit();
      }),
      tryScreenshot(page, 'FormSubmit'),
    ]);

    console.log(
      '[FormSubmit] eval:',
      results[0].status,
      results[0].status === 'rejected'
        ? (results[0].reason as Error).message
        : '',
    );
  });

  // ── Test 5: Multiple rapid navigations via history + location ──
  test('rapid sequential navigations', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('https://example.com', {
      waitUntil: 'load',
      timeout: 30_000,
    });

    // Fire multiple navigations rapidly
    const results = await Promise.allSettled([
      page.evaluate(() => {
        window.location.href = 'https://httpbin.org/html';
      }),
      (async () => {
        // Tiny delay to let navigation start
        await new Promise((r) => setTimeout(r, 5));
        return tryScreenshot(page, 'RapidNav');
      })(),
    ]);

    console.log(
      '[RapidNav] eval:',
      results[0].status,
      results[0].status === 'rejected'
        ? (results[0].reason as Error).message
        : '',
    );
  });

  // ── Test 6: window.open + close original context ──
  test('window.stop during screenshot', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('https://www.flightaware.com/commercial/aeroapi/', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page.waitForTimeout(2_000);

    // Abort all pending loads and then take screenshot
    await page.evaluate(() => window.stop());
    await tryScreenshot(page, 'FlightAware+windowStop');
  });

  // ── Test 7: Inject web font that hangs (font loading blocks screenshot) ──
  test('inject hanging web font', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('https://example.com', {
      waitUntil: 'load',
      timeout: 30_000,
    });

    // Inject a @font-face that points to a very slow/nonexistent URL
    // Playwright screenshot waits for fonts to load
    await page.evaluate(() => {
      const style = document.createElement('style');
      style.textContent = `
        @font-face {
          font-family: 'HangingFont';
          src: url('https://httpbin.org/delay/30') format('woff2');
          font-display: block;
        }
        body {
          font-family: 'HangingFont', sans-serif !important;
        }
      `;
      document.head.appendChild(style);
      // Force layout
      document.body.offsetHeight;
    });

    await tryScreenshot(page, 'HangingFont');
  });

  // ── Test 8: Inject infinite requestAnimationFrame + CSS animations ──
  test('infinite animation storm + heavy DOM', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('https://example.com', {
      waitUntil: 'load',
      timeout: 30_000,
    });

    // Create a storm of CSS animations
    await page.evaluate(() => {
      const style = document.createElement('style');
      style.textContent = Array.from({ length: 100 }, (_, i) => `
        @keyframes spin${i} { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spinner-${i} { animation: spin${i} ${0.01 + i * 0.001}s linear infinite; width: 10px; height: 10px; background: red; position: absolute; top: ${i * 5}px; left: ${i * 5}px; }
      `).join('\n');
      document.head.appendChild(style);

      for (let i = 0; i < 100; i++) {
        const div = document.createElement('div');
        div.className = `spinner-${i}`;
        document.body.appendChild(div);
      }
    });

    await tryScreenshot(page, 'AnimationStorm');
  });

  // ── Test 9: page.goto to a slow-responding page while screenshotting ──
  test('navigate to slow page during screenshot', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('https://example.com', {
      waitUntil: 'load',
      timeout: 30_000,
    });

    // Navigate to a page that takes 10 seconds to respond - this should
    // leave the page in a "navigating" state during the screenshot
    const results = await Promise.allSettled([
      page.goto('https://httpbin.org/delay/10', {
        timeout: 30_000,
        waitUntil: 'commit',
      }),
      (async () => {
        // Small delay so navigation begins first
        await new Promise((r) => setTimeout(r, 100));
        return tryScreenshot(page, 'SlowPageNav');
      })(),
    ]);

    console.log(
      '[SlowPageNav] goto:',
      results[0].status,
      '| screenshot:',
      results[1].status,
    );
  });

  // ── Test 10: Cross-origin redirect chain ──
  test('cross-origin redirect during screenshot', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('https://example.com', {
      waitUntil: 'load',
      timeout: 30_000,
    });

    // Navigate to a URL that does a redirect chain
    const results = await Promise.allSettled([
      page.evaluate(() => {
        window.location.href =
          'https://httpbin.org/redirect-to?url=https%3A%2F%2Fexample.org&status_code=302';
      }),
      (async () => {
        await new Promise((r) => setTimeout(r, 10));
        return tryScreenshot(page, 'RedirectChain');
      })(),
    ]);

    console.log(
      '[RedirectChain] eval:',
      results[0].status,
      results[0].status === 'rejected'
        ? (results[0].reason as Error).message
        : '',
    );
  });

  // ── Test 11: document.write to destroy DOM ──
  test('document.write during screenshot', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('https://example.com', {
      waitUntil: 'load',
      timeout: 30_000,
    });

    const results = await Promise.allSettled([
      page.evaluate(() => {
        document.open();
        document.write('<html><body>replaced</body></html>');
        document.close();
      }),
      tryScreenshot(page, 'DocumentWrite'),
    ]);

    console.log(
      '[DocumentWrite] eval:',
      results[0].status,
      results[0].status === 'rejected'
        ? (results[0].reason as Error).message
        : '',
    );
  });

  // ── Test 12: Navigate away with window.location in a tight loop ──
  test('location assign in tight loop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('https://example.com', {
      waitUntil: 'load',
      timeout: 30_000,
    });

    // Set up a meta refresh + JS redirect
    const results = await Promise.allSettled([
      page.evaluate(() => {
        // Create a meta refresh
        const meta = document.createElement('meta');
        meta.httpEquiv = 'refresh';
        meta.content = '0;url=https://httpbin.org/html';
        document.head.appendChild(meta);
        // Also do JS navigation
        window.location.assign('https://httpbin.org/get');
      }),
      (async () => {
        await new Promise((r) => setTimeout(r, 2));
        return tryScreenshot(page, 'MetaRefresh+JSNav');
      })(),
    ]);

    console.log(
      '[MetaRefresh+JSNav] eval:',
      results[0].status,
      results[0].status === 'rejected'
        ? (results[0].reason as Error).message
        : '',
    );
  });
});
