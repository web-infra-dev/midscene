// @vitest-environment jsdom
import type { PlaygroundControllerResult } from '@midscene/playground-app';
import { type ReactNode, act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StudioPlaygroundReadyProvider from '../src/renderer/playground/StudioPlaygroundReadyProvider';

const { setFieldsValueMock, usePlaygroundControllerMock } = vi.hoisted(() => {
  const setFieldsValueMock = vi.fn();

  return {
    setFieldsValueMock,
    usePlaygroundControllerMock: vi.fn(
      () =>
        ({
          actions: {},
          state: {
            form: {
              setFieldsValue: setFieldsValueMock,
            },
            formValues: {},
          },
        }) as unknown as PlaygroundControllerResult,
    ),
  };
});

vi.mock('@midscene/playground-app', () => ({
  PlaygroundThemeProvider: ({ children }: { children: ReactNode }) => children,
  usePlaygroundController: usePlaygroundControllerMock,
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('StudioPlaygroundReadyProvider', () => {
  afterEach(() => {
    vi.clearAllMocks();
    (window as { electronShell?: unknown }).electronShell = undefined;
    document.body.replaceChildren();
  });

  it('seeds the controller with the default Android platform', () => {
    renderToStaticMarkup(
      createElement(
        StudioPlaygroundReadyProvider,
        {
          refreshDiscoveredDevices: async () => undefined,
          restartPlayground: async () => undefined,
          setDiscoveryPollingPaused: () => undefined,
          serverUrl: 'http://127.0.0.1:5800',
        },
        createElement('div', null, 'child'),
      ),
    );

    expect(usePlaygroundControllerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        initialFormValues: { platformId: 'android' },
        serverUrl: 'http://127.0.0.1:5800',
        onCountdownFinish: expect.any(Function),
      }),
    );
  });

  it('minimizes Studio when the controller countdown finishes', () => {
    const minimizeWindow = vi.fn(async () => undefined);
    window.electronShell = {
      minimizeWindow,
    } as unknown as typeof window.electronShell;

    renderToStaticMarkup(
      createElement(
        StudioPlaygroundReadyProvider,
        {
          refreshDiscoveredDevices: async () => undefined,
          restartPlayground: async () => undefined,
          setDiscoveryPollingPaused: () => undefined,
          serverUrl: 'http://127.0.0.1:5800',
        },
        createElement('div', null, 'child'),
      ),
    );

    const options = usePlaygroundControllerMock.mock.calls.at(-1)?.[0];
    options.onCountdownFinish();

    expect(minimizeWindow).toHaveBeenCalledTimes(1);
  });

  it('writes the first discovered Android device into the create agent form', async () => {
    usePlaygroundControllerMock.mockReturnValue({
      actions: {},
      state: {
        form: {
          setFieldsValue: setFieldsValueMock,
        },
        formValues: {
          platformId: 'android',
        },
      },
    } as unknown as PlaygroundControllerResult);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(
          StudioPlaygroundReadyProvider,
          {
            discoveredDevices: {
              android: [
                {
                  platformId: 'android',
                  id: 'device-1',
                  label: 'Pixel 8',
                  sessionValues: {
                    deviceId: 'device-1',
                  },
                },
              ],
              ios: [],
              computer: [],
              harmony: [],
              web: [],
            },
            refreshDiscoveredDevices: async () => undefined,
            restartPlayground: async () => undefined,
            setDiscoveryPollingPaused: () => undefined,
            serverUrl: 'http://127.0.0.1:5800',
          },
          createElement('div', null, 'child'),
        ),
      );
    });

    expect(setFieldsValueMock).toHaveBeenCalledWith({
      platformId: 'android',
      'android.deviceId': 'device-1',
    });

    await act(async () => {
      root.unmount();
    });
  });
});
