import type { PlaygroundControllerResult } from '@midscene/playground-app';
import type { StudioPlaygroundContextValue } from '@renderer/playground/types';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import Sidebar from '../src/renderer/components/Sidebar';
import { StudioPlaygroundContext } from '../src/renderer/playground/useStudioPlayground';

function createReadyContextValue(): StudioPlaygroundContextValue {
  return {
    phase: 'ready',
    serverUrl: 'http://127.0.0.1:5800',
    controller: {
      state: {
        form: {
          getFieldsValue: () => ({}),
          setFieldsValue: () => undefined,
        },
        formValues: {},
        runtimeInfo: null,
        sessionSetup: {
          fields: [],
          targets: [],
        },
        sessionViewState: {
          connected: false,
          setupState: 'idle',
        },
      },
      actions: {
        refreshSessionSetup: vi.fn(async () => undefined),
        createSession: vi.fn(async () => false),
        destroySession: vi.fn(async () => undefined),
      },
    } as unknown as PlaygroundControllerResult,
    discoveredDevices: {
      android: [],
      ios: [],
      computer: [],
      harmony: [],
      web: [],
    },
    refreshDiscoveredDevices: vi.fn(async () => undefined),
    restartPlayground: vi.fn(async () => undefined),
    setDiscoveryPollingPaused: vi.fn(),
  };
}

describe('Sidebar device list', () => {
  it('shows empty platform rows instead of an iOS setup hint when no devices exist', () => {
    const html = renderToStaticMarkup(
      createElement(
        StudioPlaygroundContext.Provider,
        { value: createReadyContextValue() },
        createElement(Sidebar, {
          activeView: 'overview',
          onSelectDevice: () => undefined,
          onSelectOverview: () => undefined,
        }),
      ),
    );

    expect(html).not.toContain('Set up iOS via the playground form');
    expect(html.match(/No devices/g)).toHaveLength(5);
  });
});
