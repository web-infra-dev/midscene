// @vitest-environment jsdom
import type { PlaygroundControllerResult } from '@midscene/playground-app';
import type { StudioPlaygroundContextValue } from '@renderer/playground/types';
import { describe, expect, it, rs } from '@rstest/core';
import type { ReactElement } from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import MainContent from '../src/renderer/components/MainContent';
import { StudioPlaygroundContext } from '../src/renderer/playground/useStudioPlayground';
import type { StudioRecorderContextValue } from '../src/renderer/recorder/types';
import { StudioRecorderContext } from '../src/renderer/recorder/useStudioRecorder';

type ReadyStudioPlaygroundContextValue = Extract<
  StudioPlaygroundContextValue,
  { phase: 'ready' }
>;

(globalThis as { __APP_VERSION__?: string }).__APP_VERSION__ = 'test-version';

rs.mock('@midscene/playground-app', () => ({
  // Real PlaygroundPreview pulls in a WASM helper through visualizer; the
  // tests only care that MainContent threads the connecting overlay
  // through, so stub it down to that overlay.
  PlaygroundPreview: ({ connectingOverlay }: { connectingOverlay?: unknown }) =>
    connectingOverlay ?? null,
  PlaygroundConversationPanel: () => null,
}));

function createRecorderContextValue(): StudioRecorderContextValue {
  return {
    state: {
      initialized: true,
      initializing: false,
      sessions: [],
      currentSessionId: null,
      isRecording: false,
      error: null,
    },
    currentSession: null,
    currentTarget: null,
    canStartRecording: false,
    startRecording: rs.fn(async () => null),
    stopRecording: rs.fn(async () => undefined),
    deleteSession: rs.fn(async () => undefined),
    renameSession: rs.fn(async () => undefined),
    selectSession: rs.fn(),
    generateSessionYaml: rs.fn(async () => ''),
    generateSessionCode: rs.fn(async () => ''),
    deleteSessionCode: rs.fn(async () => undefined),
    exportSessionJson: rs.fn(async () => undefined),
    exportSessionYaml: rs.fn(async () => undefined),
    exportSessionCode: rs.fn(async () => undefined),
    getRecorderScreenshotAssetUrl: rs.fn(() => null),
    loadSessionScreenshots: rs.fn(async () => []),
    exportAllZip: rs.fn(async () => undefined),
  };
}

function renderMainContent(
  context: StudioPlaygroundContextValue,
  element: ReactElement,
) {
  return renderToStaticMarkup(
    createElement(
      StudioPlaygroundContext.Provider,
      { value: context },
      createElement(
        StudioRecorderContext.Provider,
        { value: createRecorderContextValue() },
        element,
      ),
    ),
  );
}

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
        refreshSessionSetup: rs.fn(async () => undefined),
        createSession: rs.fn(async () => false),
        destroySession: rs.fn(async () => undefined),
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
    refreshDiscoveredDevices: rs.fn(async () => undefined),
    restartPlayground: rs.fn(async () => undefined),
    setDiscoveryPollingPaused: rs.fn(),
  };
}

function createConnectedWebContextValue(): ReadyStudioPlaygroundContextValue {
  const context = createReadyContextValue();
  context.controller.state = {
    ...context.controller.state,
    serverOnline: true,
    isUserOperating: false,
    playgroundSDK: {
      interact: rs.fn(async () => ({ ok: true })),
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
      interact: rs.fn(async () => ({ ok: true })),
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
  it('uses the surface color behind a connected mobile preview', () => {
    const context = createConnectedWebContextValue();
    context.controller.state = {
      ...context.controller.state,
      formValues: { platformId: 'android' },
      runtimeInfo: {
        ...context.controller.state.runtimeInfo,
        platformId: 'android',
        interface: {
          type: 'android',
          description: 'Android device',
        },
        preview: {
          kind: 'scrcpy',
          capabilities: [{ kind: 'scrcpy' }],
        },
      },
    } as typeof context.controller.state;

    const html = renderMainContent(
      context,
      createElement(MainContent, {
        activeView: 'device',
      }),
    );

    expect(html).toContain(
      'relative min-h-0 flex-1 overflow-hidden bg-surface',
    );
    expect(html).not.toContain(
      'relative min-h-0 flex-1 overflow-hidden bg-surface dark:bg-[#181818]',
    );
  });

  it('uses the surface token for the device-preview header background', () => {
    const html = renderMainContent(
      createConnectedWebContextValue(),
      createElement(MainContent, {
        activeView: 'device',
      }),
    );

    expect(html).toContain(
      'border-b border-border-subtle bg-surface pl-[8px] pr-4',
    );
  });

  it('lets the Record context panel float over the preview for generated Markdown', () => {
    const context = createConnectedWebContextValue();
    const reservedHtml = renderMainContent(
      context,
      createElement(MainContent, {
        activeView: 'device',
      }),
    );
    const floatingHtml = renderMainContent(
      context,
      createElement(MainContent, {
        activeView: 'device',
        floatingStudioModePanel: true,
      }),
    );

    expect(reservedHtml).toContain('padding-right:340px');
    expect(floatingHtml).not.toContain('padding-right:340px');
  });

  it('uses a session-derived stable canvas for Web previews only', () => {
    const webHtml = renderMainContent(
      createConnectedWebContextValue(),
      createElement(MainContent, {
        activeView: 'device',
      }),
    );
    const computerHtml = renderMainContent(
      createConnectedComputerContextValue(),
      createElement(MainContent, {
        activeView: 'device',
      }),
    );

    expect(webHtml).toContain('studio-web-preview-fixed-aspect');
    expect(webHtml).toContain('--studio-web-preview-aspect-ratio:1.777');
    expect(computerHtml).not.toContain('studio-web-preview-fixed-aspect');
  });

  it('renders discovered devices without requiring model env configuration', () => {
    const html = renderMainContent(
      createReadyContextValue(),
      createElement(MainContent, {
        activeView: 'overview',
      }),
    );

    expect(html).toContain('DELL U2720Q');
    expect(html).toContain('No device');
    expect(html).toContain('Please plug in the device and check.');
    expect(html).not.toContain('Finish environment setup');
    expect(html).not.toContain('未检测到 adb');
  });

  it('keeps overview content on one column rail and renders device rows without card borders', () => {
    const html = renderMainContent(
      createReadyContextValue(),
      createElement(MainContent, {
        activeView: 'overview',
      }),
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
    const html = renderMainContent(
      createReadyContextValue(),
      createElement(MainContent, {
        activeView: 'overview',
      }),
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

    const html = renderMainContent(
      context,
      createElement(MainContent, {
        activeView: 'overview',
      }),
    );

    expect(html).toContain('ADB not detected');
  });

  it('replaces the HarmonyOS empty state with an hdc-missing hint when discovery reports a toolchain error', () => {
    const baseContext = createReadyContextValue();
    if (baseContext.phase !== 'ready') {
      throw new Error('expected ready context');
    }
    const context: StudioPlaygroundContextValue = {
      ...baseContext,
      discoveryErrors: {
        harmony: { platformId: 'harmony', kind: 'toolchain-missing' },
      },
    };

    const html = renderMainContent(
      context,
      createElement(MainContent, {
        activeView: 'overview',
      }),
    );

    expect(html).toContain('HDC not detected');
  });

  it('keeps the disconnect control out of the window drag region', () => {
    const html = renderMainContent(
      createReadyContextValue(),
      createElement(MainContent, {
        activeView: 'device',
      }),
    );

    expect(html).toContain(
      'app-no-drag group/disconnect-pill relative flex shrink-0 items-center',
    );
    expect(html).toContain('aria-label="Disconnect"');
    expect(html).toContain('Disconnect');
  });

  it('reserves the native Windows window-control region in the device header', () => {
    const html = renderMainContent(
      createReadyContextValue(),
      createElement(MainContent, {
        activeView: 'device',
        titlebarInsetRight: 176,
      }),
    );

    expect(html).toContain('padding-right:176px');
  });

  it('renders browser navigation controls for connected Web sessions', () => {
    const html = renderMainContent(
      createConnectedWebContextValue(),
      createElement(MainContent, {
        activeView: 'device',
      }),
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
    const html = renderMainContent(
      createDisconnectedWebContextValue(),
      createElement(MainContent, {
        activeView: 'device',
      }),
    );

    expect(html).toContain('Open Web Page');
    expect(html).not.toContain('Connect Android Device');
  });

  it('shows a loading state while opening a Web page', () => {
    const html = renderMainContent(
      createOpeningWebContextValue(),
      createElement(MainContent, {
        activeView: 'device',
      }),
    );

    expect(html).toContain('Opening Web page…');
    expect(html).not.toContain('Open Web Page');
    expect(html).not.toContain('Connect Android Device');
  });

  it('uses the pending platform while a new Computer session is opening', () => {
    const html = renderMainContent(
      createOpeningComputerWithStaleAndroidContextValue(),
      createElement(MainContent, {
        activeView: 'device',
        pendingCreatePlatform: 'computer',
      }),
    );

    expect(html).toContain('Preparing computer connection…');
    expect(html).toContain('h-[56px] w-[56px]');
    expect(html).not.toContain('Preparing Android device connection…');
    expect(html).not.toContain('h-[80px] w-[40px]');
  });

  it('adds horizontal gutter around connected computer previews', () => {
    const html = renderMainContent(
      createConnectedComputerContextValue(),
      createElement(MainContent, {
        activeView: 'device',
      }),
    );

    expect(html).toContain('box-border h-full w-full px-6');
  });
});
