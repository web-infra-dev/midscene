// @vitest-environment jsdom
import type { PlaygroundControllerResult } from '@midscene/playground-app';
import type { StudioPlaygroundContextValue } from '@renderer/playground/types';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import Sidebar from '../src/renderer/components/Sidebar';
import { StudioPlaygroundContext } from '../src/renderer/playground/useStudioPlayground';

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

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

function createConnectedWebContextValue() {
  const destroySession = vi.fn(async () => undefined);
  const createSession = vi.fn(async () => false);
  const setFieldsValue = vi.fn();
  const context = createReadyContextValue();

  context.controller.state = {
    ...context.controller.state,
    form: {
      getFieldsValue: () => ({}),
      setFieldsValue,
    },
    formValues: {
      platformId: 'web',
    },
    runtimeInfo: {
      platformId: 'web',
      title: 'Midscene Web Playground',
      interface: {
        type: 'puppeteer',
        description: 'https://example.com',
      },
      preview: {
        kind: 'mjpeg',
        mjpegPath: '/mjpeg',
        screenshotPath: '/screenshot',
        capabilities: [{ kind: 'mjpeg' }],
      },
      executionUxHints: [],
      metadata: {
        sessionConnected: true,
        sessionDisplayName: 'https://example.com',
        setupState: 'ready',
        url: 'https://example.com',
      },
    },
    sessionViewState: {
      connected: true,
      setupState: 'ready',
    },
  } as unknown as PlaygroundControllerResult['state'];
  context.controller.actions = {
    ...context.controller.actions,
    createSession,
    destroySession,
  } as unknown as PlaygroundControllerResult['actions'];

  return {
    context,
    createSession,
    destroySession,
    setFieldsValue,
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

  it('does not disconnect when clicking the active Web session in the sidebar', async () => {
    const { context, createSession, destroySession, setFieldsValue } =
      createConnectedWebContextValue();
    const onSelectDevice = vi.fn();
    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(
          StudioPlaygroundContext.Provider,
          { value: context },
          createElement(Sidebar, {
            activeView: 'device',
            onSelectDevice,
            onSelectOverview: () => undefined,
          }),
        ),
      );
    });

    const webButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('https://example.com'),
    );
    expect(webButton).toBeTruthy();

    await act(async () => {
      webButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSelectDevice).toHaveBeenCalledTimes(1);
    expect(destroySession).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
    expect(setFieldsValue).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });
});
