// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  latestPlaygroundConfig: null as any,
  playground: null as any,
  recorder: null as any,
}));

vi.mock('antd', () => ({
  App: {
    useApp: () => ({
      message: {
        error: vi.fn(),
        info: vi.fn(),
      },
    }),
  },
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@midscene/playground-app', () => ({
  PlaygroundConversationPanel: ({ playgroundConfig }: any) => {
    mocks.latestPlaygroundConfig = playgroundConfig;
    return createElement(
      'div',
      { 'data-testid': 'playground-panel' },
      playgroundConfig.promptInputChrome?.inputActions,
    );
  },
}));

vi.mock('../src/renderer/components/Recorder', () => ({
  StudioRecorderPanel: () => null,
}));

vi.mock('../src/renderer/components/PlaygroundShell/mode-icons', () => ({
  ApiPlaygroundModeIcon: () => createElement('span'),
  RecorderModeIcon: () => createElement('span'),
}));

vi.mock('../src/renderer/playground/useStudioPlayground', () => ({
  useStudioPlayground: () => mocks.playground,
}));

vi.mock('../src/renderer/recorder/useStudioRecorder', () => ({
  useStudioRecorder: () => mocks.recorder,
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as { __APP_VERSION__?: string }).__APP_VERSION__ = 'test-version';

const { default: Playground } = await import(
  '../src/renderer/components/Playground'
);

const target = {
  deviceId: 'https://www.douyin.com/jingxuan',
  label: 'Douyin',
  platformId: 'web',
  values: {
    url: 'https://www.douyin.com/jingxuan',
  },
};

function createReadyPlayground() {
  return {
    controller: {
      state: {
        formValues: {},
        runtimeInfo: null,
        serverOnline: true,
        sessionViewState: { connected: true },
      },
    },
    phase: 'ready',
    refreshDiscoveredDevices: vi.fn(async () => undefined),
    restartPlayground: vi.fn(async () => undefined),
    serverUrl: 'http://localhost:5800',
    setDiscoveryPollingPaused: vi.fn(),
  };
}

function createRecorder() {
  return {
    currentTarget: target,
    state: {
      isRecording: false,
    },
    stopRecording: vi.fn(async () => undefined),
  };
}

async function renderPlayground() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <Playground
        onRightPanelModeChange={() => undefined}
        rightPanelMode="playground"
      />,
    );
  });

  return { container, root };
}

describe('Studio Playground imported replay', () => {
  beforeEach(() => {
    mocks.latestPlaygroundConfig = null;
    mocks.playground = createReadyPlayground();
    mocks.recorder = createRecorder();
    window.studioRuntime = {
      chooseReplayFile: vi.fn(async () => ({
        content: '# Replay\n\n## Steps\n1. Tap login',
        displayName: 'recording.md',
        type: 'markdown',
      })),
      recorderEntryEnabled: true,
    } as any;
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('wraps imported Markdown content into an aiAct replay request', async () => {
    const { container, root } = await renderPlayground();

    const importButton = container.querySelector(
      'button[aria-label="Import Markdown or YAML replay"]',
    );
    expect(importButton).not.toBeNull();

    await act(async () => {
      importButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const request = mocks.latestPlaygroundConfig.externalRunRequest;
    expect(request).toMatchObject({
      displayContent: 'Imported Markdown Replay: recording.md',
      value: {
        type: 'aiAct',
      },
    });
    expect(request.value.type).not.toBe('runMarkdown');
    expect(request.value.prompt).toContain(
      'Replay the following Midscene Studio recording with the current UI state.',
    );
    expect(request.value.prompt).toContain(
      'Replay source: Imported Markdown replay',
    );
    expect(request.value.prompt).toContain('Replay title: recording.md');
    expect(request.value.prompt).toContain(
      '# Replay\n\n## Steps\n1. Tap login',
    );

    await act(async () => {
      root.unmount();
    });
  });
});
