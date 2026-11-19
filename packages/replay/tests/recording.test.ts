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

  it('clips field masks and keeps them on the captured page and document', async () => {
    const context = await browser.newContext({
      viewport: { width: 800, height: 600 },
      deviceScaleFactor: 2,
    });
    const opener = await context.newPage();
    const dir = mkdtempSync(join(tmpdir(), 'replay-redaction-'));
    const url = 'http://replay.test/workflow';
    let loggedIn = false;
    const recorder = new WebRecorder(opener);
    await context.route('http://replay.test/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body:
          route.request().url() !== url
            ? '<style>body{background:#00cc00}</style><button>Popup action</button>'
            : loggedIn
              ? '<style>body{background:#0055ff}</style><button>Read dashboard</button>'
              : `<style>
                body { background: #ee0000; }
                input { position: absolute; left: -10px; top: 80px; width: 120px; height: 50px; padding: 0; border: 0; }
              </style>
              <input aria-label="One time code" autocomplete="one-time-code" value="123456">
              <a href="/popup" target="_blank">Open popup</a>`,
      }),
    );
    const pixel = (path: string, x: number, y: number) =>
      sharp(join(dir, path))
        .extract({ left: x, top: y, width: 1, height: 1 })
        .raw()
        .toBuffer();
    try {
      await opener.goto(url);
      await recorder.start();
      await opener.getByRole('textbox', { name: 'One time code' }).click();
      const [popup] = await Promise.all([
        opener.waitForEvent('popup'),
        opener.getByRole('link', { name: 'Open popup' }).click(),
      ]);
      await popup.setViewportSize({ width: 480, height: 320 });
      await popup.waitForFunction(() =>
        Object.keys(window).some((key) =>
          key.startsWith('__midsceneRecorder_'),
        ),
      );
      await popup.getByRole('button', { name: 'Popup action' }).click();
      await popup.close();

      loggedIn = true;
      await opener.reload();
      await opener.getByRole('button', { name: 'Read dashboard' }).click();
      const trace = readTrace(await recorder.stop(dir));
      const imageBefore = (name: string) => {
        const event = trace.events.find(
          (event) =>
            event.type === 'pointer' &&
            event.phase === 'down' &&
            event.target?.fingerprint?.name === name,
        );
        expect(event?.before).toBeDefined();
        return trace.frames[event!.before!];
      };

      const secret = await pixel(imageBefore('One time code'), 40, 105);
      expect([...secret].every((channel) => Math.abs(channel - 128) <= 4)).toBe(
        true,
      );
      const outsideMask = await pixel(imageBefore('One time code'), 125, 105);
      expect(outsideMask[0]).toBeGreaterThan(225);
      const popupPixel = await pixel(imageBefore('Popup action'), 40, 105);
      expect(popupPixel[1]).toBeGreaterThan(190);
      expect(popupPixel[0]).toBeLessThan(15);
      const dashboard = await pixel(imageBefore('Read dashboard'), 40, 105);
      expect(dashboard[2]).toBeGreaterThan(240);
      expect(dashboard[0]).toBeLessThan(15);
      const terminal = trace.frames[trace.meta.end!.frame];
      const terminalPixel = await pixel(terminal, 80, 210);
      expect(terminalPixel[2]).toBeGreaterThan(240);
      expect(terminalPixel[0]).toBeLessThan(15);
    } finally {
      await recorder.dispose();
      await context.close();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);

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
    await p.keyboard.type('hunter2');
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
    // Secrets: placeholder only, nothing in the trace files.
    const files = readFileSync(join(dir, 'events.jsonl'), 'utf8');
    expect(files).not.toContain('hunter2');
    expect(edits[3].state?.value).toBe('{{secret}}');
    expect(edits[3].target?.secret).toBe(true);
    // The Enter key is an action sampled with the focused element as target.
    const enter = trace.events.find((event) => event.type === 'key');
    expect(enter && enter.type === 'key' && enter.key).toBe('Enter');
    expect(enter?.target?.secret).toBe(true);
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
