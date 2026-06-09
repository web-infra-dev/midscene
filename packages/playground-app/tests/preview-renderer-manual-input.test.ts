/** @vitest-environment jsdom */
import { PREVIEW_TEXT_INPUT_BATCH_DELAY_MS } from '@midscene/shared/constants';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PreviewRenderer } from '../src/PreviewRenderer';

vi.mock('@midscene/visualizer', () => ({
  ScreenshotViewer: () => null,
}));

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

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('PreviewRenderer manual web input', () => {
  it('ignores transient interface-info failures while polling manual control size', async () => {
    const playgroundSDK = {
      getInterfaceInfo: vi.fn(async () => {
        throw new Error('server restarting');
      }),
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
          screenshotViewerMode: 'screen-only',
        } as any),
      );
    });
    await flushPromises();

    expect(playgroundSDK.getInterfaceInfo).toHaveBeenCalled();
    expect(
      container.querySelector(
        '[data-midscene-device-interaction-layer="true"]',
      ),
    ).toBeNull();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('batches keyboard input and sends typeOnly text to the active web page', async () => {
    vi.useFakeTimers();
    const interact = vi.fn(async () => ({ ok: true }));
    const playgroundSDK = {
      getInterfaceInfo: vi.fn(async () => ({
        type: 'puppeteer',
        size: { width: 100, height: 100 },
        actionTypes: ['Tap', 'DragAndDrop', 'KeyboardPress', 'Input'],
      })),
      getScreenshot: vi.fn(async () => null),
      interact,
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
          screenshotViewerMode: 'screen-only',
        } as any),
      );
    });
    await flushPromises();

    const overlay = container.querySelector(
      '[data-midscene-device-interaction-layer="true"]',
    ) as HTMLDivElement;
    const keyboardSink = container.querySelector(
      '[data-midscene-keyboard-sink="true"]',
    ) as HTMLTextAreaElement;
    expect(overlay).toBeTruthy();
    expect(keyboardSink).toBeTruthy();
    Object.defineProperty(overlay, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(overlay, 'releasePointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(overlay, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        bottom: 100,
        height: 100,
        left: 0,
        right: 100,
        top: 0,
        width: 100,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    await act(async () => {
      overlay.dispatchEvent(
        new MouseEvent('pointerdown', {
          bubbles: true,
          button: 0,
          clientX: 50,
          clientY: 50,
        }),
      );
      overlay.dispatchEvent(
        new MouseEvent('pointerup', {
          bubbles: true,
          button: 0,
          clientX: 50,
          clientY: 50,
        }),
      );
      keyboardSink.value = 'h';
      keyboardSink.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          data: 'h',
          inputType: 'insertText',
        }),
      );
      keyboardSink.value = 'e';
      keyboardSink.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          data: 'e',
          inputType: 'insertText',
        }),
      );
      keyboardSink.value = 'l';
      keyboardSink.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          data: 'l',
          inputType: 'insertText',
        }),
      );
    });
    await flushPromises();

    expect(interact).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(PREVIEW_TEXT_INPUT_BATCH_DELAY_MS);
    });
    await flushPromises();

    expect(interact).toHaveBeenNthCalledWith(1, {
      actionType: 'Tap',
      x: 50,
      y: 50,
    });
    expect(interact).toHaveBeenNthCalledWith(2, {
      actionType: 'Input',
      value: 'hel',
      mode: 'typeOnly',
    });

    await act(async () => {
      keyboardSink.value = 'o';
      keyboardSink.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          data: 'o',
          inputType: 'insertText',
        }),
      );
      keyboardSink.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          key: 'Enter',
        }),
      );
      keyboardSink.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          key: 'c',
          metaKey: true,
        }),
      );
      keyboardSink.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          key: 'a',
          metaKey: true,
        }),
      );
      keyboardSink.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          key: 'Backspace',
        }),
      );
    });
    await flushPromises();

    expect(interact).toHaveBeenNthCalledWith(3, {
      actionType: 'Input',
      value: 'o',
      mode: 'typeOnly',
    });
    expect(interact).toHaveBeenNthCalledWith(4, {
      actionType: 'KeyboardPress',
      keyName: 'Enter',
    });
    expect(interact).toHaveBeenNthCalledWith(5, {
      actionType: 'KeyboardPress',
      keyName: 'Meta+c',
    });
    expect(interact).toHaveBeenNthCalledWith(6, {
      actionType: 'KeyboardPress',
      keyName: 'Meta+a',
    });
    expect(interact).toHaveBeenNthCalledWith(7, {
      actionType: 'KeyboardPress',
      keyName: 'Backspace',
    });

    await act(async () => {
      vi.advanceTimersByTime(PREVIEW_TEXT_INPUT_BATCH_DELAY_MS);
    });
    await flushPromises();
    expect(interact).toHaveBeenCalledTimes(7);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('flushes pending keyboard input before unmounting', async () => {
    vi.useFakeTimers();
    const interact = vi.fn(async () => ({ ok: true }));
    const playgroundSDK = {
      getInterfaceInfo: vi.fn(async () => ({
        type: 'puppeteer',
        size: { width: 100, height: 100 },
        actionTypes: ['Tap', 'DragAndDrop', 'KeyboardPress', 'Input'],
      })),
      getScreenshot: vi.fn(async () => null),
      interact,
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
          screenshotViewerMode: 'screen-only',
        } as any),
      );
    });
    await flushPromises();

    const overlay = container.querySelector(
      '[data-midscene-device-interaction-layer="true"]',
    ) as HTMLDivElement;
    const keyboardSink = container.querySelector(
      '[data-midscene-keyboard-sink="true"]',
    ) as HTMLTextAreaElement;
    expect(overlay).toBeTruthy();
    expect(keyboardSink).toBeTruthy();
    Object.defineProperty(overlay, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(overlay, 'releasePointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(overlay, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        bottom: 100,
        height: 100,
        left: 0,
        right: 100,
        top: 0,
        width: 100,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    await act(async () => {
      overlay.dispatchEvent(
        new MouseEvent('pointerdown', {
          bubbles: true,
          button: 0,
          clientX: 50,
          clientY: 50,
        }),
      );
      overlay.dispatchEvent(
        new MouseEvent('pointerup', {
          bubbles: true,
          button: 0,
          clientX: 50,
          clientY: 50,
        }),
      );
      keyboardSink.value = 'z';
      keyboardSink.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          data: 'z',
          inputType: 'insertText',
        }),
      );
    });
    await flushPromises();

    expect(interact).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
    await flushPromises();

    expect(interact).toHaveBeenNthCalledWith(2, {
      actionType: 'Input',
      value: 'z',
      mode: 'typeOnly',
    });

    container.remove();
  });
});
