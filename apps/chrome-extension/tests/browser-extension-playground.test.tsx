/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import type React from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockPlaygroundSDK = vi.fn();
const universalPlaygroundProps: Array<Record<string, unknown>> = [];
const mockTabsQuery = vi.fn();
const mockOnActivatedAddListener = vi.fn();
const mockOnActivatedRemoveListener = vi.fn();

vi.mock('@midscene/playground', () => ({
  PlaygroundSDK: class MockPlaygroundSDK {
    constructor(config: unknown) {
      mockPlaygroundSDK(config);
    }
  },
}));

vi.mock('@midscene/visualizer', () => ({
  UniversalPlayground: (props: Record<string, unknown>) => {
    universalPlaygroundProps.push(props);
    return <div>universal-playground</div>;
  },
  useEnvConfig: (selector?: (state: Record<string, unknown>) => unknown) => {
    const state = {
      forceSameTabNavigation: true,
      config: {},
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock('../../src/utils/chrome', () => ({
  getExtensionVersion: () => '1.0.0',
}));

describe('BrowserExtensionPlayground', () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;

    universalPlaygroundProps.length = 0;
    mockPlaygroundSDK.mockClear();
    mockTabsQuery.mockImplementation(
      (_query: unknown, callback: (tabs: Array<{ id?: number }>) => void) => {
        callback([{ id: 7 }]);
      },
    );
    mockOnActivatedAddListener.mockClear();
    mockOnActivatedRemoveListener.mockClear();

    Object.defineProperty(globalThis, 'chrome', {
      configurable: true,
      value: {
        tabs: {
          query: mockTabsQuery,
          onActivated: {
            addListener: mockOnActivatedAddListener,
            removeListener: mockOnActivatedRemoveListener,
          },
        },
      },
    });
    vi.stubGlobal('__SDK_VERSION__', 'test-sdk');
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('creates PlaygroundSDK even when env config is empty', async () => {
    const { BrowserExtensionPlayground } = await import(
      '../src/components/playground'
    );
    const onPlaygroundSDKChange = vi.fn();
    const getAgent = vi.fn(() => ({ page: { screenshot: vi.fn() } }));
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <BrowserExtensionPlayground
          getAgent={getAgent}
          showContextPreview={false}
          onPlaygroundSDKChange={onPlaygroundSDKChange}
        />,
      );
      await Promise.resolve();
    });

    expect(mockTabsQuery).toHaveBeenCalled();
    expect(mockPlaygroundSDK).toHaveBeenCalledTimes(1);
    expect(onPlaygroundSDKChange).toHaveBeenCalledWith(expect.any(Object));
    expect(universalPlaygroundProps.at(-1)?.playgroundSDK).toEqual(
      expect.any(Object),
    );

    await act(async () => {
      root.unmount();
    });
  });
});
