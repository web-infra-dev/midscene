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
let sdkSyncEffectCount = 0;

rs.mock('@midscene/visualizer', () => ({
  NavActions: () => null,
  globalThemeConfig: () => ({}),
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
  ConfigProvider: ({ children }: { children: React.ReactNode }) => children,
  Dropdown: ({ children }: { children: React.ReactNode }) => children,
}));

rs.mock('@midscene/shared/env', () => ({
  MIDSCENE_MODEL_API_KEY: 'test-key',
}));

rs.mock('@midscene/web/chrome-extension', () => ({
  ChromeExtensionProxyPage: class ChromeExtensionProxyPage {},
  ChromeExtensionProxyPageAgent: class ChromeExtensionProxyPageAgent {},
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

// TODO(rstest): un-skip when @rstest/core restores the pluginReact automatic
// JSX runtime for files whose test environment is set via a per-file docblock.
// On 0.11.1 the docblock env override (node -> jsdom) drops the plugin pipeline,
// so JSX compiles to classic `React.createElement` and throws "React is not
// defined" at render time. See RSTEST-MIGRATION-WORKAROUNDS.md.
describe.skip('PlaygroundPopup', () => {
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
});
