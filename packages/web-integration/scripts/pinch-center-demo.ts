import path from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';

const pageUrl = pathToFileURL(
  path.join(__dirname, '../tests/ai/fixtures/pinch-center-demo.html'),
).toString();

async function main() {
  const zoomRatio = 4;
  const dpr = 2;
  const keepOpen = process.env.KEEP_OPEN === '1';
  const browser = await puppeteer.launch({
    headless: process.env.HEADLESS === '1',
    defaultViewport: {
      width: 390,
      height: 844,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    },
  });

  const page = await browser.newPage();
  await page.goto(pageUrl);

  await new Promise((resolve) => setTimeout(resolve, 500));

  const client = await page.target().createCDPSession();
  const targetBeforeZoom = await page.evaluate(() => {
    const target = document.getElementById('target');
    if (!(target instanceof HTMLElement)) {
      throw new Error('target not found');
    }
    const rect = target.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
    };
  });

  await client.send('Input.synthesizePinchGesture', {
    x: Math.round(targetBeforeZoom.centerX),
    y: Math.round(targetBeforeZoom.centerY),
    scaleFactor: zoomRatio,
    relativeSpeed: 800,
    gestureSourceType: 'touch',
  });
  await new Promise((resolve) => setTimeout(resolve, 800));

  const zoomed = await page.evaluate(() => {
    const target = document.getElementById('target');
    if (!(target instanceof HTMLElement)) {
      throw new Error('target not found');
    }
    const rect = target.getBoundingClientRect();
    return {
      rect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
      },
      viewport: {
        scale: window.visualViewport?.scale ?? 1,
        offsetLeft: window.visualViewport?.offsetLeft ?? 0,
        offsetTop: window.visualViewport?.offsetTop ?? 0,
        width: window.visualViewport?.width ?? window.innerWidth,
        height: window.visualViewport?.height ?? window.innerHeight,
      },
    };
  });

  const formulas = [
    {
      name: 'before center',
      x: targetBeforeZoom.centerX,
      y: targetBeforeZoom.centerY,
    },
    {
      name: 'before center - visualViewport offset',
      x: targetBeforeZoom.centerX - zoomed.viewport.offsetLeft,
      y: targetBeforeZoom.centerY - zoomed.viewport.offsetTop,
    },
    {
      name: 'before center + visualViewport offset',
      x: targetBeforeZoom.centerX + zoomed.viewport.offsetLeft,
      y: targetBeforeZoom.centerY + zoomed.viewport.offsetTop,
    },
    {
      name: '(before center - offset) * scale',
      x:
        (targetBeforeZoom.centerX - zoomed.viewport.offsetLeft) *
        zoomed.viewport.scale,
      y:
        (targetBeforeZoom.centerY - zoomed.viewport.offsetTop) *
        zoomed.viewport.scale,
    },
    {
      name: 'visualViewport center formula: offset + client / scale',
      x:
        zoomed.viewport.offsetLeft +
        targetBeforeZoom.centerX / zoomed.viewport.scale,
      y:
        zoomed.viewport.offsetTop +
        targetBeforeZoom.centerY / zoomed.viewport.scale,
    },
  ].map((formula) => ({
    ...formula,
    dx: formula.x - zoomed.rect.centerX,
    dy: formula.y - zoomed.rect.centerY,
  }));

  const screenshotCoordinate = {
    x: Math.round(zoomed.rect.centerX * dpr),
    y: Math.round(zoomed.rect.centerY * dpr),
  };
  const candidates = [
    {
      name: 'DOM rect center',
      x: Math.round(zoomed.rect.centerX),
      y: Math.round(zoomed.rect.centerY),
    },
    {
      name: 'screenshot / DPR',
      x: Math.round(screenshotCoordinate.x / dpr),
      y: Math.round(screenshotCoordinate.y / dpr),
    },
    ...formulas.map((formula) => ({
      name: formula.name,
      x: Math.round(formula.x),
      y: Math.round(formula.y),
    })),
    {
      name: 'screenshot / DPR / zoomRatio',
      x: Math.round(screenshotCoordinate.x / dpr / zoomRatio),
      y: Math.round(screenshotCoordinate.y / dpr / zoomRatio),
    },
  ];

  console.log('target before zoom:', JSON.stringify(targetBeforeZoom, null, 2));
  console.log('zoomed target:', JSON.stringify(zoomed, null, 2));
  console.log(
    'formula deltas from zoomed DOM rect center:',
    JSON.stringify(formulas, null, 2),
  );
  console.log('simulated screenshot coordinate:', screenshotCoordinate);
  console.log('candidates:', candidates);

  for (const candidate of candidates) {
    await page.evaluate(() => {
      const target = document.getElementById('target');
      if (target instanceof HTMLElement) {
        target.style.background = '#ff0000';
      }
    });
    await page.mouse.click(candidate.x, candidate.y);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const result = await page.evaluate(() => ({
      title: document.title,
      hit: document.getElementById('target')?.style.background,
      debug: document.getElementById('debug')?.textContent,
    }));
    console.log(candidate.name, '=>', result);
  }

  if (!keepOpen) {
    await client.detach().catch(() => {});
    await browser.close();
    return;
  }

  console.log('pinch and clicks sent. browser stays open.');

  await new Promise(() => {});
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
