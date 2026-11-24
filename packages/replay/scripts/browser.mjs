export function startUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim())
    throw new Error('START_URL_REQUIRED');
  const url = new URL(raw);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error(
      'INVALID_START_URL: expected an HTTP(S) URL without credentials',
    );
  return url.href;
}

export function validateCdp(cdp) {
  if (cdp === 'msedge' || cdp === 'chrome') return;
  const url = URL.canParse(cdp) && new URL(cdp);
  if (
    !url ||
    !['http:', 'ws:'].includes(url.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password
  )
    throw new Error('--cdp expects msedge, chrome or a local HTTP/WS endpoint');
}

export async function connectToTab(cdp, url) {
  validateCdp(cdp);
  const { chromium } = await import('playwright');
  const browser = await chromium
    .connectOverCDP(cdp, { noDefaults: true })
    .catch(() => {
      const hint =
        cdp === 'msedge' || cdp === 'chrome'
          ? `Enable remote debugging at ${cdp === 'msedge' ? 'edge' : 'chrome'}://inspect/#remote-debugging and allow the connection in the browser.`
          : 'Check that the local browser is running and listening on the supplied CDP endpoint.';
      throw new Error(`CDP_CONNECT_FAILED: ${hint}`);
    });
  const pages = browser
    .contexts()
    .flatMap((context) => context.pages())
    .filter((page) => page.url() === url);
  if (pages.length === 1) return { browser, page: pages[0] };
  await browser.close(); // For CDP browsers this disconnects the client.
  if (pages.length > 1)
    throw new Error(
      'CDP_TAB_AMBIGUOUS: keep only one tab with the exact start URL',
    );
  throw new Error(
    'CDP_TAB_NOT_FOUND: open the exact start URL in the signed-in browser and retry',
  );
}

/** @returns {ReturnType<import('playwright').BrowserContext['storageState']>} */
export async function readTrialStorage(cdp, url) {
  const { browser, page } = await connectToTab(cdp, url);
  try {
    const origin = new URL(url).origin;
    const session = await page.context().newCDPSession(page);
    const [{ cookies }, localStorage] = await Promise.all([
      // Query the selected tab's profile and URL directly, including HttpOnly cookies.
      session.send('Network.getCookies', { urls: [url] }),
      page.evaluate((origin) => {
        if (location.origin !== origin)
          throw new Error('CDP_TAB_ORIGIN_CHANGED');
        return Object.entries(window.localStorage).map(([name, value]) => ({
          name,
          value,
        }));
      }, origin),
    ]);
    return {
      cookies: cookies
        .filter((cookie) => !cookie.partitionKeyOpaque)
        .map(
          ({
            name,
            value,
            domain,
            path,
            expires,
            httpOnly,
            secure,
            sameSite = 'Lax',
            partitionKey,
          }) => ({
            name,
            value,
            domain,
            path,
            expires,
            httpOnly,
            secure,
            sameSite,
            ...(partitionKey && {
              partitionKey: partitionKey.topLevelSite,
              _crHasCrossSiteAncestor: partitionKey.hasCrossSiteAncestor,
            }),
          }),
        ),
      origins: [{ origin, localStorage }],
    };
  } finally {
    await browser.close();
  }
}
