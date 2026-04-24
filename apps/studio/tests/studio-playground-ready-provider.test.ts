import type { PlaygroundControllerResult } from '@midscene/playground-app';
import { type ReactNode, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import StudioPlaygroundReadyProvider from '../src/renderer/playground/StudioPlaygroundReadyProvider';

const { usePlaygroundControllerMock } = vi.hoisted(() => ({
  usePlaygroundControllerMock: vi.fn(
    () =>
      ({
        actions: {},
        state: {},
      }) as unknown as PlaygroundControllerResult,
  ),
}));

vi.mock('@midscene/playground-app', () => ({
  PlaygroundThemeProvider: ({ children }: { children: ReactNode }) => children,
  usePlaygroundController: usePlaygroundControllerMock,
}));

describe('StudioPlaygroundReadyProvider', () => {
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

    expect(usePlaygroundControllerMock).toHaveBeenCalledWith({
      initialFormValues: { platformId: 'android' },
      serverUrl: 'http://127.0.0.1:5800',
    });
  });
});
