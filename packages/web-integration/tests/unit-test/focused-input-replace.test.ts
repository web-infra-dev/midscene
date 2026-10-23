import { WebPage as PlaywrightWebPage } from '@/playwright/page';
import { PuppeteerWebPage } from '@/puppeteer/page';
import { afterAll, beforeAll, describe, expect, test } from '@rstest/core';
import { type Browser as PlaywrightBrowser, chromium } from 'playwright';
import puppeteer, { type Browser as PuppeteerBrowser } from 'puppeteer';

const TIMEOUT = 120_000;

function setupField(kind: string) {
  const field = document.createElement(
    kind === 'textarea'
      ? 'textarea'
      : kind === 'contenteditable'
        ? 'div'
        : 'input',
  );
  if (
    field instanceof HTMLInputElement ||
    field instanceof HTMLTextAreaElement
  ) {
    field.value = 'old value';
    field.readOnly = kind === 'readonly';
  } else {
    field.contentEditable = 'true';
    field.textContent = 'old value';
  }
  const root =
    kind === 'shadow'
      ? document.body
          .appendChild(document.createElement('div'))
          .attachShadow({ mode: 'open' })
      : document.body;
  root.appendChild(field);
  (window as any).field = field;
  (window as any).changes = [];
  (window as any).enterCount = 0;
  field.addEventListener('input', () =>
    (window as any).changes.push(
      field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement
        ? field.value
        : field.textContent,
    ),
  );
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') (window as any).enterCount++;
  });
  field.focus();
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)
    field.setSelectionRange(field.value.length, field.value.length);
  else {
    const range = document.createRange();
    range.selectNodeContents(field);
    range.collapse(false);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
  }
}

function readField() {
  const field = (window as any).field;
  return {
    value: field.value ?? field.textContent,
    changes: (window as any).changes,
    enterCount: (window as any).enterCount,
    other: (document.querySelector('#other') as HTMLInputElement).value,
    pageText: document.querySelector('p')!.textContent,
  };
}

for (const adapter of ['Playwright', 'Puppeteer'] as const) {
  describe(`${adapter} focused Input replacement`, () => {
    let browser: PlaywrightBrowser | PuppeteerBrowser;

    beforeAll(async () => {
      const options = {
        headless: true,
        executablePath: puppeteer.executablePath(),
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      };
      browser =
        adapter === 'Playwright'
          ? await chromium.launch(options)
          : await puppeteer.launch(options);
    }, TIMEOUT);

    afterAll(async () => {
      await browser?.close();
    }, TIMEOUT);

    for (const strategy of ['bulk', 'legacy', 'sequential'] as const) {
      test.each(['input', 'textarea', 'shadow', 'contenteditable'])(
        `replaces the focused %s with ${strategy} without locate`,
        async (kind) => {
          const page = await browser.newPage();
          try {
            await page.setContent(
              '<p>page text</p><input id="other" value="unchanged">',
            );
            await page.evaluate(setupField, kind);
            const webPage =
              adapter === 'Playwright'
                ? new PlaywrightWebPage(page as any)
                : new PuppeteerWebPage(page as any);
            await webPage
              .actionSpace()
              .find((action) => action.name === 'Input')!
              .call(
                { value: 'new value', inputStrategy: strategy } as any,
                {} as any,
              );
            const state = await page.evaluate(readField);
            expect(state.value).toBe('new value');
            expect(state.changes).not.toContain('');
            if (strategy === 'bulk')
              expect(state.changes).toEqual(['new value']);
            expect(state.other).toBe('unchanged');
            expect(state.pageText).toBe('page text');
            expect(state.enterCount).toBe(0);
          } finally {
            await page.close();
          }
        },
        TIMEOUT,
      );
    }

    test.each(['same-origin', 'cross-origin'])(
      'replaces a focused input inside a %s iframe',
      async (kind) => {
        const page = await browser.newPage();
        try {
          const html = '<p>page text</p><input id="other" value="unchanged">';
          const source =
            kind === 'same-origin'
              ? `srcdoc='${html}'`
              : `src="data:text/html,${encodeURIComponent(html)}"`;
          await page.setContent(
            `<p>parent text</p><input id="parent" value="unchanged"><iframe ${source}></iframe>`,
          );
          const frame = page
            .frames()
            .find((candidate) => candidate !== page.mainFrame())!;
          await frame.waitForSelector('#other');
          await frame.evaluate(setupField, 'input');
          const webPage =
            adapter === 'Playwright'
              ? new PlaywrightWebPage(page as any)
              : new PuppeteerWebPage(page as any);
          await webPage
            .actionSpace()
            .find((action) => action.name === 'Input')!
            .call(
              {
                value: 'new value',
                mode: 'replace',
                inputStrategy: 'bulk',
              } as any,
              {} as any,
            );
          expect(await frame.evaluate(readField)).toEqual({
            value: 'new value',
            changes: ['new value'],
            enterCount: 0,
            other: 'unchanged',
            pageText: 'page text',
          });
          expect(
            await page.$eval(
              '#parent',
              (element) => (element as HTMLInputElement).value,
            ),
          ).toBe('unchanged');
        } finally {
          await page.close();
        }
      },
      TIMEOUT,
    );

    test(
      'preserves a partial selection for typeOnly input',
      async () => {
        const page = await browser.newPage();
        try {
          await page.setContent(
            '<p>page text</p><input id="other" value="unchanged">',
          );
          await page.evaluate(setupField, 'input');
          await page.evaluate(() =>
            (window as any).field.setSelectionRange(0, 3),
          );
          const webPage =
            adapter === 'Playwright'
              ? new PlaywrightWebPage(page as any)
              : new PuppeteerWebPage(page as any);
          await webPage
            .actionSpace()
            .find((action) => action.name === 'Input')!
            .call(
              { value: 'new', mode: 'typeOnly', inputStrategy: 'bulk' } as any,
              {} as any,
            );
          expect((await page.evaluate(readField)).value).toBe('new value');
        } finally {
          await page.close();
        }
      },
      TIMEOUT,
    );

    test(
      'refuses targetless replacement when no editable field is focused',
      async () => {
        const page = await browser.newPage();
        try {
          await page.setContent(
            '<p>page text</p><input id="other" value="unchanged">',
          );
          const webPage =
            adapter === 'Playwright'
              ? new PlaywrightWebPage(page as any)
              : new PuppeteerWebPage(page as any);
          await expect(
            webPage
              .actionSpace()
              .find((action) => action.name === 'Input')!
              .call(
                {
                  value: 'new value',
                  mode: 'replace',
                  inputStrategy: 'bulk',
                } as any,
                {} as any,
              ),
          ).rejects.toThrow(/focused editable/i);
          expect(await page.$eval('p', (element) => element.textContent)).toBe(
            'page text',
          );
          expect(
            await page.$eval(
              '#other',
              (element) => (element as HTMLInputElement).value,
            ),
          ).toBe('unchanged');
        } finally {
          await page.close();
        }
      },
      TIMEOUT,
    );
  });
}
