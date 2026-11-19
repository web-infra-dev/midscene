import { expect, it, rs } from '@rstest/core';
import { chromium } from 'playwright';
import puppeteer from 'puppeteer';
import { WebPage as PlaywrightWebPage } from '../../src/playwright/page';

it.each([false, true])(
  'preserves movement failure when mouse release also fails: %s',
  async (releaseFails) => {
    const browser = await chromium.launch({
      executablePath: puppeteer.executablePath(),
      args: ['--no-sandbox'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(`
      <div style="width: 500px; height: 250px">Drag area</div>
      <script>
        document.addEventListener('mousedown', e => { document.body.dataset.down = String(e.buttons); });
        document.addEventListener('mouseup', e => { document.body.dataset.up = String(e.buttons); });
        document.addEventListener('mousemove', e => { document.body.dataset.move = String(e.buttons); });
      </script>`);
      const mouse = page.mouse;
      const move = mouse.move.bind(mouse);
      rs.spyOn(mouse, 'move')
        .mockImplementationOnce(move)
        .mockRejectedValueOnce(new Error('simulated movement failure'));
      const up = rs.spyOn(mouse, 'up');
      if (releaseFails)
        up.mockRejectedValueOnce(new Error('simulated mouse release failure'));
      const web = new PlaywrightWebPage(page);
      await expect(
        web.mouse.drag({ x: 35, y: 35 }, { x: 240, y: 35 }),
      ).rejects.toThrow('simulated movement failure');
      expect(up).toHaveBeenCalledTimes(1);
      if (releaseFails) return;

      await mouse.move(60, 60);
      await expect(
        page.locator('body').evaluate(({ dataset }) => ({ ...dataset })),
      ).resolves.toMatchObject({ down: '1', up: '0', move: '0' });
    } finally {
      await browser.close();
    }
  },
);
