/** @vitest-environment jsdom */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import ScreenshotViewer from '../src/component/screenshot-viewer';

describe('ScreenshotViewer', () => {
  beforeAll(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a screen-only variant without viewer chrome', () => {
    const html = renderToStaticMarkup(
      createElement(ScreenshotViewer, {
        getScreenshot: async () => null,
        serverOnline: true,
        mjpegUrl: 'http://127.0.0.1:9234/mjpeg',
        mode: 'screen-only',
      }),
    );

    expect(html).toContain('screenshot-viewer screen-only');
    expect(html).toContain('screenshot-content');
    expect(html).not.toContain('screenshot-header');
    expect(html).not.toContain('device-name-overlay');
  });

  it('keeps the default viewer chrome when no mode override is provided', () => {
    const html = renderToStaticMarkup(
      createElement(ScreenshotViewer, {
        getScreenshot: async () => null,
        serverOnline: true,
        mjpegUrl: 'http://127.0.0.1:9234/mjpeg',
      }),
    );

    expect(html).toContain('screenshot-header');
    expect(html).toContain('device-name-overlay');
  });

  it('reconnects an MJPEG image when the first frame never loads', async () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(ScreenshotViewer, {
          getScreenshot: async () => null,
          serverOnline: true,
          mjpegUrl: 'http://127.0.0.1:9234/mjpeg',
          mode: 'screen-only',
        }),
      );
    });

    const initialImage = container.querySelector(
      'img[alt="Device Live Stream"]',
    ) as HTMLImageElement | null;
    expect(initialImage?.src).toBe('http://127.0.0.1:9234/mjpeg');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    const retriedImage = container.querySelector(
      'img[alt="Device Live Stream"]',
    ) as HTMLImageElement | null;
    expect(retriedImage?.src).toContain('_mjpegRetry=');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('does not call the screenshot API while MJPEG preview is active', async () => {
    vi.useFakeTimers();
    const getScreenshot = vi.fn(async () => null);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(ScreenshotViewer, {
          getScreenshot,
          serverOnline: true,
          isUserOperating: false,
          mjpegUrl: 'http://127.0.0.1:9234/mjpeg',
          mode: 'screen-only',
        }),
      );
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    await act(async () => {
      root.render(
        createElement(ScreenshotViewer, {
          getScreenshot,
          serverOnline: true,
          isUserOperating: true,
          mjpegUrl: 'http://127.0.0.1:9234/mjpeg',
          mode: 'screen-only',
        }),
      );
    });

    await act(async () => {
      root.render(
        createElement(ScreenshotViewer, {
          getScreenshot,
          serverOnline: true,
          isUserOperating: false,
          mjpegUrl: 'http://127.0.0.1:9234/mjpeg',
          mode: 'screen-only',
        }),
      );
    });

    expect(getScreenshot).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
