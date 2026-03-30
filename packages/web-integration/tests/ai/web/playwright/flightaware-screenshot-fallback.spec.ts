import { PlaywrightWebPage } from '@/playwright';
import { expect, test } from '@playwright/test';

const FLIGHTAWARE_AEROAPI_URL =
  'https://www.flightaware.com/commercial/aeroapi/';

test.describe('playwright screenshot fallback regression', () => {
  test.setTimeout(120 * 1000);

  test.skip(
    !!process.env.CI,
    'This regression uses a third-party site that can be rate-limited in CI.',
  );

  test('should capture UI context on the FlightAware AeroAPI page', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(FLIGHTAWARE_AEROAPI_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page.waitForTimeout(2_000);

    const webPage = new PlaywrightWebPage(page);
    const screenshotBase64 = await webPage.screenshotBase64();

    expect(screenshotBase64).toContain('data:image/jpeg;base64,');
    expect(screenshotBase64.length).toBeGreaterThan(1_000);
    await expect(page.locator('body')).toContainText('AeroAPI');
  });
});
