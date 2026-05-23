import { join } from 'node:path';
import { PlaywrightWebPage } from '@/playwright';
import type { ElementInfo } from '@midscene/shared/extractor';
import { type Page, expect, test } from '@playwright/test';

const fixtureUrl = `file://${join(
  __dirname,
  '../../fixtures/read-write-inputs.html',
)}`;

test.describe('clearInput read-write guard', () => {
  test(':read-write should only match editable text targets', async ({
    page,
  }) => {
    await page.goto(fixtureUrl);

    const readWriteIds = await page.evaluate<string[]>(
      `Array.from(document.querySelectorAll('*:read-write'))
        .map((element) => element.id)
        .filter(Boolean)
        .sort()`,
    );

    expect(readWriteIds).toEqual([
      'editable-div',
      'editable-paragraph',
      'text-input',
      'textarea-input',
    ]);

    const iframe = await page.locator('#editable-iframe').elementHandle();
    const frame = await iframe?.contentFrame();
    if (!frame) {
      throw new Error('Failed to resolve editable iframe');
    }

    const iframeReadWriteIds = await frame.evaluate<string[]>(
      `Array.from(document.querySelectorAll('*:read-write'))
        .map((element) => element.id)
        .filter(Boolean)
        .sort()`,
    );

    expect(iframeReadWriteIds).toEqual([
      'iframe-editable-div',
      'iframe-text-input',
    ]);
  });

  test('clearInput should clear read-write elements', async ({ page }) => {
    await page.goto(fixtureUrl);
    const webPage = new PlaywrightWebPage(page);

    await webPage.clearInput(await getElementInfo(page, '#text-input'));
    await webPage.clearInput(await getElementInfo(page, '#editable-div'));

    await expect(page.locator('#text-input')).toHaveValue('');
    await expect(page.locator('#editable-div')).toHaveText('');
  });

  test('clearInput should skip non-read-write elements', async ({ page }) => {
    await page.goto(fixtureUrl);
    const webPage = new PlaywrightWebPage(page);

    await webPage.clearInput(await getElementInfo(page, '#button-like-input'));
    await webPage.clearInput(await getElementInfo(page, '#role-textbox-only'));
    await webPage.clearInput(await getElementInfo(page, '#fake-input'));

    const probe = await page.evaluate<{ backspaceCount: number }>(
      'window.clearInputProbe',
    );
    expect(probe.backspaceCount).toBe(0);
    await expect(page.locator('#button-like-input')).toHaveText('button text');
    await expect(page.locator('#role-textbox-only')).toHaveText(
      'role textbox without contenteditable',
    );
    await expect(page.locator('#fake-input')).toHaveText(
      'visually input-like but not editable',
    );
  });
});

async function getElementInfo(
  page: Page,
  selector: string,
): Promise<ElementInfo> {
  const box = await page.locator(selector).boundingBox();
  if (!box) {
    throw new Error(`Element is not visible: ${selector}`);
  }

  return {
    center: [box.x + box.width / 2, box.y + box.height / 2],
  } as ElementInfo;
}
