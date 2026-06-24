import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';

const mocks = rs.hoisted(() => ({
  latestPlaygroundConfig: null as any,
  playground: null as any,
  recorder: null as any,
}));

rs.mock('antd', () => ({
  App: {
    useApp: () => ({
      message: {
        error: rs.fn(),
        info: rs.fn(),
      },
    }),
  },
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
}));

rs.mock('@midscene/playground-app', () => ({
  PlaygroundConversationPanel: ({ playgroundConfig }: any) => {
    mocks.latestPlaygroundConfig = playgroundConfig;
    return createElement(
      'div',
      { 'data-testid': 'playground-panel' },
      playgroundConfig.promptInputChrome?.inputActions,
    );
  },
}));

rs.mock('../src/renderer/components/Recorder', () => ({
  StudioRecorderPanel: () => null,
}));

rs.mock('../src/renderer/components/PlaygroundShell/mode-icons', () => ({
  ApiPlaygroundModeIcon: () => createElement('span'),
  RecorderModeIcon: () => createElement('span'),
}));

rs.mock('../src/renderer/playground/useStudioPlayground', () => ({
  useStudioPlayground: () => mocks.playground,
}));

rs.mock('../src/renderer/recorder/useStudioRecorder', () => ({
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
    refreshDiscoveredDevices: rs.fn(async () => undefined),
    restartPlayground: rs.fn(async () => undefined),
    serverUrl: 'http://localhost:5800',
    setDiscoveryPollingPaused: rs.fn(),
  };
}

function createRecorder() {
  return {
    currentTarget: target,
    state: {
      isRecording: false,
    },
    stopRecording: rs.fn(async () => undefined),
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
      chooseReplayFile: rs.fn(async () => ({
        content: '# Replay\n\n## Steps\n1. Tap login',
        displayName: 'recording.md',
        type: 'markdown',
      })),
      recorderEntryEnabled: true,
    } as any;
  });

  afterEach(() => {
    document.body.replaceChildren();
    rs.restoreAllMocks();
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
