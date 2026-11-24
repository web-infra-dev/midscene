import { createServer } from 'node:net';
import { connectToTab, readTrialStorage, startUrl } from './browser.mjs';

const availablePort = async () => {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
};

/** Native Test fileSetup. Test owns cleanup; business reset belongs in beforeEach. */
export function webFileSetup({
  url,
  cdp,
  mode = cdp ? 'cdp-state' : 'new',
  headless = false,
  launch = {},
  agentOptions = {},
  prepareStart,
} = {}) {
  const start = startUrl(url);
  if (
    !['new', 'cdp-state', 'cdp-tab'].includes(mode) ||
    (mode !== 'new' && !cdp)
  )
    throw new Error('Expected new, or cdp-state/cdp-tab with a CDP endpoint.');
  return {
    name: 'replay-web',
    async setup({ signal, onTeardown }) {
      signal.throwIfAborted();
      const [{ chromium }, { PlaywrightBrowserAgent }] = await Promise.all([
        import('playwright'),
        import('@midscene/web/playwright/agent'),
      ]);
      let browser;
      let agent = null;
      let page;
      let endpoint = cdp;
      const borrowed = mode === 'cdp-tab';
      onTeardown(async () => {
        try {
          await agent?.destroy();
        } finally {
          await browser?.close();
        }
      });
      if (borrowed) ({ browser, page } = await connectToTab(cdp, start));
      else {
        const storageState =
          mode === 'cdp-state' ? await readTrialStorage(cdp, start) : undefined;
        const port = await availablePort();
        endpoint = `http://127.0.0.1:${port}`;
        browser = await chromium.launch({
          ...launch,
          headless,
          args: [
            ...(launch.args ?? []),
            `--remote-debugging-port=${port}`,
            '--remote-debugging-address=127.0.0.1',
          ],
        });
        const context = await browser.newContext({ storageState });
        page = await context.newPage();
        await page.goto(start, { waitUntil: 'domcontentloaded' });
      }
      signal.throwIfAborted();
      agent = await PlaywrightBrowserAgent.create(page.context(), {
        ...agentOptions,
        initialPage: page,
        generateReport: false,
      });
      const replaySession = {
        mode,
        endpoint,
        browserContext: borrowed ? 'shared' : 'fresh',
        tab: borrowed ? 'reused' : 'new',
        businessState: 'unknown',
        startUrl: start,
      };
      const observations = await prepareStart?.({ agent, signal });
      if (observations) replaySession.startObservations = observations;
      signal.throwIfAborted();
      return { agent, replaySession };
    },
  };
}

/** Obtain the actual active page, including popups, without guessing by URL. */
export async function describeWebPage(agent, context = {}) {
  const page = agent.activePage ?? agent.interface?.underlyingPage;
  if (!page)
    throw new Error('PREPARE_HOST_UNSUPPORTED: requires a Chromium Web Agent.');
  const playwright = typeof page.context === 'function';
  const endpoint =
    context.replaySession?.endpoint ??
    (typeof page.browser === 'function'
      ? page.browser().wsEndpoint?.()
      : undefined);
  if (!endpoint)
    throw new Error(
      'PREPARE_CDP_REQUIRED: expose replaySession.endpoint in fileSetup, or use @midscene/replay/web-setup.',
    );
  const session = playwright
    ? await page.context().newCDPSession(page)
    : await page.createCDPSession();
  try {
    const { targetInfo } = await session.send('Target.getTargetInfo');
    return {
      ...(context.replaySession ?? {
        mode: 'custom',
        browserContext: 'unknown',
        tab: 'unknown',
        businessState: 'unknown',
      }),
      endpoint,
      targetId: targetInfo.targetId,
      url: page.url(),
    };
  } finally {
    await session.detach();
  }
}
