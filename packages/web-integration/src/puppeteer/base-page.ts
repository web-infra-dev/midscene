import { Buffer } from 'node:buffer';
import type { WebPageAgentOpt } from '@/web-element';
import type {
  DeviceAction,
  ElementCacheFeature,
  ElementTreeNode,
  Point,
  Rect,
  Size,
} from '@midscene/core';
import type {
  AbstractInterface,
  DeviceFrameRef,
  DeviceFrameSource,
  MjpegStreamHandle,
  MjpegStreamOptions,
} from '@midscene/core/device';
import { sleep } from '@midscene/core/utils';
import {
  DEFAULT_WAIT_FOR_NAVIGATION_TIMEOUT,
  DEFAULT_WAIT_FOR_NETWORK_IDLE_CONCURRENCY,
  DEFAULT_WAIT_FOR_NETWORK_IDLE_TIMEOUT,
} from '@midscene/shared/constants';
import type { ElementInfo } from '@midscene/shared/extractor';
import { treeToList } from '@midscene/shared/extractor';
import {
  createImgBase64ByFormat,
  imageInfoOfBase64,
} from '@midscene/shared/img';
import { type DebugFunction, getDebug } from '@midscene/shared/logger';
import {
  getElementInfosScriptContent,
  getExtraReturnLogic,
} from '@midscene/shared/node';
import { assert } from '@midscene/shared/utils';
import type { Page as PlaywrightPage } from 'playwright';
import type { CDPSession, Protocol, Page as PuppeteerPage } from 'puppeteer';
import {
  type CacheFeatureOptions,
  type WebElementCacheFeature,
  buildRectFromElementInfo,
  judgeOrderSensitive,
  sanitizeXpaths,
} from '../common/cache-helper';
import {
  type KeyInput,
  type MouseButton,
  commonWebActionsForWebPage,
} from '../web-page';

export const debugPage = getDebug('web:page');
const warnPage = getDebug('web:page', { console: true });

export const BROWSER_NAVIGATION_ERROR_PATTERN =
  /execution context was destroyed|frame was detached|target closed|page has been closed|context was destroyed|net::ERR_ABORTED/i;

const CDP_SCREENCAST_QUALITY = 70;
const CDP_SCREENCAST_EVERY_NTH_FRAME = 1;
// JPEG encoders may round one edge after applying a device scale factor. A
// couple of output pixels is harmless; a changed viewport is much larger.
const MAX_FRAME_ASPECT_RATIO_PIXEL_ERROR = 2;
// Empirical follow-up window for async UI paints after input actions.
// The immediate refresh can happen before React/state transitions settle.
const VISUAL_UPDATE_FOLLOWUP_DELAY_MS = 800;
// Upper bound for the "wait for browser repaint" promise inside
// flushPendingVisualUpdate so the call does not hang forever if the page
// stops scheduling animation frames (e.g. backgrounded tab).
const FLUSH_VISUAL_UPDATE_TIMEOUT_MS = 50;
const DATA_URL_BASE64_PREFIX = /^data:image\/\w+;base64,/;

type ScreencastFrameEvent = {
  data: string;
  sessionId: number;
  metadata?: {
    deviceWidth?: number;
    deviceHeight?: number;
  };
};

type PageCdpSession = {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
  detach(): Promise<void>;
};

type ScreencastCdpSession = PageCdpSession & {
  on(
    event: 'Page.screencastFrame',
    handler: (event: ScreencastFrameEvent) => void,
  ): void;
  off?(
    event: 'Page.screencastFrame',
    handler: (event: ScreencastFrameEvent) => void,
  ): void;
  removeListener?(
    event: 'Page.screencastFrame',
    handler: (event: ScreencastFrameEvent) => void,
  ): void;
};

function isClosedPageError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return /target page, context or browser has been closed|page has been closed|target closed|browser has been closed/i.test(
    error.message,
  );
}

function isTransientNavigationError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return /execution context was destroyed|frame was detached|context was destroyed|net::ERR_ABORTED/i.test(
    error.message,
  );
}

function hasMatchingFrameAspectRatio(
  frameSize: Size,
  viewportSize: Size,
): boolean {
  if (
    !Number.isFinite(frameSize.width) ||
    !Number.isFinite(frameSize.height) ||
    frameSize.width <= 0 ||
    frameSize.height <= 0
  ) {
    // Older Chromium versions may omit useful metadata. Do not reject an
    // otherwise usable frame solely because it cannot be diagnosed.
    return true;
  }

  const expectedFrameHeight =
    (frameSize.width * viewportSize.height) / viewportSize.width;
  return (
    Math.abs(frameSize.height - expectedFrameHeight) <=
    MAX_FRAME_ASPECT_RATIO_PIXEL_ERROR
  );
}

function isJpegStartOfFrameMarker(marker: number): boolean {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

/**
 * Reads JPEG dimensions without decoding pixels. CDP already sends JPEG for
 * screencast frames, so this is cheap enough to validate every frame.
 */
function jpegSizeFromBase64(data: string): Size | undefined {
  const bytes = Buffer.from(data.replace(DATA_URL_BASE64_PREFIX, ''), 'base64');
  if (bytes.length < 10 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return undefined;
  }

  let offset = 2;
  while (offset + 9 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (
      marker === undefined ||
      marker === 0x00 ||
      marker === 0xd8 ||
      marker === 0xd9 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      continue;
    }
    if (offset + 2 > bytes.length) return undefined;
    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      return undefined;
    }
    if (isJpegStartOfFrameMarker(marker)) {
      return {
        height: bytes.readUInt16BE(offset + 3),
        width: bytes.readUInt16BE(offset + 5),
      };
    }
    offset += segmentLength;
  }

  return undefined;
}

export class Page<
  AgentType extends 'puppeteer' | 'playwright',
  InterfaceType extends PuppeteerPage | PlaywrightPage,
> implements AbstractInterface
{
  underlyingPage: InterfaceType;
  protected waitForNavigationTimeout: number;
  protected waitForNetworkIdleTimeout: number;
  private viewportSize?: Size;
  private onBeforeInvokeAction?: AbstractInterface['beforeInvokeAction'];
  private onAfterInvokeAction?: AbstractInterface['afterInvokeAction'];
  private customActions?: DeviceAction<any>[];
  private enableTouchEventsInActionSpace: boolean;
  private keyboardTypeDelay: number | undefined;
  private puppeteerFileChooserSession?: CDPSession;
  private puppeteerFileChooserHandler?: (
    event: Protocol.Page.FileChooserOpenedEvent,
  ) => Promise<void>;
  private playwrightNetworkIdleWarningShown = false;
  private activeMjpegStream?: {
    hasReceivedScreencastFrame: boolean;
    expectedViewportSize?: Size;
    token: symbol;
    onFrame: MjpegStreamOptions['onFrame'];
    onError?: MjpegStreamOptions['onError'];
  };
  private visualUpdateFlushInFlight: Promise<void> | null = null;
  private visualUpdateFlushQueued = false;
  private visualUpdateFollowupTimer?: ReturnType<typeof setTimeout>;
  interfaceType: AgentType;

  actionSpace(): DeviceAction[] {
    const defaultActions = commonWebActionsForWebPage(
      this,
      this.enableTouchEventsInActionSpace,
    );
    const customActions = this.customActions || [];
    return [...defaultActions, ...customActions];
  }

  private async evaluate<R>(
    pageFunction: string | ((...args: any[]) => R | Promise<R>),
    arg?: any,
  ): Promise<R> {
    let result: R;
    debugPage('evaluate function begin');
    if (this.interfaceType === 'puppeteer') {
      result = await (this.underlyingPage as PuppeteerPage).evaluate(
        pageFunction,
        arg,
      );
    } else {
      result = await (this.underlyingPage as PlaywrightPage).evaluate(
        pageFunction,
        arg,
      );
    }
    debugPage('evaluate function end');
    return result;
  }

  constructor(
    underlyingPage: InterfaceType,
    interfaceType: AgentType,
    opts?: WebPageAgentOpt,
  ) {
    this.underlyingPage = underlyingPage;
    this.interfaceType = interfaceType;
    this.waitForNavigationTimeout =
      opts?.waitForNavigationTimeout ?? DEFAULT_WAIT_FOR_NAVIGATION_TIMEOUT;
    this.waitForNetworkIdleTimeout =
      opts?.waitForNetworkIdleTimeout ?? DEFAULT_WAIT_FOR_NETWORK_IDLE_TIMEOUT;
    this.onBeforeInvokeAction = opts?.beforeInvokeAction;
    this.onAfterInvokeAction = opts?.afterInvokeAction;
    this.customActions = opts?.customActions;
    this.enableTouchEventsInActionSpace =
      opts?.enableTouchEventsInActionSpace ?? false;
    this.keyboardTypeDelay = opts?.keyboardTypeDelay;
  }

  async evaluateJavaScript<T = any>(script: string): Promise<T> {
    return this.evaluate(script);
  }

  async waitForNavigation(
    moment:
      | 'screenshot'
      | 'getElementsInfo'
      | 'getElementsNodeTree'
      | 'afterInvokeAction',
    actionName?: string,
  ) {
    if (this.waitForNavigationTimeout === 0) {
      debugPage('waitForNavigation timeout is 0, skip waiting');
      return;
    }

    // issue: https://github.com/puppeteer/puppeteer/issues/3323
    if (
      this.interfaceType === 'puppeteer' ||
      this.interfaceType === 'playwright'
    ) {
      debugPage(
        `waitForNavigation begin at moment ${moment} with timeout: ${this.waitForNavigationTimeout} and actionName: ${actionName}`,
      );
      try {
        await (this.underlyingPage as PuppeteerPage).waitForSelector('html', {
          timeout: this.waitForNavigationTimeout,
        });
      } catch (error) {
        // Ignore timeout error, continue execution
        console.warn(
          '[midscene:warning] Waiting for the "navigation" has timed out, but Midscene will continue execution. Please check https://midscenejs.com/faq.html#customize-the-network-timeout for more information on customizing the network timeout',
        );
      }
      debugPage('waitForNavigation end');
    }
  }

  async waitForNetworkIdle(
    moment: 'afterInvokeAction',
    actionName?: string,
  ): Promise<void> {
    if (this.interfaceType === 'puppeteer') {
      if (this.waitForNetworkIdleTimeout === 0) {
        debugPage('waitForNetworkIdle timeout is 0, skip waiting');
        return;
      }

      debugPage(
        `waitForNetworkIdle begin at moment ${moment} with timeout: ${this.waitForNetworkIdleTimeout} and concurrency: ${DEFAULT_WAIT_FOR_NETWORK_IDLE_CONCURRENCY} and actionName: ${actionName}`,
      );
      try {
        await (this.underlyingPage as PuppeteerPage).waitForNetworkIdle({
          idleTime: 200,
          concurrency: DEFAULT_WAIT_FOR_NETWORK_IDLE_CONCURRENCY,
          timeout: this.waitForNetworkIdleTimeout,
        });
      } catch (error) {
        // Ignore timeout error, continue execution
        console.warn(
          '[midscene:warning] Waiting for the "network idle" has timed out, but Midscene will continue execution. Please check https://midscenejs.com/faq.html#customize-the-network-timeout for more information on customizing the network timeout',
        );
      }
      debugPage('waitForNetworkIdle end');
    } else {
      if (!this.playwrightNetworkIdleWarningShown) {
        this.playwrightNetworkIdleWarningShown = true;
        warnPage(
          '[midscene:warning] waitForNetworkIdle is skipped for Playwright. Playwright does not provide an equivalent underlying capability for the intended post-action network idle behavior here.',
        );
      }
    }
  }

  // @deprecated
  async getElementsInfo() {
    // const scripts = await getExtraReturnLogic();
    // const captureElementSnapshot = await this.evaluate(scripts);
    // return captureElementSnapshot as ElementInfo[];
    await this.waitForNavigation('getElementsInfo');
    debugPage('getElementsInfo begin');
    const tree = await this.getElementsNodeTree();
    debugPage('getElementsInfo end');
    return treeToList(tree);
  }

  private async getXpathsByPoint(point: Point, isOrderSensitive: boolean) {
    const elementInfosScriptContent = getElementInfosScriptContent();

    return this.evaluateJavaScript(
      `${elementInfosScriptContent}midscene_element_inspector.getXpathsByPoint({left: ${point.left}, top: ${point.top}}, ${isOrderSensitive})`,
    );
  }

  private async getElementInfoByXpath(xpath: string) {
    const elementInfosScriptContent = getElementInfosScriptContent();

    return this.evaluateJavaScript(
      `${elementInfosScriptContent}midscene_element_inspector.getElementInfoByXpath(${JSON.stringify(xpath)})`,
    );
  }

  async cacheFeatureForPoint(
    center: [number, number],
    options?: CacheFeatureOptions,
  ): Promise<ElementCacheFeature> {
    const point: Point = { left: center[0], top: center[1] };

    try {
      const isOrderSensitive = await judgeOrderSensitive(options, debugPage);
      const xpaths = await this.getXpathsByPoint(point, isOrderSensitive);
      const sanitized = sanitizeXpaths(xpaths);
      if (!sanitized.length) {
        debugPage('cacheFeatureForPoint: no xpath found at point %o', center);
      }
      return { xpaths: sanitized };
    } catch (error) {
      debugPage('cacheFeatureForPoint failed: %s', error);
      return { xpaths: [] };
    }
  }

  async rectMatchesCacheFeature(feature: ElementCacheFeature): Promise<Rect> {
    const xpaths = sanitizeXpaths((feature as WebElementCacheFeature).xpaths);
    debugPage('rectMatchesCacheFeature: trying %d xpath(s)', xpaths.length);

    for (const xpath of xpaths) {
      try {
        debugPage('rectMatchesCacheFeature: evaluating xpath: %s', xpath);
        const elementInfo = await this.getElementInfoByXpath(xpath);
        if (elementInfo?.rect) {
          debugPage(
            'rectMatchesCacheFeature: found element, rect: %o',
            elementInfo.rect,
          );
          return buildRectFromElementInfo(elementInfo);
        }
        debugPage(
          'rectMatchesCacheFeature: element found but no rect (elementInfo: %o)',
          elementInfo,
        );
      } catch (error) {
        debugPage(
          'rectMatchesCacheFeature failed for xpath %s: %s',
          xpath,
          error,
        );
      }
    }

    throw new Error(
      `No matching element rect found for the provided cache feature (tried ${xpaths.length} xpath(s): ${xpaths.join(', ')})`,
    );
  }

  async getElementsNodeTree() {
    // ref: packages/web-integration/src/playwright/ai-fixture.ts popup logic
    // During test execution, a new page might be opened through a connection, and the page remains confined to the same page instance.
    // The page may go through opening, closing, and reopening; if the page is closed, evaluate may return undefined, which can lead to errors.
    await this.waitForNavigation('getElementsNodeTree');
    const scripts = await getExtraReturnLogic(true);
    assert(scripts, 'scripts should be set before writing report in browser');
    const startTime = Date.now();
    const captureElementSnapshot = await this.evaluate(scripts);
    const endTime = Date.now();
    debugPage(`getElementsNodeTree end, cost: ${endTime - startTime}ms`);
    return captureElementSnapshot as ElementTreeNode<ElementInfo>;
  }

  async size(): Promise<Size> {
    if (this.viewportSize) return this.viewportSize;
    /* istanbul ignore next -- closure is serialized to the browser realm via page.evaluate, where istanbul's cov_* counter does not exist */
    const sizeInfo: Size = await this.evaluate(() => {
      return {
        width: window.innerWidth,
        height: window.innerHeight,
      };
    });
    this.viewportSize = sizeInfo;
    return sizeInfo;
  }

  async screenshotBase64(): Promise<string> {
    const imgType = 'jpeg' as const;
    const quality = 90;
    const startTime = Date.now();
    debugPage('screenshotBase64 begin');

    let base64: string;
    if (this.interfaceType === 'puppeteer') {
      const result = await (this.underlyingPage as PuppeteerPage).screenshot({
        type: imgType,
        quality,
        encoding: 'base64',
      });
      base64 = createImgBase64ByFormat(imgType, result);
    } else if (this.interfaceType === 'playwright') {
      const page = this.underlyingPage as PlaywrightPage;
      try {
        const buffer = await page.screenshot({
          type: imgType,
          quality,
          timeout: 10 * 1000,
        });
        base64 = createImgBase64ByFormat(imgType, buffer.toString('base64'));
      } catch (error) {
        if (isClosedPageError(error) || page.isClosed()) {
          throw error;
        }

        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn(
          `[Midscene] Playwright screenshot failed: ${errorMsg}. Falling back to CDP screenshot.`,
        );
        debugPage(
          'playwright screenshot failed, trying CDP fallback: %s',
          error,
        );
        base64 = await this.screenshotBase64ByPlaywrightCdp(imgType, quality);
      }
    } else {
      throw new Error('Unsupported page type for screenshot');
    }
    const endTime = Date.now();
    debugPage(`screenshotBase64 end, cost: ${endTime - startTime}ms`);
    return base64;
  }

  private async screenshotBase64ByPlaywrightCdp(
    imgType: 'jpeg' | 'png',
    quality?: number,
  ) {
    const client = await this.createPageCdpSession('CDP screenshot fallback');
    try {
      const result = (await new Promise<{
        data: string;
      }>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('CDP screenshot timeout after 10000ms.'));
        }, 10 * 1000);

        client
          .send('Page.captureScreenshot', {
            format: imgType,
            ...(quality ? { quality } : {}),
          })
          .then(
            (value) => {
              clearTimeout(timeoutId);
              resolve(value as { data: string });
            },
            (error) => {
              clearTimeout(timeoutId);
              reject(error);
            },
          );
      })) as {
        data: string;
      };
      return createImgBase64ByFormat(imgType, result.data);
    } finally {
      void client.detach().catch((error) => {
        debugPage('failed to detach CDP screenshot session: %s', error);
      });
    }
  }

  private async createPageCdpSession(
    featureName: string,
  ): Promise<PageCdpSession> {
    if (this.interfaceType === 'puppeteer') {
      const page = this.underlyingPage as PuppeteerPage;
      // Puppeteer has exposed CDP sessions through both page.createCDPSession()
      // and the historical page.target().createCDPSession() API. Support both
      // here so CDP-backed actions work across Puppeteer versions and wrapped
      // page objects that may only expose one of the two shapes.
      const pageWithCdp = page as PuppeteerPage & {
        createCDPSession?: () => Promise<unknown>;
      };
      if (typeof pageWithCdp.createCDPSession === 'function') {
        return (await pageWithCdp.createCDPSession()) as unknown as PageCdpSession;
      }

      const target = page.target?.();
      if (typeof target?.createCDPSession === 'function') {
        return (await target.createCDPSession()) as unknown as PageCdpSession;
      }

      throw new Error(
        `${featureName} requires a browser page with CDP session support.`,
      );
    }

    const page = this.underlyingPage as PlaywrightPage;
    const browserName = page.context().browser()?.browserType().name();
    if (browserName && browserName !== 'chromium') {
      throw new Error(
        `${featureName} requires Chromium-based browser, but current browser is "${browserName}".`,
      );
    }

    return (await page
      .context()
      .newCDPSession(page)) as unknown as PageCdpSession;
  }

  async waitForDomQuiet(opts?: {
    quietMs?: number;
    timeoutMs?: number;
    target?: ElementInfo;
  }): Promise<void> {
    const quietMs = opts?.quietMs ?? 100;
    const timeoutMs = opts?.timeoutMs ?? 500;
    const targetCenter = opts?.target?.center;
    try {
      /* istanbul ignore next -- closure is serialized to the browser realm via page.evaluate, where istanbul's cov_* counter does not exist */
      await this.evaluate(
        ([q, total, center]: [number, number, [number, number] | undefined]) =>
          new Promise<void>((resolve) => {
            let settleTimer: ReturnType<typeof setTimeout> | undefined;
            const done = () => {
              obs.disconnect();
              clearTimeout(hardTimer);
              if (settleTimer) clearTimeout(settleTimer);
              resolve();
            };
            const target =
              center && Number.isFinite(center[0]) && Number.isFinite(center[1])
                ? document.elementFromPoint(center[0], center[1])
                : null;
            const observeRoot =
              target?.closest('form') ?? target?.parentElement ?? document.body;
            const obs = new MutationObserver(() => {
              if (settleTimer) clearTimeout(settleTimer);
              settleTimer = setTimeout(done, q);
            });
            obs.observe(observeRoot, {
              childList: true,
              subtree: true,
              attributes: true,
              characterData: true,
            });
            const hardTimer = setTimeout(done, total);
          }),
        [quietMs, timeoutMs, targetCenter],
      );
    } catch (error) {
      debugPage('waitForDomQuiet failed: %s', error);
    }
  }

  async flushPendingVisualUpdate(): Promise<void> {
    const activeStream = this.activeMjpegStream;
    // A direct screenshot is only the fallback for an idle page that has not
    // emitted its first CDP screencast frame. Mixing it with screencast frames
    // can alternate between two viewport sizes in headed browsers, making the
    // preview visibly resize from one MJPEG frame to the next.
    if (!activeStream || activeStream.hasReceivedScreencastFrame) return;

    try {
      /* istanbul ignore next -- closure is serialized to the browser realm via page.evaluate, where istanbul's cov_* counter does not exist */
      await this.evaluate(
        (timeoutMs: number) =>
          new Promise<void>((resolve) => {
            let done = false;
            const finish = () => {
              if (done) return;
              done = true;
              resolve();
            };
            setTimeout(finish, timeoutMs);
            requestAnimationFrame(() => requestAnimationFrame(finish));
          }),
        FLUSH_VISUAL_UPDATE_TIMEOUT_MS,
      );
      if (
        this.activeMjpegStream?.token !== activeStream.token ||
        activeStream.hasReceivedScreencastFrame
      ) {
        return;
      }
      const dataUrl = await this.screenshotBase64();
      if (
        this.activeMjpegStream?.token !== activeStream.token ||
        activeStream.hasReceivedScreencastFrame
      ) {
        return;
      }
      const frameSize = await imageInfoOfBase64(dataUrl);
      if (
        activeStream.expectedViewportSize &&
        !hasMatchingFrameAspectRatio(
          frameSize,
          activeStream.expectedViewportSize,
        )
      ) {
        throw new Error(
          `Screenshot fallback aspect ratio mismatch: expected viewport ${activeStream.expectedViewportSize.width}x${activeStream.expectedViewportSize.height}, received ${frameSize.width}x${frameSize.height}`,
        );
      }
      debugPage(
        'screencast fallback screenshot size %dx%d for viewport %dx%d',
        frameSize.width,
        frameSize.height,
        activeStream.expectedViewportSize?.width ?? 0,
        activeStream.expectedViewportSize?.height ?? 0,
      );
      // MjpegStreamFrame.data is contractually bare base64; screenshotBase64()
      // returns a `data:image/...;base64,...` URL, so strip the prefix here.
      activeStream.onFrame({
        data: dataUrl.replace(DATA_URL_BASE64_PREFIX, ''),
        contentType: 'image/jpeg',
      });
    } catch (error) {
      debugPage('screencast visual refresh failed: %s', error);
      if (isTransientNavigationError(error) && !isClosedPageError(error)) {
        return;
      }
      activeStream.onError?.(error);
    }
  }

  private queuePendingVisualUpdate(): void {
    if (!this.activeMjpegStream) {
      return;
    }

    if (this.visualUpdateFlushInFlight) {
      this.visualUpdateFlushQueued = true;
      return;
    }

    const flushTask = (async () => {
      do {
        this.visualUpdateFlushQueued = false;
        await this.flushPendingVisualUpdate();
      } while (this.visualUpdateFlushQueued);
    })()
      .catch((error) => {
        debugPage('scheduled screencast visual refresh failed: %s', error);
      })
      .finally(() => {
        if (this.visualUpdateFlushInFlight === flushTask) {
          this.visualUpdateFlushInFlight = null;
        }
        this.visualUpdateFlushQueued = false;
      });

    this.visualUpdateFlushInFlight = flushTask;
  }

  schedulePendingVisualUpdate(): void {
    if (!this.activeMjpegStream) {
      return;
    }

    this.queuePendingVisualUpdate();

    if (this.visualUpdateFollowupTimer) {
      clearTimeout(this.visualUpdateFollowupTimer);
    }
    this.visualUpdateFollowupTimer = setTimeout(() => {
      this.visualUpdateFollowupTimer = undefined;
      this.queuePendingVisualUpdate();
    }, VISUAL_UPDATE_FOLLOWUP_DELAY_MS);
  }

  async startMjpegStream(
    options: MjpegStreamOptions,
  ): Promise<MjpegStreamHandle> {
    const { signal, onFrame, onError } = options;
    if (typeof this.underlyingPage.bringToFront === 'function') {
      await this.underlyingPage.bringToFront();
    }
    const client = (await this.createPageCdpSession(
      'CDP screencast',
    )) as ScreencastCdpSession;
    let stopped = false;
    let expectedViewportSize: Size | undefined;
    let hasLoggedScreencastFrameSize = false;
    let hasReportedInvalidScreencastFrame = false;
    const streamToken = Symbol('mjpeg-stream');

    const reportStreamError = (error: unknown) => {
      try {
        onError?.(error);
      } catch (callbackError) {
        debugPage('mjpeg onError callback threw: %s', callbackError);
      }
    };

    const handleFrame = (event: ScreencastFrameEvent) => {
      void (async () => {
        if (stopped) return;
        const compositorFrameSize = {
          width: event.metadata?.deviceWidth ?? 0,
          height: event.metadata?.deviceHeight ?? 0,
        };
        // JPEG dimensions are what the preview actually displays. Prefer
        // them over compositor metadata: the latter may be stale while a
        // viewport resize or navigation is in flight.
        const frameSize = jpegSizeFromBase64(event.data) ?? compositorFrameSize;
        const isExpectedFrame =
          !expectedViewportSize ||
          hasMatchingFrameAspectRatio(frameSize, expectedViewportSize);

        if (!hasLoggedScreencastFrameSize && expectedViewportSize) {
          hasLoggedScreencastFrameSize = true;
          debugPage(
            'CDP screencast JPEG size %dx%d (metadata %dx%d) for viewport %dx%d',
            frameSize.width,
            frameSize.height,
            compositorFrameSize.width,
            compositorFrameSize.height,
            expectedViewportSize.width,
            expectedViewportSize.height,
          );
        }

        if (!isExpectedFrame) {
          if (!hasReportedInvalidScreencastFrame) {
            hasReportedInvalidScreencastFrame = true;
            debugPage(
              'CDP screencast frame aspect ratio mismatch: expected viewport %dx%d, received %dx%d; using screenshot fallback until the screencast recovers',
              expectedViewportSize?.width ?? 0,
              expectedViewportSize?.height ?? 0,
              frameSize.width,
              frameSize.height,
            );
            // Do not turn a single malformed CDP frame into a terminal stream
            // error. Chromium keeps the last decoded multipart image when a
            // response ends, so the renderer may never fire <img onError> or
            // remount the stream. Keep the connection alive and push a direct
            // screenshot instead; a later valid CDP frame will resume the
            // low-cost screencast path automatically.
            if (this.activeMjpegStream?.token === streamToken) {
              this.activeMjpegStream.hasReceivedScreencastFrame = false;
            }
            this.schedulePendingVisualUpdate();
          }
        } else {
          if (this.activeMjpegStream?.token === streamToken) {
            this.activeMjpegStream.hasReceivedScreencastFrame = true;
          }
          try {
            onFrame({
              data: event.data,
              contentType: 'image/jpeg',
            });
          } catch (error) {
            reportStreamError(error);
          }
        }

        try {
          await client.send('Page.screencastFrameAck', {
            sessionId: event.sessionId,
          });
        } catch (error) {
          if (!stopped) {
            reportStreamError(error);
          }
        }
      })();
    };

    const removeFrameListener = () => {
      if (client.off) {
        client.off('Page.screencastFrame', handleFrame);
      } else if (client.removeListener) {
        client.removeListener('Page.screencastFrame', handleFrame);
      }
    };

    const stop = async () => {
      if (stopped) return;
      stopped = true;
      if (this.activeMjpegStream?.token === streamToken) {
        this.activeMjpegStream = undefined;
      }
      if (this.visualUpdateFollowupTimer) {
        clearTimeout(this.visualUpdateFollowupTimer);
        this.visualUpdateFollowupTimer = undefined;
      }
      signal?.removeEventListener('abort', abortHandler);
      removeFrameListener();
      await client.send('Page.stopScreencast').catch((error) => {
        debugPage('Page.stopScreencast failed: %s', error);
      });
      await client.detach().catch((error) => {
        debugPage('CDP screencast session detach failed: %s', error);
      });
    };

    const abortHandler = () => {
      void stop();
    };

    try {
      client.on('Page.screencastFrame', handleFrame);
      this.activeMjpegStream = {
        hasReceivedScreencastFrame: false,
        token: streamToken,
        onFrame,
        onError,
      };
      signal?.addEventListener('abort', abortHandler, { once: true });

      if (signal?.aborted) {
        await stop();
        return { stop };
      }

      await client.send('Page.enable');
      try {
        const { width, height } = await this.size();
        expectedViewportSize = { width, height };
        if (this.activeMjpegStream?.token === streamToken) {
          this.activeMjpegStream.expectedViewportSize = expectedViewportSize;
        }
        await client.send('Emulation.setVisibleSize', { width, height });
      } catch (error) {
        debugPage('CDP screencast visible size sync failed: %s', error);
      }
      await client.send('Page.startScreencast', {
        format: 'jpeg',
        quality: CDP_SCREENCAST_QUALITY,
        ...(expectedViewportSize
          ? {
              maxWidth: expectedViewportSize.width,
              maxHeight: expectedViewportSize.height,
            }
          : {}),
        everyNthFrame: CDP_SCREENCAST_EVERY_NTH_FRAME,
      });

      // CDP screencast only emits a frame when the page's compositor
      // produces one — for an idle page (no animation, post
      // waitForNetworkIdle) that may never happen, leaving freshly
      // attached subscribers staring at a blank canvas. Force-push one
      // manual screenshot so producer.lastFrame is populated before any
      // /mjpeg subscriber connects.
      this.schedulePendingVisualUpdate();

      return { stop };
    } catch (error) {
      await stop();
      throw error;
    }
  }

  /**
   * Continuous frame source for UI observation, backed by the same CDP
   * screencast used for MJPEG previews. Frames arrive as JPEG base64 already,
   * so `decode()` is a pass-through. Measured cost of an active screencast is
   * ~1% host CPU with no impact on action/screenshot latency, so this is
   * always available on web (no opt-in needed).
   */
  async openFrameSource(): Promise<DeviceFrameSource> {
    let latest: DeviceFrameRef | null = null;
    const handle = await this.startMjpegStream({
      onFrame: (frame) => {
        latest = {
          ref: `data:${frame.contentType ?? 'image/jpeg'};base64,${frame.data}`,
          capturedAt: Date.now(),
        };
      },
      onError: (error) => {
        debugPage('frame source screencast error: %s', error);
      },
    });
    return {
      latest: () => latest,
      // Screencast frames are already data URLs — no deferred decode cost.
      decode: async (refs) => refs.map((frameRef) => frameRef.ref as string),
      stop: () => handle.stop(),
    };
  }

  async url(): Promise<string> {
    return this.underlyingPage.url();
  }

  describe(): string {
    const url = this.underlyingPage.url();
    return url || '';
  }

  get mouse() {
    return {
      click: async (
        x: number,
        y: number,
        options?: { button?: MouseButton; count?: number },
      ) => {
        await this.mouse.move(x, y);
        const { button = 'left', count = 1 } = options || {};
        debugPage(`mouse click ${x}, ${y}, ${button}, ${count}`);

        if (count === 2 && this.interfaceType === 'playwright') {
          await (this.underlyingPage as PlaywrightPage).mouse.dblclick(x, y, {
            button,
          });
        } else if (this.interfaceType === 'puppeteer') {
          const page = this.underlyingPage as PuppeteerPage;
          if (button === 'left' && count === 1) {
            await page.mouse.click(x, y);
          } else {
            await page.mouse.click(x, y, { button, count });
          }
        } else if (this.interfaceType === 'playwright') {
          await (this.underlyingPage as PlaywrightPage).mouse.click(x, y, {
            button,
            clickCount: count,
          });
        }
      },
      wheel: async (deltaX: number, deltaY: number) => {
        debugPage(`mouse wheel ${deltaX}, ${deltaY}`);
        if (this.interfaceType === 'puppeteer') {
          await (this.underlyingPage as PuppeteerPage).mouse.wheel({
            deltaX,
            deltaY,
          });
        } else if (this.interfaceType === 'playwright') {
          await (this.underlyingPage as PlaywrightPage).mouse.wheel(
            deltaX,
            deltaY,
          );
        }
      },
      move: async (x: number, y: number) => {
        this.everMoved = true;
        debugPage(`mouse move to ${x}, ${y}`);
        return this.underlyingPage.mouse.move(x, y);
      },
      drag: async (
        from: { x: number; y: number },
        to: { x: number; y: number },
      ) => {
        debugPage(
          `begin mouse drag from ${from.x}, ${from.y} to ${to.x}, ${to.y}`,
        );
        await (this.underlyingPage as PlaywrightPage).mouse.move(
          from.x,
          from.y,
        );
        await sleep(200);
        await (this.underlyingPage as PlaywrightPage).mouse.down();
        await sleep(300);
        await (this.underlyingPage as PlaywrightPage).mouse.move(to.x, to.y, {
          steps: 20,
        });
        await sleep(500);
        await (this.underlyingPage as PlaywrightPage).mouse.up();
        await sleep(200);
        debugPage(
          `end mouse drag from ${from.x}, ${from.y} to ${to.x}, ${to.y}`,
        );
      },
    };
  }

  get keyboard() {
    return {
      type: async (text: string, options?: { delay?: number }) => {
        const effectiveDelay = options?.delay ?? this.keyboardTypeDelay;
        debugPage(
          `keyboard type ${text}${effectiveDelay !== undefined ? ` (delay: ${effectiveDelay}ms)` : ''}`,
        );
        return this.underlyingPage.keyboard.type(text, {
          delay: effectiveDelay,
        });
      },
      press: async (
        action:
          | { key: KeyInput; command?: string }
          | { key: KeyInput; command?: string }[],
      ) => {
        const keys = Array.isArray(action) ? action : [action];
        debugPage('keyboard press', keys);
        for (const k of keys) {
          const commands = k.command ? [k.command] : [];
          await this.underlyingPage.keyboard.down(k.key, { commands });
        }
        for (const k of [...keys].reverse()) {
          await this.underlyingPage.keyboard.up(k.key);
        }
      },
      down: async (key: KeyInput) => {
        debugPage(`keyboard down ${key}`);
        return this.underlyingPage.keyboard.down(key);
      },
      up: async (key: KeyInput) => {
        debugPage(`keyboard up ${key}`);
        return this.underlyingPage.keyboard.up(key);
      },
    };
  }

  private async selectAllByCdp(): Promise<void> {
    const client = await this.createPageCdpSession('clearInput');
    try {
      // Use the browser editing command instead of Modifier+A. Playwright's
      // Chromium input layer derives the browser platform from
      // Browser.getVersion().userAgent, while Modifier+A shortcuts are often
      // chosen from local process.platform. If a Linux browser is launched with
      // a macOS browser-level UA, Chromium treats select-all as Cmd+A instead
      // of Ctrl+A, so the local-platform shortcut can fail.
      await client.send('Input.dispatchKeyEvent', {
        type: 'rawKeyDown',

        commands: ['selectAll'],
      });
      await client.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
      });
    } finally {
      await client.detach().catch(() => undefined);
    }
  }

  async clearInput(element?: ElementInfo): Promise<void> {
    const backspace = async () => {
      await sleep(100);
      await this.keyboard.press([{ key: 'Backspace' }]);
    };

    debugPage('clearInput begin');

    element && (await this.mouse.click(element.center[0], element.center[1]));
    try {
      await this.selectAllByCdp();
      await backspace();
    } catch (error) {
      debugPage('clearInput cdp selectAll failed', error);
      throw error;
    } finally {
      debugPage('clearInput end');
    }
  }

  private everMoved = false;
  private async moveToPointBeforeScroll(point?: Point): Promise<void> {
    if (point) {
      await this.mouse.move(point.left, point.top);
    } else if (!this.everMoved) {
      // If the mouse has never moved, move it to the center of the page
      const size = await this.size();
      const targetX = Math.floor(size.width / 2);
      const targetY = Math.floor(size.height / 2);
      await this.mouse.move(targetX, targetY);
    }
  }

  async scrollUntilTop(startingPoint?: Point): Promise<void> {
    await this.moveToPointBeforeScroll(startingPoint);
    return this.mouse.wheel(0, -9999999);
  }

  async scrollUntilBottom(startingPoint?: Point): Promise<void> {
    await this.moveToPointBeforeScroll(startingPoint);
    return this.mouse.wheel(0, 9999999);
  }

  async scrollUntilLeft(startingPoint?: Point): Promise<void> {
    await this.moveToPointBeforeScroll(startingPoint);
    return this.mouse.wheel(-9999999, 0);
  }

  async scrollUntilRight(startingPoint?: Point): Promise<void> {
    await this.moveToPointBeforeScroll(startingPoint);
    return this.mouse.wheel(9999999, 0);
  }

  async scrollUp(distance?: number, startingPoint?: Point): Promise<void> {
    /* istanbul ignore next -- closure is serialized to the browser realm via page.evaluate, where istanbul's cov_* counter does not exist */
    const innerHeight = await this.evaluate(() => window.innerHeight);
    const scrollDistance = distance || innerHeight * 0.7;
    await this.moveToPointBeforeScroll(startingPoint);
    return this.mouse.wheel(0, -scrollDistance);
  }

  async scrollDown(distance?: number, startingPoint?: Point): Promise<void> {
    /* istanbul ignore next -- closure is serialized to the browser realm via page.evaluate, where istanbul's cov_* counter does not exist */
    const innerHeight = await this.evaluate(() => window.innerHeight);
    const scrollDistance = distance || innerHeight * 0.7;
    await this.moveToPointBeforeScroll(startingPoint);
    return this.mouse.wheel(0, scrollDistance);
  }

  async scrollLeft(distance?: number, startingPoint?: Point): Promise<void> {
    /* istanbul ignore next -- closure is serialized to the browser realm via page.evaluate, where istanbul's cov_* counter does not exist */
    const innerWidth = await this.evaluate(() => window.innerWidth);
    const scrollDistance = distance || innerWidth * 0.7;
    await this.moveToPointBeforeScroll(startingPoint);
    return this.mouse.wheel(-scrollDistance, 0);
  }

  async scrollRight(distance?: number, startingPoint?: Point): Promise<void> {
    /* istanbul ignore next -- closure is serialized to the browser realm via page.evaluate, where istanbul's cov_* counter does not exist */
    const innerWidth = await this.evaluate(() => window.innerWidth);
    const scrollDistance = distance || innerWidth * 0.7;
    await this.moveToPointBeforeScroll(startingPoint);
    return this.mouse.wheel(scrollDistance, 0);
  }

  async navigate(url: string): Promise<void> {
    debugPage(`navigate to ${url}`);
    if (this.interfaceType === 'puppeteer') {
      await (this.underlyingPage as PuppeteerPage).goto(url);
    } else if (this.interfaceType === 'playwright') {
      await (this.underlyingPage as PlaywrightPage).goto(url);
    } else {
      throw new Error('Unsupported page type for navigate');
    }
  }

  async reload(): Promise<void> {
    debugPage('reload page');
    if (this.interfaceType === 'puppeteer') {
      await (this.underlyingPage as PuppeteerPage).reload();
    } else if (this.interfaceType === 'playwright') {
      await (this.underlyingPage as PlaywrightPage).reload();
    } else {
      throw new Error('Unsupported page type for reload');
    }
  }

  async goBack(): Promise<void> {
    debugPage('go back');
    if (this.interfaceType === 'puppeteer') {
      await (this.underlyingPage as PuppeteerPage).goBack();
    } else if (this.interfaceType === 'playwright') {
      await (this.underlyingPage as PlaywrightPage).goBack();
    } else {
      throw new Error('Unsupported page type for go back');
    }
  }

  async goForward(): Promise<void> {
    debugPage('go forward');
    if (this.interfaceType === 'puppeteer') {
      await (this.underlyingPage as PuppeteerPage).goForward();
    } else if (this.interfaceType === 'playwright') {
      await (this.underlyingPage as PlaywrightPage).goForward();
    } else {
      throw new Error('Unsupported page type for go forward');
    }
  }

  async stopLoading(): Promise<void> {
    debugPage('stop loading');
    if (this.interfaceType === 'puppeteer') {
      const client = await this.createPageCdpSession('stopLoading');
      try {
        await client.send('Page.stopLoading');
      } finally {
        await client.detach();
      }
    } else if (this.interfaceType === 'playwright') {
      /* istanbul ignore next -- closure is serialized to the browser realm via page.evaluate, where istanbul's cov_* counter does not exist */
      await (this.underlyingPage as PlaywrightPage).evaluate(() =>
        window.stop(),
      );
    } else {
      throw new Error('Unsupported page type for stop loading');
    }
  }

  async navigationState(): Promise<{ isLoading: boolean }> {
    try {
      /* istanbul ignore next -- closure is serialized to the browser realm via page.evaluate, where istanbul's cov_* counter does not exist */
      const readyState = await this.evaluate(() => document.readyState);
      return { isLoading: readyState !== 'complete' };
    } catch (error) {
      debugPage('failed to query navigation state: %s', error);
      return { isLoading: false };
    }
  }

  async beforeInvokeAction(name: string, param: any): Promise<void> {
    if (this.onBeforeInvokeAction) {
      await this.onBeforeInvokeAction(name, param);
    }
  }

  async afterInvokeAction(name: string, param: any): Promise<void> {
    await Promise.all([
      this.waitForNavigation('afterInvokeAction', name),
      this.waitForNetworkIdle('afterInvokeAction', name),
    ]);

    if (this.onAfterInvokeAction) {
      await this.onAfterInvokeAction(name, param);
    }
  }

  async destroy(): Promise<void> {}

  async swipe(
    from: { x: number; y: number },
    to: { x: number; y: number },
    duration?: number,
  ) {
    const LONG_PRESS_THRESHOLD = 500;
    const MIN_PRESS_THRESHOLD = 150;
    duration = duration || 100;
    if (duration < MIN_PRESS_THRESHOLD) {
      duration = MIN_PRESS_THRESHOLD;
    }
    if (duration > LONG_PRESS_THRESHOLD) {
      duration = LONG_PRESS_THRESHOLD;
    }
    debugPage(
      `mouse swipe from ${from.x}, ${from.y} to ${to.x}, ${to.y} with duration ${duration}ms`,
    );

    if (this.interfaceType === 'puppeteer') {
      const page = this.underlyingPage as PuppeteerPage;
      await page.mouse.move(from.x, from.y);
      await page.mouse.down({ button: 'left' });

      const steps = 30;
      const delay = duration / steps;
      for (let i = 1; i <= steps; i++) {
        const x = from.x + (to.x - from.x) * (i / steps);
        const y = from.y + (to.y - from.y) * (i / steps);
        await page.mouse.move(x, y);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      await page.mouse.up({ button: 'left' });
    } else if (this.interfaceType === 'playwright') {
      const page = this.underlyingPage as PlaywrightPage;
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();

      const steps = 30;
      const delay = duration / steps;
      for (let i = 1; i <= steps; i++) {
        const x = from.x + (to.x - from.x) * (i / steps);
        const y = from.y + (to.y - from.y) * (i / steps);
        await page.mouse.move(x, y);
        await page.waitForTimeout(delay);
      }

      await page.mouse.up({ button: 'left' });
    }
  }
  async longPress(x: number, y: number, duration?: number) {
    duration = duration || 500;
    // Keep a lower bound so the press is registered as a long press rather than
    // a click, but never cap the upper bound: the duration is the caller's
    // intent (e.g. "hold for 6 seconds").
    const MIN_LONG_PRESS_DURATION = 300;
    if (duration < MIN_LONG_PRESS_DURATION) {
      duration = MIN_LONG_PRESS_DURATION;
    }
    debugPage(`mouse longPress at ${x}, ${y} for ${duration}ms`);
    if (this.interfaceType === 'puppeteer') {
      const page = this.underlyingPage as PuppeteerPage;
      await page.mouse.move(x, y);
      await page.mouse.down({ button: 'left' });
      await new Promise((res) => setTimeout(res, duration));
      await page.mouse.up({ button: 'left' });
    } else if (this.interfaceType === 'playwright') {
      const page = this.underlyingPage as PlaywrightPage;
      await page.mouse.move(x, y);
      await page.mouse.down({ button: 'left' });
      await page.waitForTimeout(duration);
      await page.mouse.up({ button: 'left' });
    }
  }

  async pinch(
    centerX: number,
    centerY: number,
    startDistance: number,
    endDistance: number,
    duration = 500,
  ): Promise<void> {
    const steps = 30;
    const delay = duration / steps;
    const halfStart = startDistance / 2;
    const halfEnd = endDistance / 2;

    type TouchClient = {
      send(
        method: 'Input.dispatchTouchEvent',
        params?: Protocol.Input.DispatchTouchEventRequest,
      ): Promise<unknown>;
      detach(): Promise<void>;
    };

    const client = (await this.createPageCdpSession(
      'Pinch gesture',
    )) as TouchClient;

    try {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
          { x: Math.round(centerX), y: Math.round(centerY - halfStart), id: 0 },
          { x: Math.round(centerX), y: Math.round(centerY + halfStart), id: 1 },
        ],
      });

      for (let i = 1; i <= steps; i++) {
        const currentHalf = halfStart + (halfEnd - halfStart) * (i / steps);
        await client.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [
            {
              x: Math.round(centerX),
              y: Math.round(centerY - currentHalf),
              id: 0,
            },
            {
              x: Math.round(centerX),
              y: Math.round(centerY + currentHalf),
              id: 1,
            },
          ],
        });
        await new Promise((res) => setTimeout(res, delay));
      }

      await client.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
    } finally {
      await client.detach();
    }
  }

  private async ensurePuppeteerFileChooserSession(): Promise<CDPSession> {
    if (this.puppeteerFileChooserSession) {
      return this.puppeteerFileChooserSession;
    }
    const session = (await this.createPageCdpSession(
      'Puppeteer file chooser',
    )) as unknown as CDPSession;
    await session.send('Page.enable');
    await session.send('DOM.enable');
    await session.send('Page.setInterceptFileChooserDialog', { enabled: true });
    this.puppeteerFileChooserSession = session;
    return session;
  }

  async registerFileChooserListener(
    handler: (
      chooser: import('@midscene/core/device').FileChooserHandler,
    ) => Promise<void>,
  ): Promise<{ dispose: () => void; getError: () => Error | undefined }> {
    if (this.interfaceType !== 'puppeteer') {
      throw new Error(
        'registerFileChooserListener is only supported in Puppeteer',
      );
    }

    const session = await this.ensurePuppeteerFileChooserSession();
    if (this.puppeteerFileChooserHandler) {
      session.off('Page.fileChooserOpened', this.puppeteerFileChooserHandler);
    }

    let capturedError: Error | undefined;

    this.puppeteerFileChooserHandler = async (event) => {
      if (event.backendNodeId === undefined) {
        debugPage('puppeteer file chooser opened without backendNodeId, skip');
        return;
      }
      try {
        await handler({
          accept: async (files: string[]) => {
            // Get node information to check attributes
            const { node } = await session.send('DOM.describeNode', {
              backendNodeId: event.backendNodeId,
            });
            // attributes is a flat array: ['attr1', 'value1', 'attr2', 'value2', ...]

            // Check if input has webkitdirectory attribute (Puppeteer doesn't support directory upload)
            const hasWebkitDirectory =
              node.attributes?.includes('webkitdirectory') ||
              node.attributes?.includes('directory');
            if (hasWebkitDirectory) {
              throw new Error(
                'Directory upload (webkitdirectory) is not supported in Puppeteer. Please use Playwright instead, which supports directory upload since version 1.45.',
              );
            }

            // Check if input supports multiple files
            if (files.length > 1) {
              const hasMultiple = node.attributes?.includes('multiple');
              if (!hasMultiple) {
                throw new Error(
                  'Non-multiple file input can only accept single file',
                );
              }
            }
            await session.send('DOM.setFileInputFiles', {
              files,
              backendNodeId: event.backendNodeId,
            });
          },
        });
      } catch (error) {
        capturedError = error as Error;
      }
    };
    session.on('Page.fileChooserOpened', this.puppeteerFileChooserHandler);
    return {
      dispose: () => {
        if (this.puppeteerFileChooserHandler) {
          session.off(
            'Page.fileChooserOpened',
            this.puppeteerFileChooserHandler,
          );
        }
        void session.detach();
        this.puppeteerFileChooserHandler = undefined;
        if (this.puppeteerFileChooserSession === session) {
          this.puppeteerFileChooserSession = undefined;
        }
      },
      getError: () => capturedError,
    };
  }
}

export function forceClosePopup(
  page: PuppeteerPage | PlaywrightPage,
  debugProfile: DebugFunction,
) {
  page.on('popup', async (popup) => {
    if (!popup) {
      console.warn('got a popup event, but the popup is not ready yet, skip');
      return;
    }
    const url = await (popup as PuppeteerPage).url();
    console.log(`Popup opened: ${url}`);
    if (!(popup as PuppeteerPage).isClosed()) {
      try {
        await (popup as PuppeteerPage).close(); // Close the newly opened TAB
      } catch (error) {
        debugProfile(`failed to close popup ${url}, error: ${error}`);
      }
    } else {
      debugProfile(`popup is already closed, skip close ${url}`);
    }

    if (!page.isClosed()) {
      try {
        // A target=_blank navigation (for example Baidu's Map link) is
        // redirected back into the preview tab. Waiting for the target page's
        // full `load` event keeps the interaction pending for up to Puppeteer's
        // default 30 seconds on pages with long-lived resources. DOM content is
        // enough for the preview to switch to the new page.
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 10_000,
        });
      } catch (error) {
        debugProfile(`failed to goto ${url}, error: ${error}`);
      }
    } else {
      debugProfile(`page is already closed, skip goto ${url}`);
    }
  });
}

/**
 * Force Chrome to render select elements using base-select appearance instead of OS-native rendering.
 * This makes select elements visible in screenshots captured by Playwright/Puppeteer.
 *
 * Reference: https://developer.chrome.com/blog/a-customizable-select
 *
 * Adds a style tag with CSS rules to make all select elements use base-select appearance.
 */
// Track pages that already have the select-rendering style wired up so the
// immediate injection and the `load` listener are only registered once per page,
// even if multiple agents are created for the same page.
const forceSelectRenderingPages = new WeakSet<object>();

export function forceChromeSelectRendering(
  page: PuppeteerPage | PlaywrightPage,
): void {
  // Only inject once per page to avoid stacking duplicate `load` listeners.
  if (forceSelectRenderingPages.has(page)) {
    return;
  }
  forceSelectRenderingPages.add(page);

  // Force Chrome to render select elements using base-select appearance
  // Reference: https://developer.chrome.com/blog/a-customizable-select
  const styleContent = `
/* Add by Midscene because of forceChromeSelectRendering is enabled*/
select {
  &, &::picker(select) {
    appearance: base-select !important;
  }
}`;
  const styleId = 'midscene-force-select-rendering';

  const injectStyle = async () => {
    try {
      /* istanbul ignore next -- closure is serialized to the browser realm via page.evaluate, where istanbul's cov_* counter does not exist */
      await (page as PuppeteerPage & PlaywrightPage).evaluate(
        ({ id, content }: { id: string; content: string }) => {
          if (document.getElementById(id)) return;
          const style = document.createElement('style');
          style.id = id;
          style.textContent = content;
          document.head.appendChild(style);
        },
        { id: styleId, content: styleContent },
      );
      debugPage(
        'Midscene - Added base-select appearance style for select elements because of forceChromeSelectRendering is enabled',
      );
    } catch (err) {
      console.log(
        'Midscene - Failed to add base-select appearance style:',
        err,
      );
    }
  };

  // Inject immediately for the current document
  void injectStyle();

  // Ensure the style is reapplied on future navigations/new documents
  (page as PuppeteerPage & PlaywrightPage).on('load', () => {
    void injectStyle();
  });
}
