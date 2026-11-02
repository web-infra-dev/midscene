import { randomUUID } from 'node:crypto';
import type { Size } from '@midscene/core';
import type { Page } from 'puppeteer';
import { debugPage } from './base-page';

// Serialized into each document. Subframes must not report their own dimensions.
/* istanbul ignore next */
function installSizeListener(name: string) {
  if (window !== window.top) return;
  const notify = (
    window as unknown as Record<string, (size: Size) => Promise<void>>
  )[name];
  let width = -1;
  let height = -1;
  const report = () => {
    if (width === window.innerWidth && height === window.innerHeight) return;
    width = window.innerWidth;
    height = window.innerHeight;
    return notify({ width, height }).catch(() => {});
  };
  window.addEventListener('resize', report);
  window.addEventListener(
    name,
    () => window.removeEventListener('resize', report),
    { once: true },
  );
  return report();
}

/** Navigation-aware, optional observation; failures never reject readiness. */
export function observePageSize(
  page: Page,
  onChange: (size: Size) => Promise<void>,
) {
  const name = `__midscene_resize_${randomUUID().replaceAll('-', '')}`;
  let disposed = false;
  let bindingInstalled = false;
  let scriptId: string | undefined;
  const cleanup = async () => {
    await Promise.allSettled([
      ...(scriptId ? [page.removeScriptToEvaluateOnNewDocument(scriptId)] : []),
      ...(bindingInstalled
        ? [
            /* istanbul ignore next -- serialized into the browser */
            page.evaluate(
              (eventName) => window.dispatchEvent(new Event(eventName)),
              name,
            ),
            page.removeExposedFunction(name),
          ]
        : []),
    ]);
  };
  const ready = (async () => {
    const viewport = page.viewport();
    if (viewport?.isMobile || viewport?.hasTouch) return;
    await page.exposeFunction(name, (size: Size) =>
      disposed ? undefined : onChange(size),
    );
    bindingInstalled = true;
    const script = await page.evaluateOnNewDocument(installSizeListener, name);
    scriptId = script.identifier;
    await page.evaluate(installSizeListener, name);
  })().catch(async (error) => {
    disposed = true;
    debugPage('Size observation unavailable: %s', error);
    await cleanup();
  });
  return {
    ready,
    async dispose() {
      disposed = true;
      await ready;
      await cleanup();
    },
  };
}
