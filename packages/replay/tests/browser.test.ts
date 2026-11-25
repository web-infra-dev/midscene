import { PlaywrightBrowserAgent } from '@midscene/web/playwright';
import { afterAll, beforeAll, expect, it } from '@rstest/core';
import { type Browser, chromium } from 'playwright';
import {
  defineStep,
  runReplayStep,
  withReplay,
  withoutReplayFallback,
} from '../src/index';
import type { StrictLocate } from '../src/runtime/web-target';
let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
});

it('replays one native selection with business and native report evidence', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const fixture = `
    <select id="sort">
      <option value="featured">Featured</option>
      <option value="price" label="Price ascending">Low to high</option>
      <optgroup label="Unavailable" disabled><option value="disabled">Disabled</option></optgroup>
      <option value="first" label="Duplicate">First</option>
      <option value="second" label="Duplicate">Second</option>
    </select>
    <select id="multi" multiple><option value="price">Price</option></select>
    <ul id="products"><li data-price="12">Book</li><li data-price="3">Pen</li></ul>
    <output id="events"></output>
    <script>(() => {
      const select = document.getElementById('sort');
      const products = document.getElementById('products');
      const events = document.getElementById('events');
      for (const type of ['input', 'change']) {
        document.addEventListener(type, (event) => {
          if (event.target !== select) return;
          events.textContent += type + ' ';
          if (type === 'change' && select.value === 'price') {
            products.append(...Array.from(products.children).sort(
              (a, b) => Number(a.dataset.price) - Number(b.dataset.price),
            ));
          }
        });
      }
    })();</script>
  `;
  const agent = new PlaywrightBrowserAgent(context, page, {
    generateReport: false,
    forceChromeSelectRendering: false,
    modelConfig: {},
  });
  try {
    await page.setContent(fixture);
    const sort: StrictLocate = {
      candidates: [{ xpath: '//select[@id="sort"]' }],
      guard: { tag: 'select', attr: { id: 'sort' } },
    };
    await runReplayStep(
      agent,
      defineStep({
        run: (rp) =>
          rp.select('Choose price ascending', {
            ...sort,
            option: { value: 'price' },
          }),
        async done(rp) {
          await rp.expect(sort, { value: 'price' });
          expect(
            await rp.read(() =>
              Array.from(
                document.querySelectorAll('#products li'),
                (row) => row.textContent,
              ),
            ),
          ).toEqual(['Pen', 'Book']);
        },
      }),
    );
    expect(await page.locator('#events').textContent()).toBe('input change ');
    const dump = JSON.parse(agent.dumpDataString({ inlineScreenshots: true }));
    expect(dump.executions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: expect.stringContaining('Select · Choose price ascending'),
          tasks: expect.arrayContaining([
            expect.objectContaining({
              status: 'finished',
              param: {
                content: expect.stringContaining('"dispatch":"completed"'),
              },
              recorder: expect.arrayContaining([
                expect.objectContaining({ type: 'screenshot' }),
              ]),
            }),
          ]),
        }),
      ]),
    );

    const rp = withReplay(agent, { timeoutMs: 0 });
    await expect(
      rp.select('Unknown option', { ...sort, option: { value: 'missing' } }),
    ).rejects.toThrow('SELECT_OPTION_MISSING');
    await expect(
      rp.select('Disabled option', { ...sort, option: { value: 'disabled' } }),
    ).rejects.toThrow('SELECT_OPTION_DISABLED');
    await expect(
      rp.select('Ambiguous option', {
        ...sort,
        option: { label: 'Duplicate' },
      }),
    ).rejects.toThrow('SELECT_OPTION_AMBIGUOUS');
    await expect(
      rp.select('Multiple choices', {
        candidates: [{ xpath: '//select[@id="multi"]' }],
        option: { value: 'price' },
      }),
    ).rejects.toThrow('SELECT_REQUIRES_SINGLE_SELECT');
    expect(await page.locator('#events').textContent()).toBe('input change ');

    await rp.select('Return to Featured', {
      ...sort,
      option: { label: 'Featured' },
    });
    await expect(rp.inspect(sort)).resolves.toMatchObject({
      value: 'featured',
    });
    expect(await page.locator('#events').textContent()).toBe(
      'input change input change ',
    );
  } finally {
    await agent.destroy();
    await context.close();
  }
});

it('replays native input, Enter and a popup with business checks', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await context.route('http://replay.test/**', async (route) => {
    const url = new URL(route.request().url());
    const body =
      url.pathname === '/'
        ? '<form action="/results"><input name="q"></form>'
        : url.pathname === '/results'
          ? '<a id="result" href="/destination" target="_blank">TodoMVC</a>'
          : '<h1>Destination</h1>';
    await route.fulfill({ contentType: 'text/html', body });
  });
  await page.goto('http://replay.test/');
  const agent = new PlaywrightBrowserAgent(context, page, {
    generateReport: false,
    modelConfig: {},
  });
  try {
    const seen: unknown[] = [];
    const rp = withReplay(agent, { onEvent: (event) => seen.push(event) });
    const field: StrictLocate = {
      candidates: [{ xpath: '//input[@name="q"]' }],
    };
    await rp.input('query', {
      ...field,
      value: 'todomvc',
      inputStrategy: 'bulk',
    });
    seen.length = 0;
    const nativeBefore = agent.dumpDataString();
    expect(
      await rp.read(
        (selector) => document.querySelector<HTMLInputElement>(selector)?.value,
        { args: ['input[name="q"]'] },
      ),
    ).toBe('todomvc');
    expect(seen).toEqual([]);
    expect(agent.dumpDataString()).toBe(nativeBefore);
    expect((await rp.inspect(field.candidates[0])).value).toBe('todomvc');
    await Promise.all([
      page.waitForURL('**/results?*'),
      rp.keyPress('submit', { ...field, keyName: 'Enter' }),
    ]);
    expect(new URL(page.url()).searchParams.get('q')).toBe('todomvc');
    await rp.tap('TodoMVC', {
      candidates: [{ xpath: '//a[@id="result"]' }],
      opensPage: { url: 'http://replay.test/destination' },
    });
    const popup = agent.activePage;
    expect(popup).not.toBe(page);
    expect(await popup.locator('h1').textContent()).toBe('Destination');
  } finally {
    await agent.destroy();
    await context.close();
  }
}, 30_000);

it('keeps strict scope and CSS coordinates under zoom, reorder and target failures', async () => {
  const context = await browser.newContext({ deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.setContent(
    '<style>body{zoom:1.25}li{height:70px}</style><ul><li id="a">A<button>Delete</button></li><li id="b">B<button>Delete</button></li></ul><output></output><script>document.onclick=e=>{if(e.target.tagName==="BUTTON")document.querySelector("output").textContent=e.target.parentElement.id}</script>',
  );
  const agent = new PlaywrightBrowserAgent(context, page, {
    generateReport: false,
    modelConfig: {
      MIDSCENE_MODEL_NAME: 'qwen-test',
      MIDSCENE_MODEL_BASE_URL: 'http://127.0.0.1:1',
      MIDSCENE_MODEL_FAMILY: 'qwen3-vl',
      MIDSCENE_MODEL_API_KEY: 'test',
    },
  });
  const rp = withReplay(agent);
  try {
    await page.evaluate(() =>
      document.querySelector('ul')!.prepend(document.querySelector('#b')!),
    );
    await rp.tap('B delete', {
      within: { xpath: '//li[@id="b"]' },
      candidates: [{ xpath: './/button' }],
    });
    expect((await rp.inspect({ xpath: '//output' })).text).toBe('b');
    await expect(
      rp.tap('ambiguous', {
        candidates: [{ xpath: '//button' }],
        timeoutMs: 500,
      }),
    ).rejects.toMatchObject({ code: 'TARGET_AMBIGUOUS' });
    await page.locator('#b').evaluate((e) => {
      (e as HTMLElement).style.display = 'none';
    });
    await expect(
      rp.tap('hidden', {
        timeoutMs: 0,
        candidates: [{ xpath: '//li[@id="b"]/button' }],
      }),
    ).rejects.toMatchObject({ code: 'TARGET_NOT_INTERACTABLE' });
  } finally {
    await agent.destroy();
    await context.close();
  }
}, 30_000);

for (const deviceScaleFactor of [1, 2]) {
  it(`dispatches transparent controls at DPI ${deviceScaleFactor}`, async () => {
    const context = await browser.newContext({ deviceScaleFactor });
    const page = await context.newPage();
    await page.setContent(`<style>input,button { width:40px;height:40px;opacity:0 }</style>
      <ul><li><input type="checkbox"><label>Target</label></li></ul>
      <button id="button">Transparent button</button>
      <div id="overlay" style="position:fixed;inset:0;display:none;background:white"></div>`);
    const agent = new PlaywrightBrowserAgent(context, page, {
      generateReport: false,
      modelConfig: {
        MIDSCENE_MODEL_NAME: 'qwen-test',
        MIDSCENE_MODEL_BASE_URL: 'http://127.0.0.1:1',
        MIDSCENE_MODEL_FAMILY: 'qwen3-vl',
        MIDSCENE_MODEL_API_KEY: 'test',
      },
    });
    const rp = withReplay(agent);
    const target: StrictLocate = {
      timeoutMs: 0,
      candidates: [{ xpath: '//input[@type="checkbox"]' }],
    };
    try {
      expect((await rp.inspect(target.candidates[0])).visible).toBe(false);
      await rp.tap('Target checkbox', target);
      expect((await rp.inspect(target.candidates[0])).checked).toBe(true);
      // Opacity is a visual property, not a control-type exception.
      await rp.tap('Transparent button', {
        candidates: [{ xpath: '//button' }],
      });
      if (deviceScaleFactor !== 1) return;
      for (const [css, disabled, reason] of [
        ['display:none', false, 'not-rendered'],
        ['visibility:hidden', false, 'not-rendered'],
        ['position:fixed;left:-100px', false, 'outside-viewport'],
        ['pointer-events:none', false, 'hit-target-mismatch'],
        ['', true, 'disabled'],
      ] as const) {
        await page.locator('input').evaluate(
          (input, values) => {
            input.setAttribute('style', values.css);
            (input as HTMLInputElement).disabled = values.disabled;
          },
          { css, disabled },
        );
        await expect(rp.tap('Blocked', target)).rejects.toMatchObject({
          code: 'TARGET_NOT_INTERACTABLE',
          details: { reason },
        });
      }
      await page.locator('input').evaluate((input) => {
        input.removeAttribute('style');
        (input as HTMLInputElement).disabled = false;
      });
      await page.locator('#overlay').evaluate((e) => {
        (e as HTMLElement).style.display = 'block';
      });
      await expect(rp.tap('Covered', target)).rejects.toMatchObject({
        details: { reason: 'hit-target-mismatch', hitTarget: 'div' },
      });
      await page.locator('#overlay').evaluate((e) => e.remove());
      await page.locator('input').evaluate((e) => e.remove());
      await expect(rp.tap('Removed', target)).rejects.toMatchObject({
        code: 'TARGET_MISSING',
      });
    } finally {
      await agent.destroy();
      await context.close();
    }
  }, 30_000);
}

it('follows only the popup opened by the source page', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await context.route('http://replay.test/**', async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({
      contentType: 'text/html',
      body:
        url.pathname === '/'
          ? `<button id="open">Open</button><script>
              document.querySelector('#open').onclick = () =>
                setTimeout(() => window.open('/destination'), 300);
            </script>`
          : `<h1>${url.pathname}</h1>`,
    });
  });
  const agent = new PlaywrightBrowserAgent(context, page, {
    generateReport: false,
    modelConfig: {},
  });
  try {
    await page.goto('http://replay.test/');
    const rp = withReplay(agent);
    // An unrelated page appears while the popup is pending.
    const unrelated = new Promise((resolve) =>
      setTimeout(
        () =>
          context
            .newPage()
            .then((other) =>
              other.goto('http://replay.test/other').then(resolve),
            ),
        50,
      ),
    );
    await rp.tap('Open', {
      candidates: [{ xpath: '//button[@id="open"]' }],
      opensPage: { url: 'http://replay.test/destination', timeoutMs: 5000 },
    });
    await unrelated;
    expect(agent.activePage.url()).toBe('http://replay.test/destination');
    expect(await agent.activePage.opener()).toBe(page);
  } finally {
    await agent.destroy();
    await context.close();
  }
}, 30_000);

function fallbackPage(body: string) {
  return async () => {
    const context = await browser.newContext({ deviceScaleFactor: 2 });
    const page = await context.newPage();
    await context.route('http://replay.test/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `${body}<output>0</output><script>
          document.body.addEventListener('click', e => {
            e.preventDefault();
            const out = document.querySelector('output');
            out.textContent = String(Number(out.textContent) + 1);
            out.dataset.clicked = e.target.closest('[data-id]')?.dataset.id;
          })</script>`,
      }),
    );
    const agent = new PlaywrightBrowserAgent(context, page, {
      generateReport: false,
      modelConfig: {},
      screenshotShrinkFactor: 2,
    });
    await page.goto('http://replay.test/');
    return { context, page, agent };
  };
}

it('recovers a changed XPath through the identity guard without a model', async () => {
  const { context, page, agent } = await fallbackPage(
    `<main><button data-id="save" aria-label="Save draft">Save</button>
     <button data-id="other">Other</button></main>`,
  )();
  const events: Record<string, unknown>[] = [];
  try {
    const rp = withReplay(agent, { onEvent: (event) => events.push(event) });
    let locateCalls = 0;
    agent.aiLocate = async () => {
      locateCalls++;
      throw new Error('should not be called');
    };
    const target = {
      candidates: [{ xpath: '//button[@id="save-old"]' }] as [
        { xpath: string },
      ],
      within: { xpath: '//main' },
      guard: { tag: 'button', attr: { 'aria-label': 'Save draft' } },
      fallback: 'guard' as const,
      timeoutMs: 0,
    };
    await rp.tap('Save draft', target);
    expect(await page.locator('output').getAttribute('data-clicked')).toBe(
      'save',
    );
    const resolved = events.find((event) => event.type === 'fallback');
    expect(resolved).toMatchObject({ result: 'resolved', resolvedBy: 'guard' });
    expect(resolved?.suggestions).toContain(
      '//button[@aria-label="Save draft"]',
    );

    // Strict mode never dispatches through the guard, but reports a repair hint.
    await expect(
      withoutReplayFallback(() => rp.tap('Save draft', target)),
    ).rejects.toMatchObject({ code: 'TARGET_MISSING' });
    expect(events.at(-2)).toMatchObject({ type: 'heal', resolvedBy: 'guard' });
    await rp.expect({ xpath: '//output' }, { text: '1' });

    await expect(
      rp.tap('Save draft', {
        ...target,
        guard: { tag: 'button', text: 'Missing' },
      }),
    ).rejects.toMatchObject({ code: 'FALLBACK_REJECTED' });
    await expect(
      rp.tap('Save draft', { ...target, guard: { tag: 'button' } }),
    ).rejects.toMatchObject({ code: 'FALLBACK_IDENTITY_REQUIRED' });
    await expect(
      rp.keyPress('Save draft', { ...target, keyName: 'Enter' }),
    ).rejects.toMatchObject({ code: 'FALLBACK_ACTION_UNSUPPORTED' });
    expect(locateCalls).toBe(0);
    await rp.expect({ xpath: '//output' }, { text: '1' });
  } finally {
    await agent.destroy();
    await context.close();
  }
}, 30_000);

it('uses one constrained AI locate, then the required postcondition', async () => {
  const { context, page, agent } = await fallbackPage(
    `<main><div role="row"><span>Draft A</span><button data-id="a">Delete</button></div>
     <div role="row"><span>Draft B</span><button data-id="b">Delete</button></div></main>
     <aside><button data-id="outside">Delete</button></aside>`,
  )();
  try {
    const rp = withReplay(agent);
    let answer = 'button[data-id="b"]';
    let calls = 0;
    agent.aiLocate = async (_prompt, opts) => {
      calls++;
      const box = await page.locator(answer).boundingBox();
      if (!box || !opts?.uiContext || !opts.abortSignal)
        throw new Error('missing locate context');
      const factor = opts.uiContext.shrunkShotToLogicalRatio;
      return {
        center: [
          (box.x + box.width / 2) * factor,
          (box.y + box.height / 2) * factor,
        ],
        rect: { left: box.x, top: box.y, width: box.width, height: box.height },
        dpr: 2,
      };
    };
    const clicked = () => page.locator('output').getAttribute('data-clicked');
    const target = {
      candidates: [{ xpath: '//button[@id="delete-b"]' }] as [
        { xpath: string },
      ],
      within: { xpath: '//main' },
      // Text is shared by both rows: guard matches are ambiguous.
      guard: { tag: 'button', text: 'Delete' },
      fallback: 'locate' as const,
      timeoutMs: 0,
      postcondition: async () => {
        if ((await clicked()) !== 'b') throw new Error('wrong row');
      },
    };
    await expect(
      rp.tap('Delete Draft B', { ...target, postcondition: undefined }),
    ).rejects.toMatchObject({ code: 'FALLBACK_POSTCONDITION_REQUIRED' });
    await rp.tap('Delete Draft B', target);
    expect(await clicked()).toBe('b');
    expect(calls).toBe(1);

    // An answer outside the declared scope is rejected without dispatch.
    answer = 'button[data-id="outside"]';
    await expect(rp.tap('Delete Draft B', target)).rejects.toMatchObject({
      code: 'FALLBACK_REJECTED',
    });
    await rp.expect({ xpath: '//output' }, { text: '1' });

    // A wrong but valid answer is dispatched once and caught by the postcondition.
    answer = 'button[data-id="a"]';
    await expect(rp.tap('Delete Draft B', target)).rejects.toMatchObject({
      code: 'POSTCONDITION_FAILED',
      dispatch: 'completed',
    });
    await rp.expect({ xpath: '//output' }, { text: '2' });
    expect(calls).toBe(3);
  } finally {
    await agent.destroy();
    await context.close();
  }
}, 30_000);
