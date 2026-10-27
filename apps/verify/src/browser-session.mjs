import { allowedUrl } from './config.mjs';

// Restrict blob resources to the same operator-approved origins as network
// requests. A blob URL embeds the origin of the creator. Allow data: resources
// for inline assets in existing previews, but never treat arbitrary blob:
// origins as inherently safe.
export function allowedBrowserRequestUrl(value, policy) {
  const url = new URL(value);
  if (url.protocol === 'data:') return url;
  if (url.protocol === 'blob:') {
    const embedded = value.slice('blob:'.length);
    return allowedUrl(embedded, policy);
  }
  return allowedUrl(value, policy);
}

export async function configurePage(page, policy) {
  await page.setViewport({ width: 1280, height: 900 });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    try {
      allowedBrowserRequestUrl(request.url(), policy);
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
