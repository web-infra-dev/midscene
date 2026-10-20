// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { MobilePreviewFrame } from '../src/renderer/components/MainContent/MobilePreviewFrame';

let mockStageWidth = 1000;
let mockStageHeight = 1000;

class MockResizeObserver {
  private callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    Object.defineProperties(target, {
      clientWidth: {
        configurable: true,
        value: mockStageWidth,
      },
      clientHeight: {
        configurable: true,
        value: mockStageHeight,
      },
    });
    this.callback([], this as unknown as ResizeObserver);
  }

  disconnect() {}
}

describe('MobilePreviewFrame', () => {
  beforeAll(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    mockStageWidth = 1000;
    mockStageHeight = 1000;
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function renderMobilePreviewFrame(options: {
    aspectRatio?: number;
    enabled?: boolean;
  }) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(
          MobilePreviewFrame,
          {
            enabled: options.enabled ?? true,
            highlightActive: false,
            aspectRatio: options.aspectRatio,
          },
          createElement('div', null, 'preview'),
        ),
      );
    });

    return { container, root };
  }

  it('offsets the mobile viewport and caps it at the ideal height', async () => {
    const aspectRatio = 1024 / 952;
    const expectedWidth = 716 * aspectRatio;
    const { container, root } = await renderMobilePreviewFrame({ aspectRatio });
    const viewport = container.querySelector<HTMLElement>(
      '.mobile-preview-frame-viewport',
    );

    expect(viewport?.className).toContain('translate-y-[-18px]');
    expect(viewport?.className).toContain('rounded-[12px]');
    expect(viewport?.style.width).toBe(`${expectedWidth}px`);
    expect(viewport?.style.height).toBe('716px');
    expect(container.innerHTML).not.toContain('max-w-[392px]');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('shrinks the mobile viewport when the container is shorter than the ideal height', async () => {
    mockStageWidth = 1000;
    mockStageHeight = 400;
    const aspectRatio = 0.5;
    const { container, root } = await renderMobilePreviewFrame({ aspectRatio });
    const viewport = container.querySelector<HTMLElement>(
      '.mobile-preview-frame-viewport',
    );

    expect(viewport?.style.height).toBe('344px');
    expect(viewport?.style.width).toBe('172px');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('does not offset the unframed preview surface', async () => {
    const { container, root } = await renderMobilePreviewFrame({
      enabled: false,
    });
    const viewport = container.querySelector<HTMLElement>(
      '.mobile-preview-frame-viewport',
    );

    expect(viewport?.className).not.toContain('translate-y-[-18px]');
    expect(viewport?.style.width).toBe('');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
