import { pathToFileURL } from 'node:url';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  rs,
} from '@rstest/core';
import puppeteer, { type Browser, type CDPSession, type Page } from 'puppeteer';

const TEST_TIMEOUT_MS = 120_000;
const DRAG_FIXTURE_URL = pathToFileURL(
  `${__dirname}/fixtures/base-page-drag.html`,
).toString();

const mockSendCommand = rs.fn();

rs.stubGlobal('chrome', {
  runtime: {
    getURL: rs.fn((path: string) => path),
  },
  tabs: {
    get: rs.fn(),
    query: rs.fn(),
    update: rs.fn(),
  },
  debugger: {
    attach: rs.fn(),
    detach: rs.fn(),
    sendCommand: mockSendCommand,
    onEvent: {
      addListener: rs.fn(),
      removeListener: rs.fn(),
    },
  },
});

rs.mock('@midscene/shared/logger', () => ({
  getDebug: rs.fn(() => rs.fn()),
}));

rs.mock('../../src/chrome-extension/dynamic-scripts', () => ({
  getHtmlElementScript: rs.fn(async () => 'void 0'),
  injectStopWaterFlowAnimation: rs.fn(async () => 'void 0'),
  injectWaterFlowAnimation: rs.fn(async () => 'void 0'),
}));

import ChromeExtensionProxyPage from '../../src/chrome-extension/page';

async function elementCenter(
  page: Page,
  selector: string,
): Promise<{ x: number; y: number }> {
  return page.$eval(selector, (element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function legacyDragWithoutButtons(
  cdpSession: CDPSession,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  await cdpSession.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: from.x,
    y: from.y,
  });

  await sleep(200);
  await cdpSession.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: from.x,
    y: from.y,
    button: 'left',
    clickCount: 1,
  });

  await sleep(300);
  await cdpSession.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: to.x,
    y: to.y,
  });

  await sleep(500);
  await cdpSession.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: to.x,
    y: to.y,
    button: 'left',
    clickCount: 1,
  });

  await sleep(200);
  await cdpSession.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: to.x,
    y: to.y,
  });
}

async function dragWithButtonState(
  cdpSession: CDPSession,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps: number,
) {
  await cdpSession.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: from.x,
    y: from.y,
  });

  await sleep(200);
  await cdpSession.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: from.x,
    y: from.y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  });

  await sleep(300);
  for (let i = 1; i <= steps; i++) {
    await cdpSession.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: from.x + ((to.x - from.x) * i) / steps,
      y: from.y + ((to.y - from.y) * i) / steps,
      button: 'left',
      buttons: 1,
    });
  }

  await sleep(500);
  await cdpSession.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: to.x,
    y: to.y,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });

  await sleep(200);
  await cdpSession.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: to.x,
    y: to.y,
  });
}

describe('ChromeExtensionProxyPage drag', () => {
  let page: ChromeExtensionProxyPage;

  beforeEach(() => {
    rs.clearAllMocks();
    page = new ChromeExtensionProxyPage(false);
    (page as any).activeTabId = 7;

    rs.mocked(chrome.tabs.get).mockResolvedValue({
      id: 7,
      url: 'https://example.com',
      status: 'complete',
    } as chrome.tabs.Tab);

    mockSendCommand.mockResolvedValue({});
  });

  afterEach(() => {
    rs.restoreAllMocks();
  });

  it('dispatches drag mouse events with left button state', async () => {
    await page.mouse.drag({ x: 10, y: 20 }, { x: 110, y: 220 });

    const inputEvents = mockSendCommand.mock.calls
      .filter(([, method]) => method === 'Input.dispatchMouseEvent')
      .map(([, , params]) => params as Record<string, unknown>);

    expect(
      inputEvents.find(({ type }) => type === 'mousePressed'),
    ).toMatchObject({
      type: 'mousePressed',
      x: 10,
      y: 20,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });

    const dragMoves = inputEvents.filter(
      ({ type, button, buttons }) =>
        type === 'mouseMoved' && button === 'left' && buttons === 1,
    );

    expect(dragMoves).toHaveLength(1);
    expect(dragMoves[0]).toMatchObject({
      type: 'mouseMoved',
      x: 110,
      y: 220,
      button: 'left',
      buttons: 1,
    });

    expect(
      inputEvents.find(({ type }) => type === 'mouseReleased'),
    ).toMatchObject({
      type: 'mouseReleased',
      x: 110,
      y: 220,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    });
  });

  describe('with a real CDP page', () => {
    let browser: Browser;
    let realPage: Page;
    let cdpSession: CDPSession;

    beforeAll(async () => {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }, TEST_TIMEOUT_MS);

    afterAll(async () => {
      await browser?.close();
    }, TEST_TIMEOUT_MS);

    beforeEach(async () => {
      realPage = await browser.newPage();
      await realPage.goto(DRAG_FIXTURE_URL);
      cdpSession = await realPage.target().createCDPSession();

      mockSendCommand.mockImplementation(async (_target, method, params) =>
        cdpSession.send(method, params),
      );
    }, TEST_TIMEOUT_MS);

    afterEach(async () => {
      await cdpSession?.detach().catch(() => undefined);
      await realPage?.close().catch(() => undefined);
    });

    it(
      'performs HTML5 drag and drop on the fixture page',
      async () => {
        const source = await elementCenter(realPage, '[data-fruit="banana"]');
        const target = await elementCenter(realPage, '#dropzone');

        await page.mouse.drag(source, target);

        await realPage.waitForFunction(
          () =>
            document.querySelector('#result')?.textContent ===
            'Dropped: banana',
        );

        await expect(
          realPage.$eval('#result', (element) => element.textContent),
        ).resolves.toBe('Dropped: banana');
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'does not perform HTML5 drag and drop when mouse move omits button state',
      async () => {
        const source = await elementCenter(realPage, '[data-fruit="orange"]');
        const target = await elementCenter(realPage, '#dropzone');

        await legacyDragWithoutButtons(cdpSession, source, target);

        await expect(
          realPage.$eval('#result', (element) => element.textContent),
        ).resolves.toBe('Dropped: none');
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'performs HTML5 drag and drop with a single button-state mouse move',
      async () => {
        const source = await elementCenter(realPage, '[data-fruit="apple"]');
        const target = await elementCenter(realPage, '#dropzone');

        await dragWithButtonState(cdpSession, source, target, 1);

        await realPage.waitForFunction(
          () =>
            document.querySelector('#result')?.textContent === 'Dropped: apple',
        );

        await expect(
          realPage.$eval('#result', (element) => element.textContent),
        ).resolves.toBe('Dropped: apple');
      },
      TEST_TIMEOUT_MS,
    );
  });
});
