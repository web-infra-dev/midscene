import type { PlaygroundControllerResult } from '@midscene/playground-app';
import type { StudioPlaygroundContextValue } from '@renderer/playground/types';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import MainContent from '../src/renderer/components/MainContent';
import { StudioPlaygroundContext } from '../src/renderer/playground/useStudioPlayground';

type ReadyStudioPlaygroundContextValue = Extract<
  StudioPlaygroundContextValue,
  { phase: 'ready' }
>;

vi.mock('@midscene/playground-app', () => ({
  // Real PlaygroundPreview pulls in a WASM helper through visualizer; the
  // tests only care that MainContent threads the connecting overlay
  // through, so stub it down to that overlay.
  PlaygroundPreview: ({ connectingOverlay }: { connectingOverlay?: unknown }) =>
    connectingOverlay ?? null,
}));

function createReadyContextValue(): ReadyStudioPlaygroundContextValue {
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

function createConnectedWebContextValue(): ReadyStudioPlaygroundContextValue {
  const context = createReadyContextValue();
  context.controller.state = {
    ...context.controller.state,
    serverOnline: true,
    isUserOperating: false,
    playgroundSDK: {
      interact: vi.fn(async () => ({ ok: true })),
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
        sessionDisplayName: 'https://example.com',
      },
    },
    sessionViewState: {
      connected: true,
      setupState: 'ready',
    },
  } as unknown as PlaygroundControllerResult['state'];
  return context;
}

function createDisconnectedWebContextValue(): ReadyStudioPlaygroundContextValue {
  const context = createReadyContextValue();
  context.controller.state = {
    ...context.controller.state,
    serverOnline: true,
    formValues: {
      platformId: 'web',
    },
    sessionViewState: {
      connected: false,
      setupState: 'ready',
    },
  } as unknown as PlaygroundControllerResult['state'];
  return context;
}

function createOpeningWebContextValue(): ReadyStudioPlaygroundContextValue {
  const context = createDisconnectedWebContextValue();
  context.controller.state = {
    ...context.controller.state,
    sessionMutating: true,
  } as unknown as PlaygroundControllerResult['state'];
  return context;
}

function createOpeningComputerWithStaleAndroidContextValue(): ReadyStudioPlaygroundContextValue {
  const context = createReadyContextValue();
  context.controller.state = {
    ...context.controller.state,
    serverOnline: true,
    formValues: {
      platformId: 'android',
    },
    sessionMutating: true,
    sessionViewState: {
      connected: false,
      setupState: 'ready',
    },
  } as unknown as PlaygroundControllerResult['state'];
  return context;
}

function createConnectedComputerContextValue(): ReadyStudioPlaygroundContextValue {
  const context = createReadyContextValue();
  context.controller.state = {
    ...context.controller.state,
    serverOnline: true,
    isUserOperating: false,
    playgroundSDK: {
      interact: vi.fn(async () => ({ ok: true })),
    },
    runtimeInfo: {
      platformId: 'computer',
      title: 'Midscene Computer Playground',
      interface: {
        type: 'macos',
        description: 'DELL U2720Q',
      },
      preview: {
        kind: 'mjpeg',
        mjpegPath: '/mjpeg',
        screenshotPath: '/screenshot',
        capabilities: [{ kind: 'mjpeg' }],
      },
      executionUxHints: [],
      metadata: {
        sessionDisplayName: 'DELL U2720Q',
      },
    },
    sessionViewState: {
      connected: true,
      setupState: 'ready',
    },
  } as unknown as PlaygroundControllerResult['state'];
  return context;
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
    expect(html).toContain('No device');
    expect(html).toContain('Please plug in the device and check.');
    expect(html).not.toContain('Finish environment setup');
    expect(html).not.toContain('未检测到 adb');
  });

  it('keeps overview content on one column rail and renders device rows without card borders', () => {
    const html = renderToStaticMarkup(
      createElement(
        StudioPlaygroundContext.Provider,
        { value: createReadyContextValue() },
        createElement(MainContent, {
          activeView: 'overview',
        }),
      ),
    );

    expect(html).toContain('flex w-[704px] flex-col gap-[32px]');
    expect(html).toContain('flex w-[704px] flex-col');
    expect(html).toContain('w-[704px] shrink-0 overflow-hidden');
    expect(html).toContain('rounded-[8px] bg-transparent');
    expect(html).not.toContain(
      'border border-border-subtle bg-surface-elevated',
    );
  });

  it('renders iOS and Web create cards collapsed by default', () => {
    const html = renderToStaticMarkup(
      createElement(
        StudioPlaygroundContext.Provider,
        { value: createReadyContextValue() },
        createElement(MainContent, {
          activeView: 'overview',
        }),
      ),
    );

    expect(html).toContain('Connect WebDriverAgent');
    expect(html).toContain('Open a web page');
    expect(html).not.toContain('WebDriverAgent host');
    expect(html).not.toContain('https://example.com');
  });

  it('replaces the Android empty state with an adb-missing hint when discovery reports a toolchain error', () => {
    const baseContext = createReadyContextValue();
    if (baseContext.phase !== 'ready') {
      throw new Error('expected ready context');
    }
    const context: StudioPlaygroundContextValue = {
      ...baseContext,
      discoveryErrors: {
        android: { platformId: 'android', kind: 'toolchain-missing' },
      },
    };

    const html = renderToStaticMarkup(
      createElement(
        StudioPlaygroundContext.Provider,
        { value: context },
        createElement(MainContent, {
          activeView: 'overview',
        }),
      ),
    );

    expect(html).toContain('ADB not detected');
  });

  it('keeps the disconnect control out of the window drag region', () => {
    const html = renderToStaticMarkup(
      createElement(
        StudioPlaygroundContext.Provider,
        { value: createReadyContextValue() },
        createElement(MainContent, {
          activeView: 'device',
        }),
      ),
    );

    expect(html).toContain(
      'app-no-drag group/disconnect-pill relative flex shrink-0 items-center',
    );
    expect(html).toContain('aria-label="Disconnect"');
    expect(html).toContain('Disconnect');
  });

  it('renders browser navigation controls for connected Web sessions', () => {
    const html = renderToStaticMarkup(
      createElement(
        StudioPlaygroundContext.Provider,
        { value: createConnectedWebContextValue() },
        createElement(MainContent, {
          activeView: 'device',
        }),
      ),
    );

    expect(html).toContain('aria-label="Web navigation"');
    expect(html).toContain('aria-label="Go back"');
    expect(html).toContain('aria-label="Go forward"');
    expect(html).toContain('aria-label="Reload page"');
    expect(html).not.toContain(
      'border border-border-subtle bg-surface px-[2px]',
    );
    expect(html).toContain('box-border h-full w-full px-6');
    expect(html).toContain('Opening Web page…');
    expect(html).not.toContain('Preparing Android device connection…');
  });

  it('shows Web-specific empty state copy before opening a Web page', () => {
    const html = renderToStaticMarkup(
      createElement(
        StudioPlaygroundContext.Provider,
        { value: createDisconnectedWebContextValue() },
        createElement(MainContent, {
          activeView: 'device',
        }),
      ),
    );

    expect(html).toContain('Open Web Page');
    expect(html).not.toContain('Connect Android Device');
  });

  it('shows a loading state while opening a Web page', () => {
    const html = renderToStaticMarkup(
      createElement(
        StudioPlaygroundContext.Provider,
        { value: createOpeningWebContextValue() },
        createElement(MainContent, {
          activeView: 'device',
        }),
      ),
    );

    expect(html).toContain('Opening Web page…');
    expect(html).not.toContain('Open Web Page');
    expect(html).not.toContain('Connect Android Device');
  });

  it('uses the pending platform while a new Computer session is opening', () => {
    const html = renderToStaticMarkup(
      createElement(
        StudioPlaygroundContext.Provider,
        { value: createOpeningComputerWithStaleAndroidContextValue() },
        createElement(MainContent, {
          activeView: 'device',
          pendingCreatePlatform: 'computer',
        }),
      ),
    );

    expect(html).toContain('Preparing computer connection…');
    expect(html).toContain('h-[56px] w-[56px]');
    expect(html).not.toContain('Preparing Android device connection…');
    expect(html).not.toContain('h-[80px] w-[40px]');
  });

  it('adds horizontal gutter around connected computer previews', () => {
    const html = renderToStaticMarkup(
      createElement(
        StudioPlaygroundContext.Provider,
        { value: createConnectedComputerContextValue() },
        createElement(MainContent, {
          activeView: 'device',
        }),
      ),
    );

    expect(html).toContain('box-border h-full w-full px-6');
  });
});
