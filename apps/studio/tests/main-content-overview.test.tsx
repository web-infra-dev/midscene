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

function createConnectedWebContextValue(): StudioPlaygroundContextValue {
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

function createDisconnectedWebContextValue(): StudioPlaygroundContextValue {
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

function createOpeningWebContextValue(): StudioPlaygroundContextValue {
  const context = createDisconnectedWebContextValue();
  context.controller.state = {
    ...context.controller.state,
    sessionMutating: true,
  } as unknown as PlaygroundControllerResult['state'];
  return context;
}

function createConnectedComputerContextValue(): StudioPlaygroundContextValue {
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
