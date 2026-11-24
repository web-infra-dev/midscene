import type { Agent } from '@midscene/core';
import { replayError, withAbort } from './web-page';

/**
 * Popup following implemented with public BrowserAgent members only
 * (`activePage` and `setActivePage`) plus the underlying Playwright/Puppeteer
 * page API. The listener is registered before the single action and only
 * accepts a page opened by the current source page.
 */
type PlaywrightLikePage = {
  context(): {
    waitForEvent(
      event: 'page',
      options: {
        predicate: (page: PlaywrightLikePage) => Promise<boolean> | boolean;
        timeout: number;
      },
    ): Promise<PlaywrightLikePage>;
  };
  opener(): Promise<PlaywrightLikePage | null>;
};
type PuppeteerLikeTarget = {
  opener(): PuppeteerLikeTarget | undefined;
  type(): string;
  page(): Promise<unknown>;
};
type PuppeteerLikePage = {
  target(): PuppeteerLikeTarget;
  browser(): {
    targets(): PuppeteerLikeTarget[];
    waitForTarget(
      predicate: (target: PuppeteerLikeTarget) => boolean,
      options: { timeout: number },
    ): Promise<PuppeteerLikeTarget>;
  };
};
type PopupAgent = Agent & {
  activePage?: unknown;
  setActivePage?: (page: unknown) => Promise<unknown>;
};

function popupWaiter(source: unknown) {
  const page = source as Partial<PlaywrightLikePage & PuppeteerLikePage>;
  if (typeof page?.context === 'function' && typeof page.opener === 'function')
    return (timeout: number) =>
      (page as PlaywrightLikePage).context().waitForEvent('page', {
        predicate: async (candidate) => (await candidate.opener()) === source,
        timeout,
      });
  if (
    typeof page?.target === 'function' &&
    typeof page.browser === 'function'
  ) {
    const sourceTarget = (page as PuppeteerLikePage).target();
    const browser = (page as PuppeteerLikePage).browser();
    return async (timeout: number) => {
      // Puppeteer tests already-open targets as well as future ones. An
      // earlier popup from this same source cannot satisfy a new click.
      const existing = new Set(browser.targets());
      const target = await browser.waitForTarget(
        (candidate) =>
          !existing.has(candidate) &&
          candidate.type() === 'page' &&
          candidate.opener() === sourceTarget,
        { timeout },
      );
      const opened = await target.page();
      if (!opened) throw replayError('POPUP_NOT_A_PAGE');
      return opened;
    };
  }
  return undefined;
}

/** Throws before any dispatch when the host cannot follow a source popup. */
export function assertPopupHost(agent: Agent) {
  const host = agent as PopupAgent;
  if (typeof host.setActivePage !== 'function' || !popupWaiter(host.activePage))
    throw replayError('POPUP_UNSUPPORTED', {
      requires: 'a Playwright or Puppeteer BrowserAgent',
    });
}

export async function followPopup(
  agent: Agent,
  action: () => Promise<void>,
  timeoutMs: number,
  signal?: AbortSignal,
) {
  assertPopupHost(agent);
  const host = agent as PopupAgent;
  const source = host.activePage;
  const waiting = popupWaiter(source)!(timeoutMs);
  // The action may fail before the popup times out; avoid an unhandled rejection.
  waiting.catch(() => {});
  await action();
  let page: unknown;
  try {
    page = await withAbort(waiting, signal);
  } catch (cause) {
    signal?.throwIfAborted();
    throw Object.assign(replayError('POPUP_TIMEOUT', { timeoutMs }), {
      cause,
    });
  }
  signal?.throwIfAborted();
  await host.setActivePage!(page);
  return page;
}
