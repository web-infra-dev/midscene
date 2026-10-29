import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from '@rstest/core';
import { type Browser, chromium } from 'playwright';
import puppeteer from 'puppeteer';
import type * as Inspector from '../../../shared/src/extractor';

declare global {
  interface Window {
    midscene_element_inspector: typeof Inspector;
  }
}

const inspectorPath = path.resolve(
  __dirname,
  '../../../shared/dist-inspect/htmlElement.js',
);

describe('shadow cache browser roundtrip', () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await chromium.launch({
      executablePath: puppeteer.executablePath(),
      headless: true,
    });
  }, 60_000);
  afterAll(async () => {
    await browser?.close();
  });

  for (const frameMode of ['none', 'document', 'shadow']) {
    test(`replays nested shadow targets after rebuilding the popup (iframe=${frameMode})`, async () => {
      const page = await browser.newPage();
      try {
        await page.setContent('<body><div id="mount"></div></body>');
        await page.addScriptTag({ path: inspectorPath });
        const result = await page.evaluate((frameMode) => {
          let doc = document;
          if (frameMode !== 'none') {
            const frame = document.createElement('iframe');
            if (frameMode === 'shadow') {
              const frameHost = document.createElement('frame-host');
              document.body.append(frameHost);
              frameHost.attachShadow({ mode: 'open' }).append(frame);
            } else {
              document.body.append(frame);
            }
            doc = frame.contentDocument!;
            doc.body.innerHTML = '<div id="mount"></div>';
          }
          const outer = doc.createElement('date-picker');
          doc.querySelector('#mount')!.append(outer);
          const root = outer.attachShadow({ mode: 'open' });
          root.innerHTML = '<calendar-popup></calendar-popup>';
          const popup = root.firstElementChild!.attachShadow({ mode: 'open' });
          const render = () => {
            popup.innerHTML = '<button>15</button><button>16</button>';
            for (const button of popup.querySelectorAll('button')) {
              button.onclick = () =>
                outer.setAttribute('data-selected', button.textContent!);
            }
          };
          render();
          const api = window.midscene_element_inspector;
          const points = [...popup.querySelectorAll('button')].map((button) => {
            const r = button.getBoundingClientRect();
            const frame = doc.defaultView!.frameElement as HTMLElement | null;
            const f = frame?.getBoundingClientRect();
            return {
              left: r.x + r.width / 2 + (f?.x || 0) + (frame?.clientLeft || 0),
              top: r.y + r.height / 2 + (f?.y || 0) + (frame?.clientTop || 0),
            };
          });
          const paths = points.map(
            (point) => api.getXpathsByPoint(point, false)![0],
          );
          const oldHostPath = api.getElementXpath(outer, false, true);
          const rejectsOldHost =
            api.getElementInfoByXpath(oldHostPath, { forCache: true }) === null;
          render();
          const located = api.getElementInfoByXpath(paths[0], {
            forCache: true,
          });
          if (!located)
            throw new Error('Shadow cache did not resolve after popup rebuild');
          const rect = located.rect;
          popup.querySelector('button')!.textContent = '17';
          const rejectsChangedTarget =
            api.getNodeInfoByXpath(paths[0]) === null;
          render();
          return { paths, rejectsOldHost, rejectsChangedTarget, rect };
        }, frameMode);
        expect(result.paths[0]).not.toBe(result.paths[1]);
        expect(result.rejectsOldHost).toBe(true);
        expect(result.rejectsChangedTarget).toBe(true);
        await page.mouse.click(
          result.rect.left + result.rect.width / 2,
          result.rect.top + result.rect.height / 2,
        );
        const selected =
          frameMode !== 'none'
            ? await page
                .frameLocator('iframe')
                .locator('date-picker')
                .getAttribute('data-selected')
            : await page.locator('date-picker').getAttribute('data-selected');
        expect(selected).toBe('15');
      } finally {
        await page.close();
      }
    });
  }
  test('keeps explicit hosts and text nodes usable while rejecting unsafe cache hits', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(
        '<div id="container"><date-picker></date-picker></div><button id="ordinary">A |shadow| B</button>',
      );
      await page.addScriptTag({ path: inspectorPath });
      const result = await page.evaluate(() => {
        const api = window.midscene_element_inspector;
        const host = document.querySelector('date-picker')!;
        const root = host.attachShadow({ mode: 'open' });
        root.innerHTML = '<button>15</button><slot></slot>';
        const button = root.querySelector('button')!;
        const hostPath = api.getElementXpath(host, false, false);
        const path = api.getElementXpath(button, false, true);
        const textPath = api.getElementXpath(button.firstChild!, false, true);
        const hostVisible = !!api.getElementInfoByXpath(hostPath);
        const ancestorVisible =
          !!api.getElementInfoByXpath('/html/body/div[1]');
        const textRoundtrip =
          api.getNodeInfoByXpath(textPath) === button.firstChild;
        const ordinaryRoundtrip =
          api.getNodeInfoByXpath(
            api.getElementXpath(
              document.querySelector('#ordinary')!,
              false,
              true,
            ),
          ) === document.querySelector('#ordinary');
        const rejectsOldHost =
          api.getElementInfoByXpath(hostPath, { forCache: true }) === null;
        const slotted = document.createElement('button');
        slotted.textContent = 'slotted';
        host.append(slotted);
        const slotVisible = !!api.getElementInfoByXpath(
          api.getElementXpath(slotted, false, true),
        );
        const overlay = document.createElement('div');
        overlay.style.cssText =
          'position:fixed;inset:0;z-index:999;background:red';
        document.body.append(overlay);
        const rejectsCovered =
          api.getElementInfoByXpath(path, { forCache: true }) === null;
        overlay.remove();
        button.after(button.cloneNode(true));
        const rejectsAmbiguous = api.getNodeInfoByXpath(path) === null;
        return {
          hostVisible,
          ancestorVisible,
          textRoundtrip,
          ordinaryRoundtrip,
          rejectsOldHost,
          slotVisible,
          rejectsCovered,
          rejectsAmbiguous,
        };
      });
      expect(result).toEqual({
        hostVisible: true,
        ancestorVisible: true,
        textRoundtrip: true,
        ordinaryRoundtrip: true,
        rejectsOldHost: true,
        slotVisible: true,
        rejectsCovered: true,
        rejectsAmbiguous: true,
      });
    } finally {
      await page.close();
    }
  });

  test('rejects finite ancestor animations until the cached geometry settles', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent('<date-picker></date-picker><aside></aside>');
      await page.addScriptTag({ path: inspectorPath });
      const result = await page.evaluate(() => {
        const api = window.midscene_element_inspector;
        const host = document.querySelector('date-picker')!;
        const root = host.attachShadow({ mode: 'open' });
        root.innerHTML = '<button>15</button>';
        const button = root.firstElementChild!;
        const path = api.getElementXpath(button, false, true);
        const animation = host.animate(
          [{ transform: 'translateX(0)' }, { transform: 'translateX(50px)' }],
          { duration: 10000, fill: 'forwards' },
        );
        const rejectsMoving =
          api.getElementInfoByXpath(path, { forCache: true }) === null;
        animation.finish();
        const acceptsSettled = !!api.getElementInfoByXpath(path, {
          forCache: true,
        });
        const unrelated = document
          .querySelector('aside')!
          .animate([{ opacity: 0 }, { opacity: 1 }], 10000);
        const ignoresUnrelated = !!api.getElementInfoByXpath(path, {
          forCache: true,
        });
        unrelated.cancel();
        return { rejectsMoving, acceptsSettled, ignoresUnrelated };
      });
      expect(result).toEqual({
        rejectsMoving: true,
        acceptsSettled: true,
        ignoresUnrelated: true,
      });
    } finally {
      await page.close();
    }
  });
});
