import { join } from 'node:path';
import { PlaywrightWebPage } from '@/playwright';
import type { FocusedInputCapability } from '@/web-page';
import { type Page, expect, test } from '@playwright/test';

const fixtureUrl = `file://${join(
  __dirname,
  '../../fixtures/read-write-inputs.html',
)}`;

test.describe('focused input capability', () => {
  test('should detect native and editable input capabilities', async ({
    page,
  }) => {
    await page.goto(fixtureUrl);
    const webPage = new PlaywrightWebPage(page);

    await expectFocusedInputCapability(page, webPage, '#text-input', {
      kind: 'native-input',
      supportsClear: true,
      supportsCaret: true,
    });
    await expectFocusedInputCapability(page, webPage, '#textarea-input', {
      kind: 'native-textarea',
      supportsClear: true,
      supportsCaret: true,
    });
    await expectFocusedInputCapability(page, webPage, '#editable-div', {
      kind: 'contenteditable',
      supportsClear: true,
      supportsCaret: false,
    });
  });

  test('should detect non-clearable or non-input capabilities', async ({
    page,
  }) => {
    await page.goto(fixtureUrl);
    const webPage = new PlaywrightWebPage(page);

    await expectFocusedInputCapability(page, webPage, '#readonly-input', {
      kind: 'native-input',
      supportsClear: false,
      supportsCaret: true,
    });
    await expectFocusedInputCapability(page, webPage, '#checkbox-input', {
      kind: 'native-input',
      supportsClear: false,
      supportsCaret: true,
    });
    await expectFocusedInputCapability(page, webPage, '#button-like-input', {
      kind: 'non-input',
      supportsClear: false,
      supportsCaret: false,
    });
    await expectFocusedInputCapability(page, webPage, '#role-textbox-only', {
      kind: 'non-input',
      supportsClear: false,
      supportsCaret: false,
    });
    await expectFocusedInputCapability(page, webPage, '#fake-input', {
      kind: 'non-input',
      supportsClear: false,
      supportsCaret: false,
    });
  });

  test('should recurse into focused iframe input', async ({ page }) => {
    await page.goto(fixtureUrl);
    const webPage = new PlaywrightWebPage(page);
    const frame = page.frameLocator('#editable-iframe');

    await frame.locator('#iframe-text-input').click();

    await expect(webPage.getFocusedInputCapability()).resolves.toEqual({
      kind: 'native-input',
      supportsClear: true,
      supportsCaret: true,
    });
  });

  test('should mark focused shadow host as unknown shadow root', async ({
    page,
  }) => {
    await page.goto(fixtureUrl);
    const webPage = new PlaywrightWebPage(page);

    await page.locator('#shadow-host').click();

    await expect(webPage.getFocusedInputCapability()).resolves.toEqual({
      kind: 'unknown-shadow-root',
      supportsClear: 'unknown',
      supportsCaret: false,
    });
  });
});

async function expectFocusedInputCapability(
  page: Page,
  webPage: PlaywrightWebPage,
  selector: string,
  expected: FocusedInputCapability,
) {
  await page.locator(selector).click();
  await expect(webPage.getFocusedInputCapability()).resolves.toEqual(expected);
}
