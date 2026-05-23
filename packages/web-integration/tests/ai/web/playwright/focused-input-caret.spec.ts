import { join } from 'node:path';
import { PlaywrightWebPage } from '@/playwright';
import { expect, test } from '@playwright/test';

const fixtureUrl = `file://${join(
  __dirname,
  '../../fixtures/read-write-inputs.html',
)}`;

test.describe('focused input caret', () => {
  test('should move native input caret to start and end', async ({ page }) => {
    await page.goto(fixtureUrl);
    const webPage = new PlaywrightWebPage(page);

    await page.locator('#text-input').click();
    await webPage.setFocusedInputCaret('start');
    await expect(page.locator('#text-input')).toHaveJSProperty(
      'selectionStart',
      0,
    );
    await expect(page.locator('#text-input')).toHaveJSProperty(
      'selectionEnd',
      0,
    );

    await webPage.setFocusedInputCaret('end');
    await expect(page.locator('#text-input')).toHaveJSProperty(
      'selectionStart',
      'text value'.length,
    );
    await expect(page.locator('#text-input')).toHaveJSProperty(
      'selectionEnd',
      'text value'.length,
    );
  });

  test('should move textarea caret to start and end', async ({ page }) => {
    await page.goto(fixtureUrl);
    const webPage = new PlaywrightWebPage(page);

    await page.locator('#textarea-input').click();
    await webPage.setFocusedInputCaret('start');
    await expect(page.locator('#textarea-input')).toHaveJSProperty(
      'selectionStart',
      0,
    );
    await expect(page.locator('#textarea-input')).toHaveJSProperty(
      'selectionEnd',
      0,
    );

    await webPage.setFocusedInputCaret('end');
    await expect(page.locator('#textarea-input')).toHaveJSProperty(
      'selectionStart',
      'textarea value'.length,
    );
    await expect(page.locator('#textarea-input')).toHaveJSProperty(
      'selectionEnd',
      'textarea value'.length,
    );
  });

  test('should move caret inside focused iframe input', async ({ page }) => {
    await page.goto(fixtureUrl);
    const webPage = new PlaywrightWebPage(page);
    const frame = page.frameLocator('#editable-iframe');
    const input = frame.locator('#iframe-text-input');

    await input.click();
    await webPage.setFocusedInputCaret('start');
    await expect(input).toHaveJSProperty('selectionStart', 0);
    await expect(input).toHaveJSProperty('selectionEnd', 0);

    await webPage.setFocusedInputCaret('end');
    await expect(input).toHaveJSProperty(
      'selectionStart',
      'iframe text value'.length,
    );
    await expect(input).toHaveJSProperty(
      'selectionEnd',
      'iframe text value'.length,
    );
  });

  test('should not throw when focused element does not support caret movement', async ({
    page,
  }) => {
    await page.goto(fixtureUrl);
    const webPage = new PlaywrightWebPage(page);

    await page.locator('#editable-div').click();
    await expect(webPage.setFocusedInputCaret('end')).resolves.toBeUndefined();

    await page.locator('#fake-input').click();
    await expect(webPage.setFocusedInputCaret('end')).resolves.toBeUndefined();

    await page.locator('#shadow-host').click();
    await expect(webPage.setFocusedInputCaret('end')).resolves.toBeUndefined();
  });
});
