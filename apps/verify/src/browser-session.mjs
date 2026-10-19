import { allowedUrl } from './config.mjs';

export async function configurePage(page, policy) {
  await page.setViewport({ width: 1280, height: 900 });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    try {
      const url = request.url();
      if (!url.startsWith('data:') && !url.startsWith('blob:'))
        allowedUrl(url, policy);
      void request.continue().catch(() => {});
    } catch {
      void request.abort().catch(() => {});
    }
  });
  page.on('popup', (popup) => {
    void popup.close().catch(() => {});
  });
  return page;
}

// A context owns cookies, localStorage and IndexedDB for exactly one criterion.
// Steps within that criterion retain storage, including reload/persistence checks.
export async function openIsolatedPage(browser, policy) {
  const context = await browser.createBrowserContext();
  try {
    const page = await configurePage(await context.newPage(), policy);
    return { page, close: () => context.close() };
  } catch (error) {
    await context.close();
    throw error;
  }
}
