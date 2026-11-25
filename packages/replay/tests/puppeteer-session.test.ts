import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PuppeteerBrowserAgent } from '@midscene/web/puppeteer';
import { launchPuppeteerPage } from '@midscene/web/puppeteer-agent-launcher';
import { expect, it, rs } from '@rstest/core';
import { defineStep, runReplayStep, withReplay } from '../src/index';

it('follows a fresh Puppeteer popup from the source and checks its destination', async () => {
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end(
      request.url === '/'
        ? `<a id="existing" href="/existing" target="_blank">Previous</a>
           <a id="good" href="/expected" target="_blank">Details</a>
           <a id="wrong" href="/unexpected" target="_blank">Other details</a>
           <output>0</output><script>
             document.addEventListener('click', () => {
               const out = document.querySelector('output');
               out.textContent = String(Number(out.textContent) + 1);
             });
           </script>`
        : `<h1>${request.url}</h1>`,
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const { page: source } = await launchPuppeteerPage({
      url: `${origin}/`,
      waitForNetworkIdle: { timeout: 0 },
    });
    try {
      const browser = source.browser();
      const agent = await PuppeteerBrowserAgent.create(browser, {
        initialPage: source,
        generateReport: false,
        modelConfig: {},
      });
      try {
        await source.click('#existing');
        await browser.waitForTarget(
          (target) => target.url() === `${origin}/existing`,
        );
        const other = await browser.newPage();
        await other.goto(`${origin}/unrelated`);
        const originalCall = agent.callActionInActionSpace.bind(agent);
        const dispatch = rs
          .spyOn(agent, 'callActionInActionSpace')
          .mockImplementation(async (...args) => {
            await other.evaluate((url) => {
              window.open(url, '_blank');
            }, `${origin}/decoy`);
            await browser.waitForTarget(
              (target) => target.url() === `${origin}/decoy`,
            );
            return originalCall(...args);
          });

        await runReplayStep(
          agent,
          defineStep({
            run: (rp) =>
              rp.tap('Open details', {
                candidates: [{ xpath: '//a[@id="good"]' }],
                opensPage: { url: `${origin}/expected` },
              }),
            done: (rp) => rp.expect({ xpath: '//h1' }, { text: '/expected' }),
          }),
          { requires: { popups: true } },
        );
        expect(agent.activePage.url()).toBe(`${origin}/expected`);
        expect(await source.$eval('output', (out) => out.textContent)).toBe(
          '2',
        );
        dispatch.mockRestore();

        await agent.setActivePage(source);
        await expect(
          withReplay(agent).tap('Reject a wrong destination', {
            candidates: [{ xpath: '//a[@id="wrong"]' }],
            // Allow popup creation and action screenshots to complete before
            // asserting the wrong destination, including on a cold CI browser.
            opensPage: { url: `${origin}/expected`, timeoutMs: 3000 },
          }),
        ).rejects.toMatchObject({ code: 'WAIT_TIMEOUT' });
        expect(agent.activePage.url()).toBe(`${origin}/unexpected`);
        expect(await source.$eval('output', (out) => out.textContent)).toBe(
          '3',
        );
      } finally {
        await agent.destroy();
      }
    } finally {
      await source.browser().close();
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}, 30_000);
