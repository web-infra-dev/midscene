import type { PlaygroundControllerResult } from '@midscene/playground-app';
import type { StudioPlaygroundContextValue } from '@renderer/playground/types';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import MainContent from '../src/renderer/components/MainContent';
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
      computer: [
        {
          platformId: 'computer',
          id: 'display-1',
          label: 'DELL U2720Q',
        },
      ],
      harmony: [],
      web: [],
    },
    refreshDiscoveredDevices: vi.fn(async () => undefined),
    restartPlayground: vi.fn(async () => undefined),
    setDiscoveryPollingPaused: vi.fn(),
  };
}

describe('MainContent overview', () => {
  it('renders discovered devices without requiring model env configuration', () => {
    const html = renderToStaticMarkup(
      createElement(
        StudioPlaygroundContext.Provider,
        { value: createReadyContextValue() },
        createElement(MainContent, {
          activeView: 'overview',
        }),
      ),
    );

    expect(html).toContain('DELL U2720Q');
    expect(html).toContain('No devices');
    expect(html).not.toContain('Finish environment setup');
  });

  it('keeps the chat control in the window drag region', () => {
    const html = renderToStaticMarkup(
      createElement(
        StudioPlaygroundContext.Provider,
        { value: createReadyContextValue() },
        createElement(MainContent, {
          activeView: 'device',
        }),
      ),
    );

    expect(html).toContain('app-no-drag flex h-8 items-center rounded-lg');
    expect(html).toContain(
      'app-drag flex h-8 items-center gap-[4.02px] rounded-lg',
    );
    expect(html).toContain('Chat');
  });
});
