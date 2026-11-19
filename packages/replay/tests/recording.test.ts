import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from '@rstest/core';
import { type Browser, type Page, chromium } from 'playwright';
import sharp from 'sharp';
import { WebRecorder } from '../src/recording/recorder';
import { readTrace } from '../src/recording/trace-io';

let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => {
  await browser?.close();
});

const page = async (html: string): Promise<Page> => {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.setContent(html);
  return page;
};

function watchScreencast(page: Page) {
  const context = page.context();
  const createSession = context.newCDPSession.bind(context);
  let latest: Buffer | undefined;
  let withhold = false;
  let withheld = 0;
  context.newCDPSession = async (target) => {
    const session = await createSession(target);
    if (target === page) {
      session.on = new Proxy(session.on, {
        apply(subscribe, receiver, args) {
          const [event, listener] = args;
          if (event !== 'Page.screencastFrame')
            return Reflect.apply(subscribe, receiver, args);
          return Reflect.apply(subscribe, receiver, [
            event,
            (frame: { data: string }) => {
              if (withhold) {
                withheld++;
                return;
              }
              listener(frame);
              latest = Buffer.from(frame.data, 'base64');
            },
          ]);
        },
      });
    }
    return session;
  };

  return {
    latest: () => latest,
    withhold: () => {
      withhold = true;
    },
    withheld: () => withheld,
  };
}

describe('web recording probe', () => {
  it('continues on the opener and saves its terminal frame after a popup closes', async () => {
    const opener = await page('');
    const dir = mkdtempSync(join(tmpdir(), 'replay-closed-popup-'));
    const openerUrl = 'http://replay.test/opener';
    await opener.context().route('http://replay.test/**', async (route) => {
      const html =
        route.request().url() === openerUrl
          ? '<style>body{background:blue}</style><a target="_blank" href="/popup">Open popup</a><button>Continue on opener</button>'
          : '<style>body{background:red}</style><button>Popup action</button>';
      await route.fulfill({ contentType: 'text/html', body: html });
    });
    await opener.goto(openerUrl);
    // Close the first popup before the recorder's setup has finished.
    const quickClose = new Promise<void>((resolve, reject) => {
      opener.once('popup', (popup) => void popup.close().then(resolve, reject));
    });
    const recorder = new WebRecorder(opener);
    try {
      await recorder.start();
      await opener.getByRole('link').click();
      await quickClose;
      const [popup] = await Promise.all([
        opener.waitForEvent('popup'),
        opener.getByRole('link').click(),
      ]);
      await popup.waitForFunction(() =>
        Object.keys(window).some((key) =>
          key.startsWith('__midsceneRecorder_'),
        ),
      );
      await popup.getByRole('button').click();
      await popup.close();
      await opener.getByRole('button', { name: 'Continue on opener' }).click();

      const trace = readTrace(await recorder.stop(dir));
      expect(trace.events).toContainEqual(
        expect.objectContaining({
          type: 'screen',
          reason: 'closed',
          screen: 'http://replay.test/popup',
        }),
      );
      const clicks = trace.events.flatMap((event) =>
        event.type === 'pointer' && event.phase === 'down'
          ? [event.target?.fingerprint?.name]
          : [],
      );
      expect(clicks.slice(-2)).toEqual(['Popup action', 'Continue on opener']);
      expect(trace.meta.end?.screen).toBe(openerUrl);
      const terminal = trace.frames[trace.meta.end!.frame];
      const pixel = await sharp(join(dir, terminal))
        .extract({ left: 100, top: 100, width: 1, height: 1 })
        .raw()
        .toBuffer();
      expect(pixel[2]).toBeGreaterThan(240);
      expect(pixel[0]).toBeLessThan(10);
    } finally {
      await recorder.dispose();
      await opener.context().close();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);

  it('preserves captured events without a terminal frame if all recording pages close', async () => {
    const p = await page('<button>Before close</button>');
    const dir = mkdtempSync(join(tmpdir(), 'replay-no-terminal-'));
    const recorder = new WebRecorder(p);
    try {
      await recorder.start();
      await p.getByRole('button').click();
      await p.close();
      const trace = readTrace(await recorder.stop(dir));
      expect(
        trace.events.some(
          (event) => event.target?.fingerprint?.name === 'Before close',
        ),
      ).toBe(true);
      expect(trace.meta.end).toBeUndefined();
    } finally {
      await recorder.dispose();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('preserves the actual pre-click pixels through eviction and bounds after frames by the next input', async () => {
    const p = await page(
      "<style>body{background:rgb(20,20,20)}</style><button onclick=\"document.body.style.background='rgb('+(++window.n*30+20)+',20,20)'\">Change</button><script>window.n=0</script>",
    );
    const recorder = new WebRecorder(p, { maxFrames: 4 });
    await recorder.start();
    for (let i = 0; i < 6; i++) {
      await p.getByRole('button').click();
      // Several presses fall inside the 500 ms effect window.
      await p.waitForTimeout(120);
    }
    await p.waitForTimeout(500);
    const dir = await recorder.stop(
      join(mkdtempSync(join(tmpdir(), 'frame-sequence-')), 'trace'),
    );
    await p.close();
    const trace = readTrace(dir);
    const times = trace.meta.frameTimes!;
    const clicks = trace.events.filter(
      (e) => e.type === 'pointer' && e.phase === 'down',
    );
    expect(clicks).toHaveLength(6);
    expect(new Set(clicks.map((e) => e.before)).size).toBe(6);
    for (const [i, click] of clicks.entries()) {
      const pixel = await sharp(join(dir, trace.frames[click.before!]))
        .extract({ left: 100, top: 100, width: 1, height: 1 })
        .raw()
        .toBuffer();
      expect(Math.abs(pixel[0] - (20 + i * 30))).toBeLessThan(5);
      expect(times[click.before!]).toBeLessThanOrEqual(click.t);
      const effect = trace.events.find(
        (e) => e.type === 'effect' && e.of === click.id,
      );
      expect(effect?.type === 'effect' && effect.after).toBeTruthy();
      if (effect?.type === 'effect' && effect.after) {
        expect(times[effect.after]).toBeGreaterThan(click.t);
        expect(times[effect.after]).toBeLessThan(
          clicks[i + 1]?.t ?? Number.POSITIVE_INFINITY,
        );
      }
    }
    const referenced = new Set([
      trace.meta.end?.frame,
      ...trace.events.map((event) => event.before),
      ...trace.events.flatMap((event) =>
        event.type === 'effect' ? [event.after] : [],
      ),
    ]);
    referenced.delete(undefined);
    expect(new Set(Object.keys(trace.frames))).toEqual(referenced);
    expect(readdirSync(join(dir, 'frames')).sort()).toEqual(
      Object.values(trace.frames)
        .map((path) => path.split('/').at(-1))
        .sort(),
    );
  });

  it('does not attach a previous document frame when the reloaded page frame arrives late', async () => {
    const p = await browser.newPage({ viewport: { width: 800, height: 600 } });
    const screencast = watchScreencast(p);
    const dir = mkdtempSync(join(tmpdir(), 'replay-delayed-frame-'));
    const recorder = new WebRecorder(p);
    const url = 'http://replay.test/workflow';
    let reloaded = false;
    await p.route(url, (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: reloaded
          ? '<style>body{background:blue}</style><button>Dashboard</button>'
          : '<style>body{background:red}</style><button>Sign in</button>',
      }),
    );
    try {
      await p.goto(url);
      await recorder.start();
      await expect.poll(screencast.latest).toBeDefined();
      await p.getByRole('button', { name: 'Sign in' }).click();

      screencast.withhold();
      reloaded = true;
      await p.reload();
      await p.getByRole('button', { name: 'Dashboard' }).click();
      await expect.poll(screencast.withheld).toBeGreaterThan(0);

      const trace = readTrace(await recorder.stop(dir));
      const clicks = trace.events.filter(
        (event) => event.type === 'pointer' && event.phase === 'down',
      );
      expect(clicks).toHaveLength(2);
      expect(clicks[0].target?.fingerprint?.name).toBe('Sign in');
      expect(trace.frames[clicks[0].before!]).toBeDefined();
      expect(clicks[1].target?.fingerprint?.name).toBe('Dashboard');
      expect(clicks[1].before).toBeUndefined();
      expect(trace.frames[trace.meta.end!.frame]).toBeDefined();
    } finally {
      await recorder.dispose();
      await p.context().close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes sampled values and unmasked frames for a marked field', async () => {
    const p = await page(`
      <style>
        input {
          position: absolute; left: 20px; top: 80px; width: 180px;
          height: 50px; padding: 0; border: 0; background: #11cc33;
        }
      </style>
      <input aria-label="One time code" autocomplete="one-time-code"
        data-midscene-secret value="123456">`);
    const screencast = watchScreencast(p);
    const dir = mkdtempSync(join(tmpdir(), 'replay-field-evidence-'));
    const recorder = new WebRecorder(p);
    try {
      await recorder.start();
      await expect.poll(screencast.latest).toBeDefined();
      await p.getByRole('textbox', { name: 'One time code' }).click();

      const trace = readTrace(await recorder.stop(dir));
      const press = trace.events.find(
        (event) => event.type === 'pointer' && event.phase === 'down',
      );
      expect(press?.state?.value).toBe('123456');
      expect(press?.before).toBeDefined();
      expect(trace.meta.end?.frame).toBeDefined();
      for (const frame of [press!.before!, trace.meta.end!.frame]) {
        const pixel = await sharp(join(dir, trace.frames[frame]))
          .extract({ left: 160, top: 105, width: 1, height: 1 })
          .raw()
          .toBuffer();
        expect(pixel[1]).toBeGreaterThan(190);
        expect(pixel[0]).toBeLessThan(45);
      }
    } finally {
      await recorder.dispose();
      await p.context().close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('samples at press time, twice per edit, and not on moves', async () => {
    const p = await page(`
      <input data-testid="title" placeholder="Title">
      <button id="remove" onclick="this.remove()">Remove</button>
      <input type="password" name="pw">`);
    const recorder = new WebRecorder(p);
    await recorder.start();
    for (let i = 0; i < 20; i++) await p.mouse.move(50 + i * 10, 50 + i * 5);
    await p.click('[data-testid=title]');
    await p.keyboard.type('Buy milk');
    await p.keyboard.press('Backspace');
    await p.keyboard.type('k');
    await p.click('#remove');
    await p.click('[name=pw]');
    const password = 'fixture-password';
    await p.keyboard.type(password);
    await p.keyboard.press('Enter');
    const dir = await recorder.stop(
      join(mkdtempSync(join(tmpdir(), 'probe-')), 'trace'),
    );
    const trace = readTrace(dir);
    const sampled = trace.events.filter((event) => event.target);
    const types = trace.events.map((event) => event.type);

    // Moves are merged; no per-move samples.
    expect(
      trace.events
        .filter((event) => event.type === 'move')
        .every((event) => !event.target),
    ).toBe(true);
    // The removed button was sampled when pressed, before it disappeared.
    const press = trace.events.find(
      (event) =>
        event.type === 'pointer' &&
        event.phase === 'down' &&
        event.target?.locators.some((l) => String(l.value).includes('remove')),
    );
    expect(press?.target?.fingerprint.role).toBe('button');
    // One edit run per field: start + end, regardless of keystrokes.
    const edits = trace.events.filter((event) => event.type === 'edit');
    expect(edits.map((event) => (event as { phase: string }).phase)).toEqual([
      'start',
      'end',
      'start',
      'end',
    ]);
    const titleEnd = edits[1];
    expect(titleEnd.state?.value).toBe('Buy milk');
    expect(sampled.length).toBeLessThan(12);
    expect(edits[3].state?.value).toBe(password);
    expect(readFileSync(join(dir, 'events.jsonl'), 'utf8')).toContain(password);
    // The Enter key is an action sampled with the focused element as target.
    const enter = trace.events.find((event) => event.type === 'key');
    expect(enter && enter.type === 'key' && enter.key).toBe('Enter');
    expect(enter?.state?.value).toBe(password);
    expect(types).toContain('effect');
    // Candidate locators: testid first, then semantic placeholder.
    const titleTarget = edits[0].target!;
    expect(
      titleTarget.locators.map((l) => (l as { tier: string }).tier).slice(0, 2),
    ).toEqual(['testid', 'semantic']);
    await p.close();
  });

  it('records a dwell only when the UI changes under the pointer', async () => {
    const p = await page(`
      <div id="menu" onmouseenter="document.getElementById('sub').style.display='block'">Menu
        <div id="sub" style="display:none"><a href="#x" id="item">Item</a></div>
      </div>
      <div id="plain" style="margin-top:100px">Plain</div>`);
    const recorder = new WebRecorder(p);
    await recorder.start();
    await p.hover('#plain');
    await p.waitForTimeout(450);
    await p.hover('#menu');
    await p.waitForTimeout(450);
    await p.click('#item');
    const trace = readTrace(
      await recorder.stop(join(mkdtempSync(join(tmpdir(), 'probe-')), 'trace')),
    );
    const dwells = trace.events.filter((event) => event.type === 'dwell');
    expect(dwells).toHaveLength(1);
    expect(dwells[0].target?.fingerprint.name).toContain('Menu');
    await p.close();
  });

  it('records only the visited row whose CSS-revealed button was pressed', async () => {
    const p = await page(`
      <style>
        li { padding: 12px }
        .remove { visibility: hidden }
        li:hover .remove { visibility: visible }
      </style>
      <ul>
        <li id="first">First <button class="remove">Remove</button></li>
        <li id="second">Second <button class="remove">Remove</button></li>
        <li id="plain">Plain <button>Always visible</button></li>
      </ul>`);
    const recorder = new WebRecorder(p);
    await recorder.start();
    await p.hover('#first');
    await p.hover('#plain');
    await p.click('#plain button');
    await p.hover('#second');
    await p.click('#second button');
    await p.click('#second button');
    const trace = readTrace(
      await recorder.stop(
        join(mkdtempSync(join(tmpdir(), 'css-hover-')), 'trace'),
      ),
    );
    const actions = trace.events.filter(
      (e) => e.type === 'dwell' || (e.type === 'pointer' && e.phase === 'down'),
    );
    expect(actions.map((e) => e.type)).toEqual([
      'pointer',
      'dwell',
      'pointer',
      'pointer',
    ]);
    expect(
      actions[1].target?.locators.some(
        (l) => l.kind === 'web.xpath' && l.value.includes("'second'"),
      ),
    ).toBe(true);
    expect(actions[2].revealedBy).toBe(actions[1].id);
    await p.close();
  });
});
