import { WebPage as PlaywrightWebPage } from '@/playwright/page';
import { PuppeteerWebPage } from '@/puppeteer/page';
import { NodeType } from '@midscene/shared/constants';
import type { ElementInfo } from '@midscene/shared/extractor';
import { afterAll, beforeAll, describe, expect, test } from '@rstest/core';
import { type Browser as PlaywrightBrowser, chromium } from 'playwright';
import puppeteer, { type Browser as PuppeteerBrowser } from 'puppeteer';

const TEST_TIMEOUT_MS = 120_000;

function elementAt(center: [number, number]): ElementInfo {
  return {
    id: 'test-point',
    indexId: 0,
    nodeHashId: 'test-point',
    attributes: { nodeType: NodeType.POSITION },
    nodeType: NodeType.POSITION,
    content: '',
    rect: { left: center[0], top: center[1], width: 1, height: 1 },
    center,
    isVisible: true,
  };
}

const PAGE_HTML = `
  <!DOCTYPE html>
  <html>
    <body style="padding: 24px;">
      <input id="target" value="value to clear" style="width: 240px; padding: 8px;" />
    </body>
  </html>
`;

async function puppeteerInputCenter(page: any): Promise<[number, number]> {
  return page.$eval('#target', (el: HTMLInputElement) => {
    const rect = el.getBoundingClientRect();
    return [rect.left + rect.width / 2, rect.top + rect.height / 2];
  });
}

async function playwrightInputCenter(page: any): Promise<[number, number]> {
  return page.locator('#target').evaluate((el: HTMLInputElement) => {
    const rect = el.getBoundingClientRect();
    return [rect.left + rect.width / 2, rect.top + rect.height / 2];
  });
}

async function playwrightInputValue(page: any): Promise<string> {
  return page.locator('#target').evaluate((el: HTMLInputElement) => el.value);
}

async function playwrightBrowserUserAgent(page: any): Promise<string> {
  const client = await page.context().newCDPSession(page);
  try {
    const version = await client.send('Browser.getVersion');
    return version.userAgent;
  } finally {
    await client.detach().catch(() => undefined);
  }
}

const PAGE_SENTINEL = 'PAGE_SENTINEL_SHOULD_REMAIN';

const TRACKING_SCRIPT = `
  <script>
    window.__midsceneKeys = [];
    window.__midsceneSelectAllShortcuts = [];
    window.__midsceneSelectionSamples = [];
    document.addEventListener('keydown', (event) => {
      window.__midsceneKeys.push(event.key);
      const key = String(event.key || '').toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === 'a') {
        window.__midsceneSelectAllShortcuts.push(event.key);
      }
    }, true);
    document.addEventListener('selectionchange', () => {
      const selection = window.getSelection();
      window.__midsceneSelectionSamples.push(
        selection ? selection.toString() : '',
      );
    });
  </script>
`;

const FIELD_HTML = `
  <!DOCTYPE html>
  <html>
    <body style="margin:0;padding:24px;">
      <p id="page-text">${PAGE_SENTINEL}</p>
      <input id="target" value="value to clear" style="width:240px;height:32px;padding:0;" />
      <input id="other" value="other field" style="width:240px;height:32px;padding:0;" />
      ${TRACKING_SCRIPT}
    </body>
  </html>
`;

const WRAPPER_HTML = `
  <!DOCTYPE html>
  <html>
    <body style="margin:0;padding:24px;">
      <p id="page-text">${PAGE_SENTINEL}</p>
      <div id="wrapper" style="width:260px;height:48px;">
        <input id="target" value="value to clear" style="width:260px;height:48px;margin:0;padding:0;border:0;pointer-events:none;" />
      </div>
      <input id="other" value="other field" style="width:240px;height:32px;padding:0;" />
      ${TRACKING_SCRIPT}
    </body>
  </html>
`;

const STATIC_HTML = `
  <!DOCTYPE html>
  <html>
    <body style="margin:0;padding:24px;">
      <p id="page-text">${PAGE_SENTINEL}</p>
      <div id="static" style="width:220px;height:80px;">not editable</div>
      <input id="other" value="other field" style="width:240px;height:32px;padding:0;" />
      ${TRACKING_SCRIPT}
    </body>
  </html>
`;

const EDITOR_HTML = `
  <!DOCTYPE html>
  <html>
    <body style="margin:0;padding:24px;">
      <p id="page-text">${PAGE_SENTINEL}</p>
      <div id="editor" contenteditable="true" style="width:240px;min-height:40px;">editable text</div>
      <input id="other" value="other field" style="width:240px;height:32px;padding:0;" />
      ${TRACKING_SCRIPT}
    </body>
  </html>
`;

const SHADOW_HTML = `
  <!DOCTYPE html>
  <html>
    <body style="margin:0;padding:24px;">
      <p id="page-text">${PAGE_SENTINEL}</p>
      <div id="host" style="display:inline-block;"></div>
      <input id="other" value="other field" style="width:240px;height:32px;padding:0;" />
      <script>
        const host = document.getElementById('host');
        const root = host.attachShadow({ mode: 'open' });
        const wrap = document.createElement('div');
        wrap.style.cssText = 'width:240px;height:40px;';
        const input = document.createElement('input');
        input.id = 'target';
        input.value = 'shadow value';
        input.style.cssText = 'width:240px;height:40px;margin:0;padding:0;border:0;pointer-events:none;';
        wrap.appendChild(input);
        root.appendChild(wrap);
      </script>
      ${TRACKING_SCRIPT}
    </body>
  </html>
`;

async function elementCenter(
  page: any,
  selector: string,
): Promise<[number, number]> {
  return page.$eval(selector, (el: Element) => {
    const rect = el.getBoundingClientRect();
    return [rect.left + rect.width / 2, rect.top + rect.height / 2] as [
      number,
      number,
    ];
  });
}

async function readGuard(page: any) {
  return page.evaluate(() => {
    let active: Element | null = document.activeElement;
    while (active instanceof HTMLElement && active.shadowRoot?.activeElement) {
      active = active.shadowRoot.activeElement;
    }
    const shadowInput = document
      .getElementById('host')
      ?.shadowRoot?.querySelector('#target') as HTMLInputElement | null;
    const target = document.getElementById('target') as HTMLInputElement | null;
    const editor = document.getElementById('editor');
    return {
      pageText: document.getElementById('page-text')?.textContent ?? '',
      targetValue: target?.value ?? shadowInput?.value ?? '',
      editorText: editor?.textContent ?? '',
      otherValue:
        (document.getElementById('other') as HTMLInputElement | null)?.value ??
        '',
      keys: ((window as any).__midsceneKeys ?? []) as string[],
      shortcuts: ((window as any).__midsceneSelectAllShortcuts ??
        []) as string[],
      samples: ((window as any).__midsceneSelectionSamples ?? []) as string[],
      selection: window.getSelection()?.toString() ?? '',
      activeId: active instanceof HTMLElement ? active.id : '',
    };
  });
}

function expectPageTextUntouched(state: {
  pageText: string;
  otherValue: string;
  shortcuts: string[];
  samples: string[];
  selection: string;
}) {
  expect(state.pageText).toBe(PAGE_SENTINEL);
  expect(state.otherValue).toBe('other field');
  expect(state.shortcuts).toEqual([]);
  expect(state.selection.includes(PAGE_SENTINEL)).toBe(false);
  expect(state.samples.some((sample) => sample.includes(PAGE_SENTINEL))).toBe(
    false,
  );
}

function registerEditableFocusTests(
  openPage: () => Promise<any>,
  createWebPage: (
    page: any,
  ) => Pick<PuppeteerWebPage, 'clearInput' | 'selectAllInput'>,
) {
  function framedPage(
    kind: 'same-origin' | 'cross-origin' | 'nested' | 'scaled',
  ) {
    const frame = (content: string, crossOrigin: boolean, scaled = false) => {
      const source = crossOrigin
        ? `src="data:text/html,${encodeURIComponent(content)}"`
        : `srcdoc="${content.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`;
      return `<iframe style="display:block;width:600px;height:280px;border:12px solid black;transform-origin:top left;${scaled ? 'transform:scale(0.75);' : ''}" ${source}></iframe>`;
    };
    const content = FIELD_HTML.replace(
      '</body>',
      '<div id="static" onmousedown="event.preventDefault()" style="width:220px;height:60px;">not editable</div></body>',
    );
    const child =
      kind === 'nested'
        ? frame(frame(content, true), false)
        : frame(content, kind === 'cross-origin', kind === 'scaled');
    return FIELD_HTML.replace('</body>', `${child}</body>`);
  }

  async function frameTarget(page: any, selector = '#target') {
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue;
      const target = await frame.$(selector);
      if (!target) continue;
      let center = await elementCenter(frame, selector);
      // Puppeteer's boundingBox does not include an ancestor iframe's CSS
      // scale. Build the screenshot point from the fixture's frame geometry.
      for (
        let owner = frame;
        owner.parentFrame();
        owner = owner.parentFrame()
      ) {
        const handle = await owner.frameElement();
        try {
          const geometry = await handle.evaluate((element: HTMLElement) => {
            const rect = element.getBoundingClientRect();
            return {
              left: rect.left,
              top: rect.top,
              borderX: element.clientLeft,
              borderY: element.clientTop,
              scaleX: rect.width / element.offsetWidth,
              scaleY: rect.height / element.offsetHeight,
            };
          });
          center = [
            geometry.left + (geometry.borderX + center[0]) * geometry.scaleX,
            geometry.top + (geometry.borderY + center[1]) * geometry.scaleY,
          ];
        } finally {
          await handle.dispose();
        }
      }
      return {
        frame,
        center,
      };
    }
    throw new Error('Expected a frame containing the target');
  }

  for (const kind of [
    'same-origin',
    'cross-origin',
    'nested',
    'scaled',
  ] as const) {
    test.each(['clear', 'select', 'focused clear'] as const)(
      `%s works inside a ${kind} iframe without selecting parent-page text`,
      async (operation) => {
        const page = await openPage();
        try {
          await page.setContent(framedPage(kind));
          const { frame, center } = await frameTarget(page);
          const webPage = createWebPage(page);
          if (operation === 'select') {
            await webPage.selectAllInput(elementAt(center));
            const selected = await frame.$eval(
              '#target',
              (input: HTMLInputElement) => ({
                start: input.selectionStart,
                end: input.selectionEnd,
                value: input.value,
              }),
            );
            expect(selected.start).toBe(0);
            expect(selected.end).toBe(selected.value.length);
            expect(selected.value).toBe('value to clear');
          } else {
            if (operation === 'focused clear') {
              await frame.focus('#target');
              await webPage.clearInput();
            } else {
              await webPage.clearInput(elementAt(center));
            }
            expect((await readGuard(frame)).targetValue).toBe('');
          }
          const parentState = await readGuard(page);
          expect(parentState.targetValue).toBe('value to clear');
          expectPageTextUntouched(parentState);
          expectPageTextUntouched(await readGuard(frame));
        } finally {
          await page.close();
        }
      },
      TEST_TIMEOUT_MS,
    );
  }

  test.each(['same-origin', 'cross-origin'] as const)(
    'refuses a non-editable click inside a %s iframe even when its input keeps focus',
    async (kind) => {
      const page = await openPage();
      try {
        await page.setContent(framedPage(kind));
        const { frame, center } = await frameTarget(page, '#static');
        await frame.focus('#target');
        await expect(
          createWebPage(page).clearInput(elementAt(center)),
        ).rejects.toThrow(
          /no editable input, textarea, or contenteditable element/i,
        );
        const childState = await readGuard(frame);
        expect(childState.targetValue).toBe('value to clear');
        expect(childState.keys).not.toContain('Backspace');
        expectPageTextUntouched(childState);
        expectPageTextUntouched(await readGuard(page));
      } finally {
        await page.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test.each([
    { name: 'input', html: FIELD_HTML, selector: '#target' },
    { name: 'contenteditable', html: EDITOR_HTML, selector: '#editor' },
  ])(
    'refuses an inert $name whose focus method silently does nothing',
    async ({ html, selector }) => {
      const page = await openPage();
      try {
        await page.setContent(html);
        await page.$eval(selector, (element: HTMLElement) => {
          element.inert = true;
        });
        const center = await elementCenter(page, selector);
        await expect(
          createWebPage(page).clearInput(elementAt(center)),
        ).rejects.toThrow(
          /no editable input, textarea, or contenteditable element/i,
        );
        const state = await readGuard(page);
        expect(state.keys).not.toContain('Backspace');
        expectPageTextUntouched(state);
        if (selector === '#target') {
          expect(state.targetValue).toBe('value to clear');
        } else {
          expect(state.editorText).toBe('editable text');
        }
      } finally {
        await page.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    'clears only the focused input and leaves page text unselected',
    async () => {
      const page = await openPage();
      await page.setContent(FIELD_HTML);
      const webPage = createWebPage(page);
      const center = await elementCenter(page, '#target');

      await webPage.clearInput(elementAt(center));
      const state = await readGuard(page);
      await page.close();

      expect(state.targetValue).toBe('');
      expect(state.activeId).toBe('target');
      expect(state.keys).toContain('Backspace');
      expectPageTextUntouched(state);
    },
    TEST_TIMEOUT_MS,
  );

  test(
    'clears an input that is already focused',
    async () => {
      const page = await openPage();
      await page.setContent(FIELD_HTML);
      await page.focus('#target');
      const webPage = createWebPage(page);
      const center = await elementCenter(page, '#target');

      await webPage.clearInput(elementAt(center));
      const state = await readGuard(page);
      await page.close();

      expect(state.targetValue).toBe('');
      expect(state.activeId).toBe('target');
      expect(state.keys).toContain('Backspace');
      expectPageTextUntouched(state);
    },
    TEST_TIMEOUT_MS,
  );

  test(
    'focuses and clears the editable field under a non-editable wrapper',
    async () => {
      const page = await openPage();
      await page.setContent(WRAPPER_HTML);
      const webPage = createWebPage(page);
      const center = await elementCenter(page, '#wrapper');

      await webPage.clearInput(elementAt(center));
      const state = await readGuard(page);
      await page.close();

      expect(state.targetValue).toBe('');
      expect(state.activeId).toBe('target');
      expectPageTextUntouched(state);
    },
    TEST_TIMEOUT_MS,
  );

  test(
    'fails without page selectAll or Backspace when the click is not editable',
    async () => {
      const page = await openPage();
      await page.setContent(STATIC_HTML);
      const webPage = createWebPage(page);
      const center = await elementCenter(page, '#static');

      await expect(webPage.clearInput(elementAt(center))).rejects.toThrow(
        /no editable input, textarea, or contenteditable element/i,
      );
      const state = await readGuard(page);
      await page.close();

      expect(state.keys).not.toContain('Backspace');
      expectPageTextUntouched(state);
    },
    TEST_TIMEOUT_MS,
  );

  test(
    'does not fall back to page selectAll when selectAllInput misses an editable field',
    async () => {
      const page = await openPage();
      await page.setContent(STATIC_HTML);
      const webPage = createWebPage(page);
      const center = await elementCenter(page, '#static');

      await expect(webPage.selectAllInput(elementAt(center))).rejects.toThrow(
        /no editable input, textarea, or contenteditable element/i,
      );
      const state = await readGuard(page);
      await page.close();

      expect(state.keys).not.toContain('Backspace');
      expect(state.otherValue).toBe('other field');
      expectPageTextUntouched(state);
    },
    TEST_TIMEOUT_MS,
  );

  test(
    'selects only the focused input for bulk replace',
    async () => {
      const page = await openPage();
      await page.setContent(FIELD_HTML);
      const webPage = createWebPage(page);
      const center = await elementCenter(page, '#target');

      await webPage.selectAllInput(elementAt(center));
      const selected = await page.$eval('#target', (el: HTMLInputElement) => ({
        start: el.selectionStart,
        end: el.selectionEnd,
        value: el.value,
      }));
      const state = await readGuard(page);
      await page.close();

      expect(selected.value).toBe('value to clear');
      expect(selected.start).toBe(0);
      expect(selected.end).toBe(selected.value.length);
      expect(state.keys).not.toContain('Backspace');
      expectPageTextUntouched(state);
    },
    TEST_TIMEOUT_MS,
  );

  test(
    'clears a contenteditable field without selecting page text',
    async () => {
      const page = await openPage();
      await page.setContent(EDITOR_HTML);
      const webPage = createWebPage(page);
      const center = await elementCenter(page, '#editor');

      await webPage.clearInput(elementAt(center));
      const state = await readGuard(page);
      await page.close();

      expect(state.editorText).toBe('');
      expect(state.activeId).toBe('editor');
      expectPageTextUntouched(state);
    },
    TEST_TIMEOUT_MS,
  );

  test(
    'clears an editable field inside an open shadow root',
    async () => {
      const page = await openPage();
      await page.setContent(SHADOW_HTML);
      const webPage = createWebPage(page);
      const center = await elementCenter(page, '#host');

      await webPage.clearInput(elementAt(center));
      const state = await readGuard(page);
      await page.close();

      expect(state.targetValue).toBe('');
      expect(state.activeId).toBe('target');
      expectPageTextUntouched(state);
    },
    TEST_TIMEOUT_MS,
  );
}

describe('BasePage clearInput CDP selectAll', () => {
  describe('Puppeteer', () => {
    let browser: PuppeteerBrowser;

    beforeAll(async () => {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }, TEST_TIMEOUT_MS);

    afterAll(async () => {
      await browser?.close();
    }, TEST_TIMEOUT_MS);

    test(
      'clears the focused input',
      async () => {
        const page = await browser.newPage();
        await page.setContent(PAGE_HTML);

        const webPage = new PuppeteerWebPage(page);
        const center = await puppeteerInputCenter(page);

        await webPage.clearInput(elementAt(center));

        const value = await page.$eval(
          '#target',
          (el) => (el as HTMLInputElement).value,
        );
        await page.close();

        expect(value).toBe('');
      },
      TEST_TIMEOUT_MS,
    );

    registerEditableFocusTests(
      () => browser.newPage(),
      (page) => new PuppeteerWebPage(page),
    );
  });

  describe('Playwright', () => {
    let browser: PlaywrightBrowser;

    beforeAll(async () => {
      browser = await chromium.launch({
        headless: true,
        // CI installs Puppeteer's Chrome cache, but not Playwright's browser
        // bundle because dependencies are installed with --ignore-scripts.
        executablePath: puppeteer.executablePath(),
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }, TEST_TIMEOUT_MS);

    afterAll(async () => {
      await browser?.close();
    }, TEST_TIMEOUT_MS);

    test(
      'clears the focused input',
      async () => {
        const page = await browser.newPage();
        await page.setContent(PAGE_HTML);

        const webPage = new PlaywrightWebPage(page);
        const center = await playwrightInputCenter(page);

        await webPage.clearInput(elementAt(center));

        const value = await playwrightInputValue(page);
        await page.close();

        expect(value).toBe('');
      },
      TEST_TIMEOUT_MS,
    );

    describe('with spoofed browser-level user agent', () => {
      const linuxUserAgent =
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.7680.31 Safari/537.36';
      const macUserAgent =
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.7680.31 Safari/537.36';
      const spoofedUserAgent =
        process.platform === 'darwin' ? linuxUserAgent : macUserAgent;
      const spoofedUserAgentMarker =
        process.platform === 'darwin' ? 'X11; Linux x86_64' : 'Macintosh';
      const localSelectAllModifier =
        process.platform === 'darwin' ? 'Meta' : 'Control';

      let spoofedBrowser: PlaywrightBrowser;

      beforeAll(async () => {
        spoofedBrowser = await chromium.launch({
          headless: true,
          executablePath: puppeteer.executablePath(),
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            `--user-agent=${spoofedUserAgent}`,
          ],
        });
      }, TEST_TIMEOUT_MS);

      afterAll(async () => {
        await spoofedBrowser?.close();
      }, TEST_TIMEOUT_MS);

      test(
        'clears input with CDP selectAll when browser platform is changed by UA',
        async () => {
          const page = await spoofedBrowser.newPage();
          await page.setContent(PAGE_HTML);

          const browserUserAgent = await playwrightBrowserUserAgent(page);
          expect(browserUserAgent).toContain(spoofedUserAgentMarker);

          const webPage = new PlaywrightWebPage(page);
          const center = await playwrightInputCenter(page);

          await webPage.clearInput(elementAt(center));

          const value = await playwrightInputValue(page);
          await page.close();

          expect(value).toBe('');
        },
        TEST_TIMEOUT_MS,
      );

      test(
        'does not clear input with local-platform modifier+A when browser platform is changed by UA',
        async () => {
          const page = await spoofedBrowser.newPage();
          await page.setContent(PAGE_HTML);

          const browserUserAgent = await playwrightBrowserUserAgent(page);
          expect(browserUserAgent).toContain(spoofedUserAgentMarker);

          const center = await playwrightInputCenter(page);
          await page.mouse.click(center[0], center[1]);
          await page.keyboard.down(localSelectAllModifier);
          await page.keyboard.press('a');
          await page.keyboard.up(localSelectAllModifier);
          await page.keyboard.press('Backspace');

          const value = await playwrightInputValue(page);
          await page.close();

          expect(value).not.toBe('');
        },
        TEST_TIMEOUT_MS,
      );
    });

    registerEditableFocusTests(
      () => browser.newPage(),
      (page) => new PlaywrightWebPage(page),
    );
  });
});
