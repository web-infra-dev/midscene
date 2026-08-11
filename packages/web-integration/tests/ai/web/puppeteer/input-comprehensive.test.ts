import { PuppeteerAgent } from '@/puppeteer';
import puppeteer, { type Browser, type Frame, type Page } from 'puppeteer';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { startInputTestServers } from '../input-e2e-page';

vi.setConfig({ testTimeout: 180_000 });

type InputMode = 'replace' | 'clear' | 'typeOnly';

type InputState = {
  events: Array<{ id: string; type: string; value: string }>;
  values: Record<string, string>;
};

type DirectLocate = {
  locatedPixelBbox: [number, number, number, number];
  prompt: string;
};

const inputAction = async (
  agent: PuppeteerAgent,
  param: {
    keyboardTypeDelay?: number;
    locate: DirectLocate;
    mode: InputMode;
    value: string;
  },
) => {
  await agent.callActionInActionSpace('Input', param);
};

const centerOf = async (
  frame: Page | Frame,
  selector: string,
  description: string,
): Promise<DirectLocate> => {
  const element = await frame.$(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  const box = await element.boundingBox();
  if (!box) throw new Error(`Missing bounding box: ${selector}`);
  return {
    locatedPixelBbox: [box.x, box.y, box.x + box.width, box.y + box.height],
    prompt: description,
  };
};

describe('comprehensive input actions in Puppeteer', () => {
  let agent: PuppeteerAgent | undefined;
  let browser: Browser;
  let page: Page | undefined;
  let servers: Awaited<ReturnType<typeof startInputTestServers>>;

  beforeAll(async () => {
    servers = await startInputTestServers();
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  });

  afterEach(async () => {
    await agent?.destroy();
    agent = undefined;
    await page?.close();
    page = undefined;
  });

  afterAll(async () => {
    await browser?.close();
    await servers?.close();
  });

  it('replaces input, textarea, and contenteditable values and emits browser events', async () => {
    page = await browser.newPage();
    await page.goto(servers.topLevelUrl, { waitUntil: 'networkidle0' });
    agent = new PuppeteerAgent(page);

    await inputAction(agent, {
      locate: await centerOf(page, '#text-input', 'Text input'),
      mode: 'replace',
      value: 'Input replaced',
    });
    await inputAction(agent, {
      locate: await centerOf(page, '#notes', 'Notes textarea'),
      mode: 'replace',
      value: 'Textarea replaced',
    });
    await inputAction(agent, {
      locate: await centerOf(page, '#rich-editor', 'Rich text editor'),
      mode: 'replace',
      value: 'Rich text replaced',
    });
    await page.click('h1');

    const state = await page.evaluate(
      () => (window as any).__midsceneInputState() as InputState,
    );
    expect(state.values).toEqual({
      'text-input': 'Input replaced',
      notes: 'Textarea replaced',
      'rich-editor': 'Rich text replaced',
    });
    expect(state.events.some(({ type }) => type === 'beforeinput')).toBe(true);
    expect(state.events.some(({ type }) => type === 'input')).toBe(true);
    expect(state.events.some(({ type }) => type === 'change')).toBe(true);
    await agent.aiAssert(
      'The state summary shows Text input value: Input replaced, Textarea value: Textarea replaced, and Rich text value: Rich text replaced. It also shows non-zero beforeinput, input, and change event counts.',
    );
  });

  it('uses public aiInput to locate and replace a text input from its initial value', async () => {
    page = await browser.newPage();
    await page.goto(servers.topLevelUrl, { waitUntil: 'networkidle0' });
    agent = new PuppeteerAgent(page);

    expect(
      await page.$eval(
        '#text-input',
        (element) => (element as HTMLInputElement).value,
      ),
    ).toBe('Alpha value');
    await agent.aiInput('the text input labeled Text input', {
      value: 'Public replacement complete',
    });
    expect(
      await page.$eval(
        '#text-input',
        (element) => (element as HTMLInputElement).value,
      ),
    ).toBe('Public replacement complete');
    await agent.aiAssert(
      'The state summary shows Text input value: Public replacement complete.',
    );
  });

  it('clears input, textarea, and contenteditable values and emits browser events', async () => {
    page = await browser.newPage();
    await page.goto(servers.topLevelUrl, { waitUntil: 'networkidle0' });
    agent = new PuppeteerAgent(page);

    for (const [selector, description] of [
      ['#text-input', 'Text input'],
      ['#notes', 'Notes textarea'],
      ['#rich-editor', 'Rich text editor'],
    ] as const) {
      await inputAction(agent, {
        locate: await centerOf(page, selector, description),
        mode: 'clear',
        value: '',
      });
    }
    await page.click('h1');

    const state = await page.evaluate(
      () => (window as any).__midsceneInputState() as InputState,
    );
    expect(state.values).toEqual({
      'text-input': '',
      notes: '',
      'rich-editor': '',
    });
    expect(state.events.some(({ type }) => type === 'beforeinput')).toBe(true);
    expect(state.events.some(({ type }) => type === 'input')).toBe(true);
    expect(state.events.some(({ type }) => type === 'change')).toBe(true);
    await agent.aiAssert(
      'The state summary shows [empty] for the text input, textarea, and rich text editor, with non-zero beforeinput, input, and change event counts.',
    );
  });

  it('inserts typeOnly text at the current caret in each editable field', async () => {
    page = await browser.newPage();
    await page.goto(servers.topLevelUrl, { waitUntil: 'networkidle0' });
    agent = new PuppeteerAgent(page);

    const cases = [
      ['#text-input', 'Text input'],
      ['#notes', 'Notes textarea'],
      ['#rich-editor', 'Rich text editor'],
    ] as const;
    for (const [selector, description] of cases) {
      await page.$eval(selector, (element) => {
        (element as HTMLElement).focus();
        if (
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement
        ) {
          element.setSelectionRange(5, 5);
          return;
        }
        const selection = window.getSelection();
        const range = document.createRange();
        range.setStart(element.firstChild!, 5);
        range.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(range);
      });
      await inputAction(agent, {
        locate: await centerOf(page, selector, description),
        mode: 'typeOnly',
        value: '[inserted]',
      });
    }

    const state = await page.evaluate(
      () => (window as any).__midsceneInputState() as InputState,
    );
    expect(state.values).toEqual({
      'text-input': 'Alpha[inserted] value',
      notes: 'Bravo[inserted] notes',
      'rich-editor': 'Charl[inserted]ie rich text',
    });
    await agent.aiAssert(
      'The state summary shows the inserted marker in the middle of all three values: Alpha[inserted] value, Bravo[inserted] notes, and Charl[inserted]ie rich text.',
    );
  });

  it.each(['same-origin', 'cross-origin'] as const)(
    'replaces and clears an input in a %s iframe',
    async (mode) => {
      page = await browser.newPage();
      await page.goto(servers.iframeUrl(mode), { waitUntil: 'networkidle0' });
      agent = new PuppeteerAgent(page);
      const frame = page
        .frames()
        .find((candidate) => candidate.url().endsWith('/frame'));
      if (!frame) throw new Error(`Missing ${mode} iframe`);
      expect(new URL(frame.url()).origin === new URL(page.url()).origin).toBe(
        mode === 'same-origin',
      );

      await inputAction(agent, {
        locate: await centerOf(frame, '#frame-input', `${mode} iframe input`),
        mode: 'replace',
        value: `${mode} replacement`,
      });
      expect(
        await frame.$eval(
          '#frame-input',
          (element) => (element as HTMLInputElement).value,
        ),
      ).toBe(`${mode} replacement`);
      await agent.aiAssert(
        `Inside the iframe, the state summary shows Iframe input value: ${mode} replacement.`,
      );

      await inputAction(agent, {
        locate: await centerOf(frame, '#frame-input', `${mode} iframe input`),
        mode: 'clear',
        value: '',
      });
      expect(
        await frame.$eval(
          '#frame-input',
          (element) => (element as HTMLInputElement).value,
        ),
      ).toBe('');
      await agent.aiAssert(
        'Inside the iframe, the state summary shows Iframe input value: [empty].',
      );
    },
  );

  it('keeps every character when a controlled input is replaced after clearing', async () => {
    page = await browser.newPage();
    await page.goto(servers.controlledUrl, { waitUntil: 'networkidle0' });
    agent = new PuppeteerAgent(page);

    await inputAction(agent, {
      keyboardTypeDelay: 40,
      locate: await centerOf(
        page,
        '#controlled-input',
        'Controlled text input',
      ),
      mode: 'replace',
      value: 'Stable controlled text',
    });

    const state = await page.evaluate(() =>
      (window as any).__midsceneControlledState(),
    );
    expect(state).toEqual({
      replacementCount: 1,
      value: 'Stable controlled text',
    });
    await agent.aiAssert(
      'The controlled input summary shows Controlled value: Stable controlled text and Replacement count: 1.',
    );
  });
});
