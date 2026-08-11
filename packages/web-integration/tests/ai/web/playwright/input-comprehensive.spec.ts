import type { Agent } from '@midscene/core/agent';
import type { Frame, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { startInputTestServers } from '../input-e2e-page';
import { test } from './fixture';

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
  agent: Agent,
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
  const box = await frame.locator(selector).boundingBox();
  if (!box) throw new Error(`Missing bounding box: ${selector}`);
  return {
    locatedPixelBbox: [box.x, box.y, box.x + box.width, box.y + box.height],
    prompt: description,
  };
};

test.describe('comprehensive input actions in Playwright', () => {
  let servers: Awaited<ReturnType<typeof startInputTestServers>>;

  test.beforeAll(async () => {
    servers = await startInputTestServers();
  });

  test.afterAll(async () => {
    await servers?.close();
  });

  test('replaces input, textarea, and contenteditable values and emits browser events', async ({
    agentForPage,
    aiAssert,
    page,
  }) => {
    await page.goto(servers.topLevelUrl);
    const agent = await agentForPage(page);

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
    await page.locator('h1').click();

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
    await aiAssert(
      'The state summary shows Text input value: Input replaced, Textarea value: Textarea replaced, and Rich text value: Rich text replaced. It also shows non-zero beforeinput, input, and change event counts.',
    );
  });

  test('uses public aiInput to locate and replace a text input from its initial value', async ({
    agentForPage,
    aiAssert,
    page,
  }) => {
    await page.goto(servers.topLevelUrl);
    const agent = await agentForPage(page);

    await expect(page.locator('#text-input')).toHaveValue('Alpha value');
    await agent.aiInput('the text input labeled Text input', {
      value: 'Public aiInput replacement',
    });
    await expect(page.locator('#text-input')).toHaveValue(
      'Public aiInput replacement',
    );
    await aiAssert(
      'The state summary shows Text input value: Public aiInput replacement.',
    );
  });

  test('clears input, textarea, and contenteditable values and emits browser events', async ({
    agentForPage,
    aiAssert,
    page,
  }) => {
    await page.goto(servers.topLevelUrl);
    const agent = await agentForPage(page);

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
    await page.locator('h1').click();

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
    await aiAssert(
      'The state summary shows [empty] for the text input, textarea, and rich text editor, with non-zero beforeinput, input, and change event counts.',
    );
  });

  test('inserts typeOnly text at the current caret in each editable field', async ({
    agentForPage,
    aiAssert,
    page,
  }) => {
    await page.goto(servers.topLevelUrl);
    const agent = await agentForPage(page);

    const cases = [
      ['#text-input', 'Text input'],
      ['#notes', 'Notes textarea'],
      ['#rich-editor', 'Rich text editor'],
    ] as const;
    for (const [selector, description] of cases) {
      await page.locator(selector).evaluate((element) => {
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
    await aiAssert(
      'The state summary shows the inserted marker in the middle of all three values: Alpha[inserted] value, Bravo[inserted] notes, and Charl[inserted]ie rich text.',
    );
  });

  for (const mode of ['same-origin', 'cross-origin'] as const) {
    test(`replaces and clears an input in a ${mode} iframe`, async ({
      agentForPage,
      aiAssert,
      page,
    }) => {
      await page.goto(servers.iframeUrl(mode));
      const agent = await agentForPage(page);
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
      await expect(frame.locator('#frame-input')).toHaveValue(
        `${mode} replacement`,
      );
      await aiAssert(
        `Inside the iframe, the state summary shows Iframe input value: ${mode} replacement.`,
      );

      await inputAction(agent, {
        locate: await centerOf(frame, '#frame-input', `${mode} iframe input`),
        mode: 'clear',
        value: '',
      });
      await expect(frame.locator('#frame-input')).toHaveValue('');
      await aiAssert(
        'Inside the iframe, the state summary shows Iframe input value: [empty].',
      );
    });
  }

  test('keeps every character when a controlled input is replaced after clearing', async ({
    agentForPage,
    aiAssert,
    page,
  }) => {
    await page.goto(servers.controlledUrl);
    const agent = await agentForPage(page);

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
    await aiAssert(
      'The controlled input summary shows Controlled value: Stable controlled text and Replacement count: 1.',
    );
  });
});
