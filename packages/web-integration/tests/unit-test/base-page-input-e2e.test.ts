import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebPage as PlaywrightWebPage } from '@/playwright/page';
import { PlaywrightAgent } from '@/playwright/page-agent';
import { PuppeteerWebPage } from '@/puppeteer/page';
import { PuppeteerAgent } from '@/puppeteer/page-agent';
import { createWebInputPrimitives } from '@/web-page';
import type { ElementInfo } from '@midscene/shared/extractor';
import {
  type Browser as PlaywrightBrowser,
  type Frame as PlaywrightFrame,
  type Page as PlaywrightPage,
  chromium,
} from 'playwright';
import puppeteer, {
  type Browser as PuppeteerBrowser,
  type Frame as PuppeteerFrame,
  type Page as PuppeteerPage,
} from 'puppeteer';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const TEST_TIMEOUT_MS = 120_000;
const MODIFIER = process.platform === 'darwin' ? 'Cmd' : 'Ctrl';

const TOP_LEVEL_INPUT_HTML = `
  <!doctype html>
  <html>
    <body style="padding: 24px">
      <input id="first" value="first value" style="display: block; width: 240px; margin: 16px; padding: 8px" />
      <input id="second" value="second value" style="display: block; width: 240px; margin: 16px; padding: 8px" />
      <textarea id="notes" style="display: block; width: 240px; height: 80px; margin: 16px; padding: 8px">line one\nline two</textarea>
      <script>
        window.__midsceneEditingEvents = [];
        document.addEventListener('copy', () => window.__midsceneEditingEvents.push('copy'));
        document.addEventListener('cut', () => window.__midsceneEditingEvents.push('cut'));
      </script>
    </body>
  </html>
`;

const IFRAME_INPUT_HTML = `
  <!doctype html>
  <html>
    <body style="padding: 20px">
      <input id="first" value="frame first" style="display: block; width: 220px; margin: 16px; padding: 8px" />
      <input id="second" value="frame second" style="display: block; width: 220px; margin: 16px; padding: 8px" />
      <script>
        window.__midsceneEditingEvents = [];
        document.addEventListener('copy', () => window.__midsceneEditingEvents.push('copy'));
        document.addEventListener('cut', () => window.__midsceneEditingEvents.push('cut'));
      </script>
    </body>
  </html>
`;

type EditingState = {
  activeElementId: string;
  events: string[];
  firstSelection: [number | null, number | null];
  firstValue: string;
  secondValue: string;
};

type IframeMode = 'same-origin' | 'cross-origin';

type EditingServers = {
  close(): Promise<void>;
  iframePageUrl(mode: IframeMode): string;
};

function centerOfBox(box: {
  x: number;
  y: number;
  width: number;
  height: number;
}): [number, number] {
  return [box.x + box.width / 2, box.y + box.height / 2];
}

function targetAt(center: [number, number]): ElementInfo {
  return { center } as ElementInfo;
}

function listen(server: Server): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      const address = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function startEditingServers(): Promise<EditingServers> {
  const crossOriginServer = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(IFRAME_INPUT_HTML);
  });
  const crossOrigin = await listen(crossOriginServer);

  const parentServer = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (requestUrl.pathname === '/iframe-input') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(IFRAME_INPUT_HTML);
      return;
    }

    const mode = requestUrl.searchParams.get('mode');
    const iframeSource =
      mode === 'cross-origin' ? `${crossOrigin}/iframe-input` : '/iframe-input';
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`
      <!doctype html>
      <html>
        <body style="padding: 24px">
          <input id="outside" value="outside value" />
          <iframe id="editor-frame" src="${iframeSource}" style="display: block; width: 420px; height: 260px; margin-top: 20px"></iframe>
        </body>
      </html>
    `);
  });
  const parentOrigin = await listen(parentServer);

  return {
    iframePageUrl: (mode) => `${parentOrigin}/?mode=${mode}`,
    close: async () => {
      await Promise.all([
        closeServer(parentServer),
        closeServer(crossOriginServer),
      ]);
    },
  };
}

async function puppeteerElementCenter(
  frame: PuppeteerFrame,
  selector: string,
): Promise<[number, number]> {
  const handle = await frame.$(selector);
  if (!handle) throw new Error(`Missing Puppeteer element: ${selector}`);
  const box = await handle.boundingBox();
  if (!box) throw new Error(`Missing Puppeteer box: ${selector}`);
  return centerOfBox(box);
}

async function playwrightElementCenter(
  frame: PlaywrightFrame,
  selector: string,
): Promise<[number, number]> {
  const box = await frame.locator(selector).boundingBox();
  if (!box) throw new Error(`Missing Playwright box: ${selector}`);
  return centerOfBox(box);
}

async function puppeteerEditingState(
  frame: PuppeteerFrame,
): Promise<EditingState> {
  return frame.evaluate(() => {
    const first = document.querySelector('#first') as HTMLInputElement;
    const second = document.querySelector('#second') as HTMLInputElement;
    const browserWindow = window as typeof window & {
      __midsceneEditingEvents: string[];
    };
    return {
      activeElementId: document.activeElement?.id ?? '',
      events: browserWindow.__midsceneEditingEvents,
      firstSelection: [first.selectionStart, first.selectionEnd],
      firstValue: first.value,
      secondValue: second.value,
    };
  });
}

async function playwrightEditingState(
  frame: PlaywrightFrame,
): Promise<EditingState> {
  return frame.evaluate(() => {
    const first = document.querySelector('#first') as HTMLInputElement;
    const second = document.querySelector('#second') as HTMLInputElement;
    const browserWindow = window as typeof window & {
      __midsceneEditingEvents: string[];
    };
    return {
      activeElementId: document.activeElement?.id ?? '',
      events: browserWindow.__midsceneEditingEvents,
      firstSelection: [first.selectionStart, first.selectionEnd],
      firstValue: first.value,
      secondValue: second.value,
    };
  });
}

describe('input keyboard actions end to end', () => {
  let servers: EditingServers;

  beforeAll(async () => {
    servers = await startEditingServers();
  });

  afterAll(async () => {
    await servers?.close();
  });

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
      'runs select-all and cut without a locate target',
      async () => {
        const page = await browser.newPage();
        try {
          await page.setContent(TOP_LEVEL_INPUT_HTML);
          await page.focus('#first');
          const agent = new PuppeteerAgent(page, {
            generateReport: false,
            modelConfig: {},
          });

          await agent.aiKeyboardPress(undefined, {
            keyName: `${MODIFIER}+A`,
          });
          await agent.aiKeyboardPress(undefined, {
            keyName: `${MODIFIER}+X`,
          });

          expect(await page.$eval('#first', (el) => el.value)).toBe('');
        } finally {
          await page.close();
        }
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'preserves input and textarea selections for copy and cut',
      async () => {
        const page = await browser.newPage();
        try {
          await page.setContent(TOP_LEVEL_INPUT_HTML);
          const input = createWebInputPrimitives(new PuppeteerWebPage(page));
          const first = targetAt(
            await puppeteerElementCenter(page.mainFrame(), '#first'),
          );
          const notes = targetAt(
            await puppeteerElementCenter(page.mainFrame(), '#notes'),
          );

          await input.keyboard.keyboardPress(`${MODIFIER}+A`, {
            target: first,
          });
          await input.keyboard.keyboardPress(`${MODIFIER}+C`, {
            target: first,
          });
          expect(await page.$eval('#first', (el) => el.value)).toBe(
            'first value',
          );

          await input.keyboard.keyboardPress(`${MODIFIER}+A`, {
            target: notes,
          });
          await input.keyboard.keyboardPress(`${MODIFIER}+X`, {
            target: notes,
          });
          expect(await page.$eval('#notes', (el) => el.value)).toBe('');
          expect(
            await page.evaluate(
              () =>
                (
                  window as typeof window & {
                    __midsceneEditingEvents: string[];
                  }
                ).__midsceneEditingEvents,
            ),
          ).toEqual(['copy', 'cut']);
        } finally {
          await page.close();
        }
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'focuses a different top-level input before cutting',
      async () => {
        const page = await browser.newPage();
        try {
          await page.setContent(TOP_LEVEL_INPUT_HTML);
          await page.$eval('#first', (el) => {
            el.focus();
            el.select();
          });
          const input = createWebInputPrimitives(new PuppeteerWebPage(page));
          const second = targetAt(
            await puppeteerElementCenter(page.mainFrame(), '#second'),
          );

          await input.keyboard.keyboardPress(`${MODIFIER}+X`, {
            target: second,
          });

          expect(await page.$eval('#first', (el) => el.value)).toBe(
            'first value',
          );
          expect(await page.$eval('#second', (el) => el.value)).toBe(
            'second value',
          );
          expect(await page.evaluate(() => document.activeElement?.id)).toBe(
            'second',
          );
        } finally {
          await page.close();
        }
      },
      TEST_TIMEOUT_MS,
    );

    test.each<IframeMode>(['same-origin', 'cross-origin'])(
      'selects and cuts an input in a %s iframe',
      async (mode) => {
        const page = await browser.newPage();
        try {
          await page.goto(servers.iframePageUrl(mode), {
            waitUntil: 'networkidle0',
          });
          const frame = page
            .frames()
            .find((candidate) => candidate.url().endsWith('/iframe-input'));
          if (!frame) throw new Error(`Missing Puppeteer ${mode} iframe`);
          expect(
            new URL(frame.url()).origin === new URL(page.url()).origin,
          ).toBe(mode === 'same-origin');

          const input = createWebInputPrimitives(new PuppeteerWebPage(page));
          const first = targetAt(await puppeteerElementCenter(frame, '#first'));
          await input.keyboard.keyboardPress(`${MODIFIER}+A`, {
            target: first,
          });
          expect((await puppeteerEditingState(frame)).firstSelection).toEqual([
            0, 11,
          ]);

          await input.keyboard.keyboardPress(`${MODIFIER}+X`, {
            target: first,
          });
          expect(await puppeteerEditingState(frame)).toMatchObject({
            activeElementId: 'first',
            events: ['cut'],
            firstValue: '',
            secondValue: 'frame second',
          });
        } finally {
          await page.close();
        }
      },
      TEST_TIMEOUT_MS,
    );

    test.each<IframeMode>(['same-origin', 'cross-origin'])(
      'does not confuse two inputs in the same %s iframe',
      async (mode) => {
        const page = await browser.newPage();
        try {
          await page.goto(servers.iframePageUrl(mode), {
            waitUntil: 'networkidle0',
          });
          const frame = page
            .frames()
            .find((candidate) => candidate.url().endsWith('/iframe-input'));
          if (!frame) throw new Error(`Missing Puppeteer ${mode} iframe`);
          await frame.$eval('#first', (el) => {
            el.focus();
            el.select();
          });

          const input = createWebInputPrimitives(new PuppeteerWebPage(page));
          const second = targetAt(
            await puppeteerElementCenter(frame, '#second'),
          );
          await input.keyboard.keyboardPress(`${MODIFIER}+X`, {
            target: second,
          });

          expect(await puppeteerEditingState(frame)).toMatchObject({
            activeElementId: 'second',
            firstValue: 'frame first',
            secondValue: 'frame second',
          });
        } finally {
          await page.close();
        }
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('Playwright', () => {
    let browser: PlaywrightBrowser;

    beforeAll(async () => {
      browser = await chromium.launch({
        headless: true,
        executablePath: puppeteer.executablePath(),
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }, TEST_TIMEOUT_MS);

    afterAll(async () => {
      await browser?.close();
    }, TEST_TIMEOUT_MS);

    test(
      'runs select-all and cut without a locate target',
      async () => {
        const page = await browser.newPage();
        try {
          await page.setContent(TOP_LEVEL_INPUT_HTML);
          await page.locator('#first').focus();
          const agent = new PlaywrightAgent(page, {
            generateReport: false,
            modelConfig: {},
          });

          await agent.aiKeyboardPress(undefined, {
            keyName: `${MODIFIER}+A`,
          });
          await agent.aiKeyboardPress(undefined, {
            keyName: `${MODIFIER}+X`,
          });

          expect(await page.locator('#first').inputValue()).toBe('');
        } finally {
          await page.close();
        }
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'preserves input and textarea selections for copy and cut',
      async () => {
        const page = await browser.newPage();
        try {
          await page.setContent(TOP_LEVEL_INPUT_HTML);
          const input = createWebInputPrimitives(new PlaywrightWebPage(page));
          const first = targetAt(
            await playwrightElementCenter(page.mainFrame(), '#first'),
          );
          const notes = targetAt(
            await playwrightElementCenter(page.mainFrame(), '#notes'),
          );

          await input.keyboard.keyboardPress(`${MODIFIER}+A`, {
            target: first,
          });
          await input.keyboard.keyboardPress(`${MODIFIER}+C`, {
            target: first,
          });
          expect(await page.locator('#first').inputValue()).toBe('first value');

          await input.keyboard.keyboardPress(`${MODIFIER}+A`, {
            target: notes,
          });
          await input.keyboard.keyboardPress(`${MODIFIER}+X`, {
            target: notes,
          });
          expect(await page.locator('#notes').inputValue()).toBe('');
          expect(
            await page.evaluate(
              () =>
                (
                  window as typeof window & {
                    __midsceneEditingEvents: string[];
                  }
                ).__midsceneEditingEvents,
            ),
          ).toEqual(['copy', 'cut']);
        } finally {
          await page.close();
        }
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'focuses a different top-level input before cutting',
      async () => {
        const page = await browser.newPage();
        try {
          await page.setContent(TOP_LEVEL_INPUT_HTML);
          await page.locator('#first').focus();
          await page.locator('#first').selectText();
          const input = createWebInputPrimitives(new PlaywrightWebPage(page));
          const second = targetAt(
            await playwrightElementCenter(page.mainFrame(), '#second'),
          );

          await input.keyboard.keyboardPress(`${MODIFIER}+X`, {
            target: second,
          });

          expect(await page.locator('#first').inputValue()).toBe('first value');
          expect(await page.locator('#second').inputValue()).toBe(
            'second value',
          );
          expect(await page.evaluate(() => document.activeElement?.id)).toBe(
            'second',
          );
        } finally {
          await page.close();
        }
      },
      TEST_TIMEOUT_MS,
    );

    test.each<IframeMode>(['same-origin', 'cross-origin'])(
      'selects and cuts an input in a %s iframe',
      async (mode) => {
        const page = await browser.newPage();
        try {
          await page.goto(servers.iframePageUrl(mode), {
            waitUntil: 'networkidle',
          });
          const frame = page
            .frames()
            .find((candidate) => candidate.url().endsWith('/iframe-input'));
          if (!frame) throw new Error(`Missing Playwright ${mode} iframe`);
          expect(
            new URL(frame.url()).origin === new URL(page.url()).origin,
          ).toBe(mode === 'same-origin');

          const input = createWebInputPrimitives(new PlaywrightWebPage(page));
          const first = targetAt(
            await playwrightElementCenter(frame, '#first'),
          );
          await input.keyboard.keyboardPress(`${MODIFIER}+A`, {
            target: first,
          });
          expect((await playwrightEditingState(frame)).firstSelection).toEqual([
            0, 11,
          ]);

          await input.keyboard.keyboardPress(`${MODIFIER}+X`, {
            target: first,
          });
          expect(await playwrightEditingState(frame)).toMatchObject({
            activeElementId: 'first',
            events: ['cut'],
            firstValue: '',
            secondValue: 'frame second',
          });
        } finally {
          await page.close();
        }
      },
      TEST_TIMEOUT_MS,
    );

    test.each<IframeMode>(['same-origin', 'cross-origin'])(
      'does not confuse two inputs in the same %s iframe',
      async (mode) => {
        const page = await browser.newPage();
        try {
          await page.goto(servers.iframePageUrl(mode), {
            waitUntil: 'networkidle',
          });
          const frame = page
            .frames()
            .find((candidate) => candidate.url().endsWith('/iframe-input'));
          if (!frame) throw new Error(`Missing Playwright ${mode} iframe`);
          await frame.locator('#first').focus();
          await frame.locator('#first').selectText();

          const input = createWebInputPrimitives(new PlaywrightWebPage(page));
          const second = targetAt(
            await playwrightElementCenter(frame, '#second'),
          );
          await input.keyboard.keyboardPress(`${MODIFIER}+X`, {
            target: second,
          });

          expect(await playwrightEditingState(frame)).toMatchObject({
            activeElementId: 'second',
            firstValue: 'frame first',
            secondValue: 'frame second',
          });
        } finally {
          await page.close();
        }
      },
      TEST_TIMEOUT_MS,
    );
  });
});
