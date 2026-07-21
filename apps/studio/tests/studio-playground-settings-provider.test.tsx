// @vitest-environment jsdom

import { type PropsWithChildren, act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADVANCED_SETTINGS_STORAGE_KEY } from '../src/renderer/settings/advanced-settings-storage';
import type { StudioRuntimeSettingsV1 } from '../src/shared/advanced-settings';

const mocks = vi.hoisted(() => ({
  readyProps: null as null | {
    applyRuntimeSettings: (settings: StudioRuntimeSettingsV1) => Promise<void>;
    serverUrl: string;
  },
}));

vi.mock('../src/renderer/playground/StudioPlaygroundReadyProvider', () => ({
  default: (
    props: PropsWithChildren<{
      applyRuntimeSettings: (
        settings: StudioRuntimeSettingsV1,
      ) => Promise<void>;
      serverUrl: string;
    }>,
  ) => {
    mocks.readyProps = props;
    return null;
  },
}));

import { StudioPlaygroundProvider } from '../src/renderer/playground/StudioPlaygroundProvider';
import { useStudioPlayground } from '../src/renderer/playground/useStudioPlayground';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('StudioPlaygroundProvider advanced settings', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.readyProps = null;
    window.localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('boots with stored settings and persists only a successful restart', async () => {
    const storedSettings: StudioRuntimeSettingsV1 = {
      schemaVersion: 1,
      agentOptions: { waitAfterAction: 250 },
    };
    const nextSettings: StudioRuntimeSettingsV1 = {
      schemaVersion: 1,
      agentOptions: {
        replanningCycleLimit: 0,
        screenshotShrinkFactor: 24,
      },
    };
    window.localStorage.setItem(
      ADVANCED_SETTINGS_STORAGE_KEY,
      JSON.stringify(storedSettings),
    );
    const getPlaygroundBootstrap = vi.fn(async () => ({
      status: 'ready' as const,
      serverUrl: 'http://127.0.0.1:5800',
      port: 5800,
      error: null,
    }));
    const restartPlayground = vi.fn(async () => ({
      status: 'ready' as const,
      serverUrl: 'http://127.0.0.1:5801',
      port: 5801,
      error: null,
    }));
    vi.stubGlobal('studioRuntime', {
      getPlaygroundBootstrap,
      restartPlayground,
      discoverDevices: vi.fn(async () => ({ devices: [], errors: [] })),
      onDiscoveredDevicesChanged: vi.fn(() => () => undefined),
      setDiscoveryPollingPaused: vi.fn(async () => undefined),
    });
    Object.defineProperty(window, 'studioRuntime', {
      configurable: true,
      value: globalThis.studioRuntime,
    });

    await act(async () => {
      root.render(
        <StudioPlaygroundProvider>
          <div>Studio</div>
        </StudioPlaygroundProvider>,
      );
    });

    expect(getPlaygroundBootstrap).toHaveBeenCalledWith(storedSettings);
    expect(mocks.readyProps).not.toBeNull();

    await act(async () => {
      await mocks.readyProps?.applyRuntimeSettings(nextSettings);
    });

    expect(restartPlayground).toHaveBeenCalledWith(nextSettings);
    expect(
      JSON.parse(window.localStorage.getItem(ADVANCED_SETTINGS_STORAGE_KEY)!),
    ).toEqual(nextSettings);

    restartPlayground.mockResolvedValueOnce({
      status: 'ready',
      serverUrl: 'http://127.0.0.1:5802',
      port: 5802,
      error: null,
      settingsApplyError: 'Synthetic restart failure',
    });
    const failedSettings: StudioRuntimeSettingsV1 = {
      schemaVersion: 1,
      agentOptions: { waitAfterAction: 999 },
    };

    await act(async () => {
      await expect(
        mocks.readyProps?.applyRuntimeSettings(failedSettings),
      ).rejects.toThrow('Synthetic restart failure');
    });
    expect(
      JSON.parse(window.localStorage.getItem(ADVANCED_SETTINGS_STORAGE_KEY)!),
    ).toEqual(nextSettings);
    expect(mocks.readyProps?.serverUrl).toBe('http://127.0.0.1:5802');
  });

  it('ignores an old bootstrap response after applying new settings', async () => {
    type ReadyBootstrap = {
      status: 'ready';
      serverUrl: string;
      port: number;
      error: null;
    };
    let resolveInitialBootstrap: ((value: ReadyBootstrap) => void) | undefined;
    const initialBootstrap = new Promise<ReadyBootstrap>((resolve) => {
      resolveInitialBootstrap = resolve;
    });
    const getPlaygroundBootstrap = vi
      .fn()
      .mockReturnValueOnce(initialBootstrap)
      .mockResolvedValue({
        status: 'ready' as const,
        serverUrl: 'http://127.0.0.1:5801',
        port: 5801,
        error: null,
      });
    const restartPlayground = vi.fn(async () => ({
      status: 'ready' as const,
      serverUrl: 'http://127.0.0.1:5801',
      port: 5801,
      error: null,
    }));
    const runtimeBridge = {
      getPlaygroundBootstrap,
      restartPlayground,
      discoverDevices: vi.fn(async () => ({ devices: [], errors: [] })),
      onDiscoveredDevicesChanged: vi.fn(() => () => undefined),
      setDiscoveryPollingPaused: vi.fn(async () => undefined),
    };
    vi.stubGlobal('studioRuntime', runtimeBridge);
    Object.defineProperty(window, 'studioRuntime', {
      configurable: true,
      value: runtimeBridge,
    });

    let applyWhileBooting:
      | ((settings: StudioRuntimeSettingsV1) => Promise<void>)
      | undefined;
    function CaptureBootingContext() {
      applyWhileBooting = useStudioPlayground().applyRuntimeSettings;
      return null;
    }

    await act(async () => {
      root.render(
        <StudioPlaygroundProvider>
          <CaptureBootingContext />
        </StudioPlaygroundProvider>,
      );
    });

    const settings: StudioRuntimeSettingsV1 = {
      schemaVersion: 1,
      agentOptions: { waitAfterAction: 300 },
    };
    await act(async () => {
      await applyWhileBooting?.(settings);
    });
    expect(mocks.readyProps?.serverUrl).toBe('http://127.0.0.1:5801');

    await act(async () => {
      resolveInitialBootstrap?.({
        status: 'ready',
        serverUrl: 'http://127.0.0.1:5800',
        port: 5800,
        error: null,
      });
      await initialBootstrap;
    });

    expect(mocks.readyProps?.serverUrl).toBe('http://127.0.0.1:5801');
    expect(restartPlayground).toHaveBeenCalledWith(settings);
  });
});
