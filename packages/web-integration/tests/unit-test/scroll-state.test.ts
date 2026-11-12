import { inspectScrollTarget } from '@/common/scroll-state';
import { Page as WebPage } from '@/puppeteer/base-page';
import { afterAll, beforeAll, expect, it } from '@rstest/core';
import puppeteer, { type Browser, type Page } from 'puppeteer';

let browser: Browser;
let page: Page;
beforeAll(async () => {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  page = await browser.newPage();
});
afterAll(async () => {
  await browser?.close();
});

it('tracks the inner container across coordinate jitter and distinguishes ancestor movement and replacement', async () => {
  await page.setContent(
    `<style>body{margin:0}#outer{height:200px;overflow:auto}#inner{width:150px;height:100px;overflow:auto}#content{width:600px;height:100px}.filler{height:600px}</style><div id="outer"><div id="inner"><div id="content">records</div></div><div class="filler"></div></div>`,
  );
  const adapter = new WebPage(page, 'puppeteer');
  const capture = (x: number, y: number) =>
    adapter.captureScrollState({
      direction: 'down',
      locate: { center: [x, y] },
    } as any);
  const before = await capture(20, 40);
  const jitter = await capture(25, 45);
  expect(jitter!.targetId).toBe(before!.targetId);
  await page.evaluate(() => {
    document.getElementById('outer')!.scrollTop = 10;
  });
  const outerMoved = await capture(20, 40);
  expect(outerMoved!.targetId).toBe(before!.targetId);
  expect(outerMoved!.scrollTop).toBe(0);
  expect(outerMoved!.rect.top).not.toBe(before!.rect.top);
  await page.evaluate(() => {
    document.getElementById('inner')!.scrollLeft = 50;
  });
  expect((await capture(20, 40))!.scrollLeft).toBe(50);
  await page.evaluate(() => {
    const old = document.getElementById('inner')!;
    old.replaceWith(old.cloneNode(true));
  });
  expect((await capture(20, 40))!.targetId).not.toBe(before!.targetId);
});

it('returns unknown for frame and canvas targets', async () => {
  await page.setContent(
    '<iframe style="position:fixed;left:0;top:0;width:100px;height:100px"></iframe>',
  );
  expect(await page.evaluate(inspectScrollTarget, 20, 20)).toBeUndefined();
  await page.setContent(
    '<canvas style="position:fixed;left:0;top:0;width:100px;height:100px"></canvas>',
  );
  expect(await page.evaluate(inspectScrollTarget, 20, 20)).toBeUndefined();
});

it('follows open shadow roots and does not reuse identity after navigation', async () => {
  await page.setContent('<div id="host"></div>');
  await page.evaluate(() => {
    document.getElementById('host')!.attachShadow({ mode: 'open' }).innerHTML =
      '<div style="width:100px;height:100px;overflow:auto"><div style="height:500px">rows</div></div>';
  });
  const before = await page.evaluate(inspectScrollTarget, 30, 30);
  await page.evaluate(() => {
    document.getElementById('host')!.shadowRoot!.firstElementChild!.scrollTop =
      40;
  });
  const after = await page.evaluate(inspectScrollTarget, 30, 30);
  expect(after!.targetId).toBe(before!.targetId);
  expect(after!.scrollTop).toBe(40);
  await page.goto('about:blank');
  await page.setContent('<div style="height:3000px">page</div>');
  expect((await page.evaluate(inspectScrollTarget, 30, 30))!.targetId).not.toBe(
    before!.targetId,
  );
});

it('does not infer a default target from a stale pointer after a direct gesture', async () => {
  await page.setContent('<div style="height:3000px">page</div>');
  const adapter = new WebPage(page, 'puppeteer');
  await adapter.mouse.move(30, 30);
  expect(
    await adapter.captureScrollState({ direction: 'down' } as any),
  ).toBeDefined();
  await adapter.longPress(200, 200, 300);
  expect(
    await adapter.captureScrollState({ direction: 'down' } as any),
  ).toBeUndefined();
  await adapter.mouse.move(40, 40);
  expect(
    await adapter.captureScrollState({ direction: 'down' } as any),
  ).toBeDefined();
});
