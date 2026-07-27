import type { AndroidAccessibilitySnapshot } from '@midscene/android';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AndroidAuditSessionController } from '../../src/android-audit-session';

function snapshot(top: number): AndroidAccessibilitySnapshot {
  const sourceXml = `<?xml version="1.0"?><hierarchy><node class="android.widget.FrameLayout" bounds="[0,0][400,800]"><node class="android.widget.Button" resource-id="stable" clickable="true" bounds="[20,${top}][140,${top + 60}]"/></node></hierarchy>`;
  return {
    captureId: `capture-${top}`,
    capturedAt: new Date().toISOString(),
    dpr: 1,
    durationMs: 10,
    logicalSize: { width: 400, height: 800 },
    root: {
      attrs: {},
      bounds: { left: 0, top: 0, width: 400, height: 800 },
      children: [
        {
          attrs: { 'resource-id': 'stable', clickable: 'true' },
          bounds: { left: 20, top, width: 120, height: 60 },
          children: [],
          type: 'android.widget.Button',
        },
      ],
      type: 'android.widget.FrameLayout',
    },
    rotation: 0,
    source: 'yadb',
    sourceXml,
  };
}

function webViewSnapshot(
  pageId: string,
  interactiveCount: number,
): AndroidAccessibilitySnapshot {
  const children = Array.from({ length: 14 }, (_, index) => ({
    attrs: {
      'resource-id': `${pageId}-control-${index + 1}`,
      clickable: index < interactiveCount ? 'true' : 'false',
      text: `Control ${index + 1}`,
    },
    bounds: {
      left: 20 + (index % 2) * 180,
      top: 40 + Math.floor(index / 2) * 80,
      width: 160,
      height: 60,
    },
    children: [],
    type: 'android.view.View',
  }));
  return {
    captureId: `${pageId}-${Date.now()}`,
    capturedAt: new Date().toISOString(),
    dpr: 1,
    durationMs: 10,
    logicalSize: { width: 400, height: 800 },
    root: {
      attrs: { package: 'com.example.webview' },
      bounds: { left: 0, top: 0, width: 400, height: 800 },
      children,
      type: 'android.webkit.WebView',
    },
    rotation: 0,
    source: 'yadb',
    sourceXml: '<hierarchy />',
  };
}

function semanticSnapshot(text: string): AndroidAccessibilitySnapshot {
  return {
    ...snapshot(20),
    captureId: `capture-${text}`,
    root: {
      attrs: {},
      bounds: { left: 0, top: 0, width: 400, height: 800 },
      children: [
        {
          attrs: { focusable: 'true', text },
          bounds: { left: 20, top: 20, width: 120, height: 60 },
          children: [],
          type: 'android.view.ViewGroup',
        },
      ],
      type: 'android.widget.FrameLayout',
    },
  };
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 1_000,
): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Timed out waiting for audit state');
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('AndroidAuditSessionController', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('does not capture until audit mode is explicitly started', async () => {
    const captureAccessibilitySnapshot = vi.fn(async () => snapshot(20));
    const controller = new AndroidAuditSessionController({
      captureIntervalMs: 60_000,
    });
    controller.attachDevice('serial-1', {
      captureAccessibilitySnapshot,
      screenshotBase64: vi.fn(async () => 'ZmFrZQ=='),
    });

    expect(controller.getState()).toMatchObject({
      deviceId: 'serial-1',
      enabled: false,
      status: 'idle',
    });
    expect(captureAccessibilitySnapshot).not.toHaveBeenCalled();

    await controller.start();
    expect(captureAccessibilitySnapshot).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toMatchObject({
      enabled: true,
      status: 'ready',
      revision: 1,
    });
    controller.close();
  });

  it('auto-pauses after a complete tree capture failure instead of retrying forever', async () => {
    const captureAccessibilitySnapshot = vi.fn(async () => {
      throw new Error(
        'Unable to read hierarchy: yadb No such file or directory; uiautomator exited with code 137',
      );
    });
    const controller = new AndroidAuditSessionController({
      captureIntervalMs: 1,
    });
    controller.attachDevice('serial-1', {
      captureAccessibilitySnapshot,
      screenshotBase64: vi.fn(async () => 'ZmFrZQ=='),
    });

    await controller.start();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(captureAccessibilitySnapshot).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toMatchObject({
      enabled: false,
      status: 'error',
    });
    expect(controller.getState().error).toContain(
      'live retries were paused automatically',
    );
    expect(controller.getState().errorDetail).toContain('code 137');
    controller.close();
  });

  it('single-flights concurrent captures and validates on the next tree', async () => {
    let resolveCapture: ((value: AndroidAccessibilitySnapshot) => void) | null =
      null;
    const captureAccessibilitySnapshot = vi
      .fn<() => Promise<AndroidAccessibilitySnapshot>>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveCapture = resolve;
          }),
      )
      .mockResolvedValueOnce(snapshot(40));
    const controller = new AndroidAuditSessionController({
      captureIntervalMs: 60_000,
    });
    controller.attachDevice('serial-1', {
      captureAccessibilitySnapshot,
      screenshotBase64: vi.fn(async () => 'ZmFrZQ=='),
    });

    const first = controller.captureNow();
    const duplicate = controller.captureNow();
    expect(captureAccessibilitySnapshot).toHaveBeenCalledTimes(1);
    resolveCapture?.(snapshot(20));
    await Promise.all([first, duplicate]);

    await controller.captureNow();
    expect(captureAccessibilitySnapshot).toHaveBeenCalledTimes(2);
    expect(controller.getState().replay).toEqual({
      attempted: 1,
      hits: 1,
      misses: 0,
      wrongMappings: 0,
    });
    expect(controller.getState().overlays[0].status).toBe('cache-xpath-hit');
    controller.close();
  });

  it('drops an in-flight result after the device is detached', async () => {
    let resolveCapture: ((value: AndroidAccessibilitySnapshot) => void) | null =
      null;
    const controller = new AndroidAuditSessionController();
    controller.attachDevice('serial-1', {
      captureAccessibilitySnapshot: () =>
        new Promise((resolve) => {
          resolveCapture = resolve;
        }),
      screenshotBase64: vi.fn(async () => 'ZmFrZQ=='),
    });

    const capture = controller.captureNow();
    controller.detachDevice();
    resolveCapture?.(snapshot(20));
    await capture;

    expect(controller.getState()).toMatchObject({
      enabled: false,
      revision: 0,
      status: 'idle',
    });
    expect(controller.getState().deviceId).toBeUndefined();
    controller.close();
  });

  it('keeps an explicit revisit baseline across navigation and verifies it later', async () => {
    const captureAccessibilitySnapshot = vi
      .fn<() => Promise<AndroidAccessibilitySnapshot>>()
      .mockResolvedValueOnce(snapshot(20))
      .mockResolvedValueOnce(snapshot(80));
    const controller = new AndroidAuditSessionController({
      captureIntervalMs: 60_000,
    });
    controller.attachDevice('serial-1', {
      captureAccessibilitySnapshot,
      screenshotBase64: vi.fn(async () => 'ZmFrZQ=='),
    });

    await controller.captureNow();
    await controller.setRevisitBaseline();
    expect(controller.getState().revisit).toMatchObject({
      baselineCaptureId: 'capture-20',
      status: 'baseline-ready',
    });

    await controller.verifyRevisit();
    expect(controller.getState().revisit).toMatchObject({
      replay: { attempted: 1, hits: 1, misses: 0, wrongMappings: 0 },
      status: 'verified',
      verifiedCaptureId: 'capture-80',
    });
    controller.close();
  });

  it('does not verify revisit with the previous tree when the fresh capture fails', async () => {
    const captureAccessibilitySnapshot = vi
      .fn<() => Promise<AndroidAccessibilitySnapshot>>()
      .mockResolvedValueOnce(snapshot(20))
      .mockRejectedValueOnce(new Error('fresh hierarchy unavailable'));
    const controller = new AndroidAuditSessionController({
      captureIntervalMs: 60_000,
    });
    controller.attachDevice('serial-1', {
      captureAccessibilitySnapshot,
      screenshotBase64: vi.fn(async () => 'ZmFrZQ=='),
    });

    await controller.captureNow();
    await controller.setRevisitBaseline();

    await expect(controller.verifyRevisit()).rejects.toThrow(
      'fresh hierarchy unavailable',
    );
    expect(controller.getState().revisit).toMatchObject({
      baselineCaptureId: 'capture-20',
      status: 'baseline-ready',
    });
    expect(controller.getState().revisit?.replay).toBeUndefined();
    controller.close();
  });

  it('adds screenshot-only AI controls and classifies controls missing from the tree', async () => {
    const captureAccessibilitySnapshot = vi.fn(async () => snapshot(20));
    const controller = new AndroidAuditSessionController({
      captureIntervalMs: 60_000,
    });
    controller.attachDevice(
      'serial-1',
      {
        captureAccessibilitySnapshot,
        screenshotBase64: vi.fn(async () => 'ZmFrZQ=='),
      },
      {
        aiQuery: vi.fn(async () => [
          { name: '按钮', description: '左上角按钮' },
          { name: '客服', description: '右上角客服入口' },
        ]),
        aiLocate: vi
          .fn()
          .mockResolvedValueOnce({
            dpr: 1,
            rect: { left: 20, top: 20, width: 120, height: 60 },
          })
          .mockResolvedValueOnce({
            dpr: 1,
            rect: { left: 250, top: 40, width: 80, height: 80 },
          }),
      } as never,
    );

    await controller.captureNow();
    await controller.scanVisualElements();

    expect(controller.getState().visualElements).toHaveLength(2);
    expect(controller.getState().visualElements[1]).toMatchObject({
      mappedNodeId: null,
      status: 'not-exposed',
    });
    expect(
      controller
        .getState()
        .overlays.some((overlay) => overlay.status === 'not-exposed'),
    ).toBe(true);
    expect(controller.getState().overlays).toHaveLength(2);
    expect(controller.getState().overlays[0].rectSource).toBe('tree');
    expect(controller.getState().overlays[1].rectSource).toBe('ai');
    controller.close();
  });

  it('keeps WebView auditing tree-only by default without invoking AI', async () => {
    const aiQuery = vi.fn();
    const aiLocate = vi.fn();
    const controller = new AndroidAuditSessionController({
      captureIntervalMs: 60_000,
    });
    controller.attachDevice(
      'serial-webview',
      {
        captureAccessibilitySnapshot: vi.fn(async () =>
          webViewSnapshot('monthly-pay', 2),
        ),
        screenshotBase64: vi.fn(async () => 'unused'),
      },
      { aiLocate, aiQuery } as never,
    );

    await controller.start();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(aiQuery).not.toHaveBeenCalled();
    expect(aiLocate).not.toHaveBeenCalled();
    expect(controller.getState().visualScan).toEqual({ status: 'idle' });
    expect(controller.getState().visualElements).toEqual([]);
    expect(controller.getState().overlays).toHaveLength(14);
    expect(
      controller
        .getState()
        .overlays.every(
          (overlay) =>
            overlay.rectSource === 'tree' && !overlay.visualElementId,
        ),
    ).toBe(true);
    controller.close();
  });

  it('automatically inventories a WebView once per page when explicitly enabled', async () => {
    const captureAccessibilitySnapshot = vi.fn(async () =>
      webViewSnapshot('monthly-pay', 2),
    );
    const aiQuery = vi.fn(async () => [
      {
        name: 'Control 1',
        description: 'top left Control 1',
        rect: { left: 50, top: 50, width: 400, height: 75 },
      },
      {
        name: 'Customer service',
        description: 'top right customer service',
        rect: { left: 550, top: 50, width: 200, height: 75 },
      },
    ]);
    const aiLocate = vi.fn();
    const controller = new AndroidAuditSessionController({
      autoVisualScan: true,
      captureIntervalMs: 60_000,
    });
    controller.attachDevice(
      'serial-webview',
      {
        captureAccessibilitySnapshot,
        screenshotBase64: vi.fn(async () => 'unused'),
      },
      { aiLocate, aiQuery } as never,
    );

    await controller.start();
    await waitFor(() => controller.getState().visualScan.status === 'ready');

    expect(aiQuery).toHaveBeenCalledTimes(1);
    expect(aiLocate).not.toHaveBeenCalled();
    expect(controller.getState().visualScan).toMatchObject({
      automatic: true,
      status: 'ready',
    });
    expect(controller.getState().visualElements).toHaveLength(2);
    expect(controller.getState().overlays).toHaveLength(2);
    expect(
      controller
        .getState()
        .overlays.every((overlay) => Boolean(overlay.visualElementId)),
    ).toBe(true);

    await controller.captureNow();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(aiQuery).toHaveBeenCalledTimes(1);
    controller.close();
  });

  it('automatically inventories a WebView regardless of clickable density', async () => {
    const aiQuery = vi.fn(async () => [
      {
        name: 'Control 1',
        description: 'top left Control 1',
        rect: { left: 50, top: 50, width: 400, height: 75 },
      },
    ]);
    const controller = new AndroidAuditSessionController({
      autoVisualScan: true,
      captureIntervalMs: 60_000,
    });
    controller.attachDevice(
      'serial-webview',
      {
        captureAccessibilitySnapshot: vi.fn(async () =>
          webViewSnapshot('monthly-pay', 12),
        ),
        screenshotBase64: vi.fn(async () => 'unused'),
      },
      {
        aiLocate: vi.fn(),
        aiQuery,
      } as never,
    );

    await controller.start();
    await waitFor(() => controller.getState().visualScan.status === 'ready');

    expect(aiQuery).toHaveBeenCalledTimes(1);
    expect(aiQuery).toHaveBeenCalledWith(
      expect.stringContaining(
        'Return the full tappable region instead of a child icon or text label',
      ),
      expect.objectContaining({
        domIncluded: false,
        screenshotIncluded: true,
      }),
    );
    expect(controller.getState().visualScan).toMatchObject({
      automatic: true,
      status: 'ready',
    });
    expect(controller.getState().overlays).toHaveLength(1);
    controller.close();
  });

  it('does not retry a failed automatic visual inventory on every tree capture', async () => {
    const aiQuery = vi.fn(async () => {
      throw new Error('model unavailable');
    });
    const controller = new AndroidAuditSessionController({
      autoVisualScan: true,
      captureIntervalMs: 60_000,
    });
    controller.attachDevice(
      'serial-webview',
      {
        captureAccessibilitySnapshot: vi.fn(async () =>
          webViewSnapshot('monthly-pay', 2),
        ),
        screenshotBase64: vi.fn(async () => 'unused'),
      },
      {
        aiLocate: vi.fn(),
        aiQuery,
      } as never,
    );

    await controller.start();
    await waitFor(() => controller.getState().visualScan.status === 'error');
    await controller.captureNow();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(aiQuery).toHaveBeenCalledTimes(1);
    expect(controller.getState().status).toBe('ready');
    expect(controller.getState().visualScan).toMatchObject({
      automatic: true,
      error: 'model unavailable',
      status: 'error',
    });
    controller.close();
  });

  it('keeps page-scoped visual boxes when only screenshot pixels change', async () => {
    const captureAccessibilitySnapshot = vi.fn(async () => snapshot(20));
    const screenshotBase64 = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('data:image/png;base64,page-a')
      .mockResolvedValueOnce('data:image/png;base64,page-b');
    const controller = new AndroidAuditSessionController({
      captureIntervalMs: 60_000,
    });
    controller.attachDevice('serial-1', {
      captureAccessibilitySnapshot,
      screenshotBase64,
    });

    await controller.captureNow();
    await controller.setVisualElements([
      {
        description: '页面 A 上的视觉按钮',
        id: 'visual-page-a',
        name: '页面 A 按钮',
        rect: { left: 250, top: 40, width: 80, height: 80 },
        rectSource: 'manual',
      },
    ]);
    expect(controller.getState().visualElements).toHaveLength(1);

    await controller.captureNow();

    expect(screenshotBase64).not.toHaveBeenCalled();
    expect(controller.getState().visualElements).toHaveLength(1);
    expect(
      controller
        .getState()
        .overlays.some((overlay) => overlay.name === '页面 A 按钮'),
    ).toBe(true);
    controller.close();
  });

  it('exports source geometry with fresh replay results applied to source nodes', async () => {
    const captureAccessibilitySnapshot = vi
      .fn<() => Promise<AndroidAccessibilitySnapshot>>()
      .mockResolvedValueOnce(snapshot(20))
      .mockResolvedValueOnce(snapshot(80));
    const controller = new AndroidAuditSessionController({
      captureIntervalMs: 60_000,
    });
    controller.attachDevice('serial-1', {
      captureAccessibilitySnapshot,
      screenshotBase64: vi.fn(async () =>
        Buffer.from('fake-png').toString('base64'),
      ),
    });

    const download = await controller.exportReport();
    const readDownload = (relativePath: string): string => {
      const file = download.files.find(
        (candidate) => candidate.relativePath === relativePath,
      );
      if (!file) throw new Error(`Missing download file: ${relativePath}`);
      return Buffer.from(file.contentBase64, 'base64').toString();
    };
    const elements = JSON.parse(
      readDownload('pages/playground-current/elements.json'),
    );
    const sourceButton = elements.treeNodes.find(
      (candidate: { attrs: Record<string, string> }) =>
        candidate.attrs['resource-id'] === 'stable',
    );
    const reportHtml = readDownload('pages/playground-current/annotated.html');

    expect(sourceButton).toMatchObject({
      bounds: { left: 20, top: 20, width: 120, height: 60 },
      replayVerified: true,
    });
    expect(reportHtml).toContain('top:2.5%');
    expect(reportHtml).not.toContain('top:10%');
    expect(controller.getState().source?.captureId).toBe('capture-80');
    controller.close();
  });

  it('drops page-scoped visual boxes after the Accessibility layout changes', async () => {
    const captureAccessibilitySnapshot = vi
      .fn<() => Promise<AndroidAccessibilitySnapshot>>()
      .mockResolvedValueOnce(snapshot(20))
      .mockResolvedValueOnce(snapshot(80));
    const controller = new AndroidAuditSessionController({
      captureIntervalMs: 60_000,
    });
    controller.attachDevice('serial-1', {
      captureAccessibilitySnapshot,
      screenshotBase64: vi.fn(async () => 'unused'),
    });

    await controller.captureNow();
    await controller.setVisualElements([
      {
        description: 'Visual button on page A',
        id: 'visual-page-a',
        name: 'Page A button',
        rect: { left: 250, top: 40, width: 80, height: 80 },
        rectSource: 'manual',
      },
    ]);
    await controller.captureNow();

    expect(controller.getState().visualElements).toEqual([]);
    expect(
      controller
        .getState()
        .overlays.some((overlay) => overlay.name === 'Page A button'),
    ).toBe(false);
    controller.close();
  });

  it('drops page-scoped visual boxes when semantics change at the same bounds', async () => {
    const captureAccessibilitySnapshot = vi
      .fn<() => Promise<AndroidAccessibilitySnapshot>>()
      .mockResolvedValueOnce(semanticSnapshot('Page A'))
      .mockResolvedValueOnce(semanticSnapshot('Page B'));
    const controller = new AndroidAuditSessionController({
      captureIntervalMs: 60_000,
    });
    controller.attachDevice('serial-1', {
      captureAccessibilitySnapshot,
      screenshotBase64: vi.fn(async () => 'unused'),
    });

    await controller.captureNow();
    await controller.setVisualElements([
      {
        description: 'Visual control on Page A',
        id: 'visual-page-a',
        name: 'Page A control',
        rect: { left: 250, top: 40, width: 80, height: 80 },
        rectSource: 'manual',
      },
    ]);
    await controller.captureNow();

    expect(controller.getState().source?.captureId).toBe('capture-Page B');
    expect(controller.getState().visualElements).toEqual([]);
    expect(
      controller
        .getState()
        .overlays.some((overlay) => overlay.name === 'Page A control'),
    ).toBe(false);
    controller.close();
  });
});
