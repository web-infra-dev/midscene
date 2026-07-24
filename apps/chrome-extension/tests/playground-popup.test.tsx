/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import type React from 'react';
import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const setPopupTab = vi.fn();
const getAgentRefs: Array<unknown> = [];
const constructedAgentOptions: Array<unknown> = [];
const verifyCallbacks: Array<unknown> = [];
let sdkSyncEffectCount = 0;

vi.mock('@midscene/core/ai-model', () => ({
  runConnectivityTest: vi.fn(),
}));

vi.mock('@midscene/visualizer', () => ({
  NavActions: ({
    onAgentOptionsSave,
    onVerify,
  }: {
    onAgentOptionsSave?: (options: Record<string, number>) => void;
    onVerify?: unknown;
  }) => (
    <>
      <button
        onClick={() =>
          onAgentOptionsSave?.({
            replanningCycleLimit: 12,
            screenshotShrinkFactor: 2,
            waitAfterAction: 500,
          })
        }
        type="button"
      >
        Save agent options
      </button>
      <button onClick={() => verifyCallbacks.push(onVerify)} type="button">
        Capture verify callback
      </button>
    </>
  ),
  globalThemeConfig: () => ({}),
  safeOverrideAIConfig: vi.fn(),
  useEnvConfig: (selector?: (state: Record<string, unknown>) => unknown) => {
    const state = {
      config: {
        MIDSCENE_MODEL_API_KEY: 'test-key',
        MIDSCENE_MODEL_NAME: 'test-model',
      },
      setPopupTab,
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock('antd', () => ({
  App: Object.assign(
    ({ children }: { children: React.ReactNode }) => children,
    {
      useApp: () => ({
        message: {
          error: vi.fn(),
          info: vi.fn(),
          success: vi.fn(),
        },
      }),
    },
  ),
  ConfigProvider: ({ children }: { children: React.ReactNode }) => children,
  Dropdown: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@midscene/shared/env', () => ({
  MIDSCENE_MODEL_API_KEY: 'test-key',
}));

vi.mock('@midscene/web/chrome-extension', () => ({
  ChromeExtensionProxyPage: class ChromeExtensionProxyPage {},
  ChromeExtensionProxyPageAgent: class ChromeExtensionProxyPageAgent {
    constructor(_page: unknown, options: unknown) {
      constructedAgentOptions.push(options);
    }
  },
}));

vi.mock('../src/components/playground', () => ({
  BrowserExtensionPlayground: ({
    getAgent,
    onPlaygroundSDKChange,
  }: {
    getAgent: unknown;
    onPlaygroundSDKChange?: (sdk: { id: string }) => void;
  }) => {
    getAgentRefs.push(getAgent);

    useEffect(() => {
      sdkSyncEffectCount += 1;
      onPlaygroundSDKChange?.({ id: 'sdk' });
    }, [getAgent, onPlaygroundSDKChange]);

    return <div>playground</div>;
  },
}));

vi.mock('../src/extension/bridge', () => ({
  default: () => <div>bridge</div>,
}));

vi.mock('../src/extension/recorder', () => ({
  default: () => <div>recorder</div>,
}));

describe('PlaygroundPopup', () => {
  beforeEach(() => {
    // Tell React this test environment expects act-wrapped updates.
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    setPopupTab.mockClear();
    getAgentRefs.length = 0;
    constructedAgentOptions.length = 0;
    verifyCallbacks.length = 0;
    sdkSyncEffectCount = 0;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps getAgent stable when playground SDK state updates', async () => {
    const { PlaygroundPopup } = await import('../src/extension/popup');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<PlaygroundPopup />);
      await Promise.resolve();
    });

    expect(sdkSyncEffectCount).toBe(1);
    expect(getAgentRefs).toHaveLength(2);
    expect(getAgentRefs[0]).toBe(getAgentRefs[1]);

    await act(async () => {
      root.unmount();
    });
  });

  it('persists Agent options and supplies them to newly created Agents', async () => {
    const { PlaygroundPopup } = await import('../src/extension/popup');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<PlaygroundPopup />);
      await Promise.resolve();
    });
    await act(async () => {
      const saveButton = Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent === 'Save agent options',
      );
      saveButton?.click();
      await Promise.resolve();
    });

    const expectedOptions = {
      replanningCycleLimit: 12,
      screenshotShrinkFactor: 2,
      waitAfterAction: 500,
    };
    expect(
      JSON.parse(
        localStorage.getItem('midscene-extension-agent-options') || '{}',
      ),
    ).toEqual(expectedOptions);

    const getAgent = getAgentRefs.at(-1) as () => unknown;
    getAgent();
    expect(constructedAgentOptions.at(-1)).toEqual(expectedOptions);

    await act(async () => {
      root.unmount();
    });
  });

  it('provides model verification outside Playground mode', async () => {
    const { PlaygroundPopup } = await import('../src/extension/popup');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<PlaygroundPopup />);
      await Promise.resolve();
    });
    await act(async () => {
      Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent === 'Capture verify callback')
        ?.click();
    });

    expect(verifyCallbacks.at(-1)).toEqual(expect.any(Function));
    await act(async () => {
      root.unmount();
    });
  });
});
