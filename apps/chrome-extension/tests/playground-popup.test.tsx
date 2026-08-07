import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';
/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import type React from 'react';
import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';

const setPopupTab = rs.fn();
const getAgentRefs: Array<unknown> = [];
const constructedAgentOptions: Array<unknown> = [];
const verifyCallbacks: Array<unknown> = [];
const configProviderThemes: Array<unknown> = [];
let sdkSyncEffectCount = 0;
let prefersDarkMode = false;
let themeChangeListener: (() => void) | undefined;

rs.mock('@midscene/core/ai-model', () => ({
  runConnectivityTest: rs.fn(),
}));

rs.mock('@midscene/visualizer', () => ({
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
  globalThemeConfig: () => ({
    token: { colorPrimary: '#base-primary' },
  }),
  safeOverrideAIConfig: rs.fn(),
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

rs.mock('antd', () => ({
  App: Object.assign(
    ({ children }: { children: React.ReactNode }) => children,
    {
      useApp: () => ({
        message: {
          error: rs.fn(),
          info: rs.fn(),
          success: rs.fn(),
        },
      }),
    },
  ),
  ConfigProvider: ({
    children,
    theme,
  }: {
    children: React.ReactNode;
    theme?: unknown;
  }) => {
    configProviderThemes.push(theme);
    return children;
  },
  Dropdown: ({ children }: { children: React.ReactNode }) => children,
  theme: {
    darkAlgorithm: 'dark-algorithm',
    defaultAlgorithm: 'default-algorithm',
  },
}));

rs.mock('@midscene/shared/env', () => ({
  MIDSCENE_MODEL_API_KEY: 'test-key',
}));

rs.mock('@midscene/web/chrome-extension', () => ({
  ChromeExtensionProxyPage: class ChromeExtensionProxyPage {},
  ChromeExtensionProxyPageAgent: class ChromeExtensionProxyPageAgent {
    constructor(_page: unknown, options: unknown) {
      constructedAgentOptions.push(options);
    }
  },
}));

rs.mock('../src/components/playground', () => ({
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

rs.mock('../src/extension/bridge', () => ({
  default: () => <div>bridge</div>,
}));

rs.mock('../src/extension/recorder', () => ({
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
    configProviderThemes.length = 0;
    sdkSyncEffectCount = 0;
    prefersDarkMode = false;
    themeChangeListener = undefined;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: rs.fn(() => ({
        addEventListener: (eventName: string, listener: () => void) => {
          if (eventName === 'change') themeChangeListener = listener;
        },
        matches: prefersDarkMode,
        media: '(prefers-color-scheme: dark)',
        removeEventListener: rs.fn(),
      })),
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-theme');
  });

  it('uses Ant Design dark tokens for the system dark theme', async () => {
    prefersDarkMode = true;
    const { PlaygroundPopup } = await import('../src/extension/popup');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<PlaygroundPopup />);
      await Promise.resolve();
    });

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(configProviderThemes.at(-1)).toEqual(
      expect.objectContaining({
        algorithm: 'dark-algorithm',
        token: expect.objectContaining({ colorPrimary: '#2D5290' }),
      }),
    );
    expect(themeChangeListener).toEqual(expect.any(Function));

    await act(async () => {
      root.unmount();
    });
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
