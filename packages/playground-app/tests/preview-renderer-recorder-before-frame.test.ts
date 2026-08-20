/** @vitest-environment jsdom */
import { afterEach, beforeAll, describe, expect, it, rs } from '@rstest/core';
import { WebCodecsVideoDecoder } from '@yume-chan/scrcpy-decoder-webcodecs';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { PreviewRenderer } from '../src/PreviewRenderer';

let scrcpyPanelProps: Record<string, any> | undefined;
let interactionLayerProps: Record<string, any> | undefined;

rs.mock('@midscene/visualizer', () => ({
  ScreenshotViewer: () => null,
}));

rs.mock('../src/ScrcpyPanel', () => ({
  ScrcpyPanel: (props: Record<string, any>) => {
    scrcpyPanelProps = props;
    return null;
  },
}));

rs.mock('../src/DeviceInteractionLayer', () => ({
  DeviceInteractionLayer: (props: Record<string, any>) => {
    interactionLayerProps = props;
    return null;
  },
}));

beforeAll(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  scrcpyPanelProps = undefined;
  interactionLayerProps = undefined;
  rs.restoreAllMocks();
});

describe('PreviewRenderer recorder before-frame', () => {
  it('uses the visible first frame without reusing it after an action', async () => {
    rs.spyOn(WebCodecsVideoDecoder, 'isSupported', 'get').mockReturnValue(true);
    const interact = rs.fn(async () => ({ ok: true }));
    const playgroundSDK = {
      getInterfaceInfo: rs.fn(async () => ({
        type: 'android',
        size: { width: 390, height: 844 },
        actionTypes: ['Tap'],
      })),
      getScreenshot: rs.fn(async () => null),
      interact,
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const renderPreview = (recorderBeforeFrameEnabled: boolean) =>
      createElement(PreviewRenderer, {
        playgroundSDK,
        runtimeInfo: {
          interface: { type: 'android' },
          metadata: { deviceId: 'emulator-5554' },
          preview: {
            kind: 'scrcpy',
            capabilities: [],
            custom: { scrcpyPort: 6501 },
          },
        },
        serverOnline: true,
        serverUrl: 'http://127.0.0.1:5800',
        isUserOperating: false,
        recorderBeforeFrameEnabled,
        screenshotViewerMode: 'screen-only',
      } as any);

    await act(async () => {
      root.render(renderPreview(false));
    });
    expect(scrcpyPanelProps).toBeDefined();
    expect(interactionLayerProps).toBeDefined();

    await act(async () => {
      scrcpyPanelProps?.onStatusChange?.('connected', 'Connected');
      scrcpyPanelProps?.onFrameAvailable?.(1_000);
      scrcpyPanelProps?.onFrameCaptureChange?.(async () => ({
        blob: new Blob(['current-frame'], { type: 'image/png' }),
        capturedAt: 1_000,
        width: 390,
        height: 844,
      }));
    });

    await act(async () => {
      root.render(renderPreview(true));
    });
    let now = 10_000;
    rs.spyOn(Date, 'now').mockImplementation(() => now);
    await act(async () => {
      await interactionLayerProps?.onTap?.({ x: 40, y: 50 });
    });

    expect(interact).toHaveBeenCalledOnce();
    expect(interact).toHaveBeenCalledWith({
      actionType: 'Tap',
      x: 40,
      y: 50,
      recorderBeforeFrame: {
        dataUrl: expect.stringMatching(/^data:image\/png;base64,/),
        capturedAt: 1_000,
        width: 390,
        height: 844,
        source: 'studio-scrcpy-preview',
      },
    });

    // Even after the old 500ms settle window, do not reuse the first
    // action's frame when scrcpy has not shown the result of that action.
    now += 1_000;
    await act(async () => {
      await interactionLayerProps?.onTap?.({ x: 60, y: 70 });
    });
    expect(interact).toHaveBeenCalledTimes(2);
    expect(interact).toHaveBeenNthCalledWith(2, {
      actionType: 'Tap',
      x: 60,
      y: 70,
    });

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
