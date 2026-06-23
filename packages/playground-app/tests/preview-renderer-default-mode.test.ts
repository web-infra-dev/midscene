/** @vitest-environment jsdom */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const screenshotViewerMock = vi.fn((props: unknown) => null);

vi.mock('@midscene/visualizer', () => ({
  ScreenshotViewer: (props: unknown) => screenshotViewerMock(props),
}));

import { PreviewRenderer } from '../src/PreviewRenderer';

beforeAll(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('PreviewRenderer screenshot viewer defaults', () => {
  // Studio used to be the only embed that asked for screen-only mode; in the
  // standalone playgrounds we fell back to the chrome-wrapped default viewer,
  // which silently pushed pointer taps downward because the interaction layer
  // measured the full panel instead of the actual screen-mirror box. Default
  // to screen-only so every playground app picks up the fix automatically.
  it('defaults the ScreenshotViewer to screen-only when no mode is provided', async () => {
    screenshotViewerMock.mockClear();
    const playgroundSDK = {
      getInterfaceInfo: vi.fn(async () => null),
      getScreenshot: vi.fn(async () => null),
      interact: vi.fn(async () => ({ ok: true })),
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(PreviewRenderer, {
          playgroundSDK,
          runtimeInfo: {
            interface: { type: 'puppeteer' },
            metadata: {},
            preview: {
              kind: 'mjpeg',
              mjpegPath: '/mjpeg',
            },
          },
          serverOnline: true,
          serverUrl: 'http://127.0.0.1:5800',
          isUserOperating: false,
        } as any),
      );
    });
    await flushPromises();

    expect(screenshotViewerMock).toHaveBeenCalled();
    const lastCall = screenshotViewerMock.mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    const props = lastCall![0] as { mode?: string; contentRef?: unknown };
    expect(props.mode).toBe('screen-only');
    expect(props.contentRef).toBeDefined();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('honors an explicit mode override (Studio passes "default")', async () => {
    screenshotViewerMock.mockClear();
    const playgroundSDK = {
      getInterfaceInfo: vi.fn(async () => null),
      getScreenshot: vi.fn(async () => null),
      interact: vi.fn(async () => ({ ok: true })),
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(PreviewRenderer, {
          playgroundSDK,
          runtimeInfo: {
            interface: { type: 'puppeteer' },
            metadata: {},
            preview: {
              kind: 'mjpeg',
              mjpegPath: '/mjpeg',
            },
          },
          serverOnline: true,
          serverUrl: 'http://127.0.0.1:5800',
          isUserOperating: false,
          screenshotViewerMode: 'default',
        } as any),
      );
    });
    await flushPromises();

    const props = screenshotViewerMock.mock.calls.at(-1)![0] as {
      mode?: string;
    };
    expect(props.mode).toBe('default');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
