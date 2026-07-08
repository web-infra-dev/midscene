// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  latestExternalRunRequest: null as any,
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
    if (playgroundConfig.externalRunRequest) {
      mocks.latestExternalRunRequest = playgroundConfig.externalRunRequest;
    }
    return createElement(
      'div',
      { 'data-testid': 'playground-panel' },
      playgroundConfig.promptInputChrome?.inputActions,
    );
  },
}));

vi.mock('../src/renderer/components/Recorder', () => ({
  StudioReplayPanel: () =>
    createElement('div', { 'data-testid': 'studio-replay-panel' }),
  StudioRecorderPanel: () =>
    createElement('div', { 'data-testid': 'studio-recorder-panel' }),
}));

vi.mock('../src/renderer/components/StudioTimelinePanel', () => ({
  StudioTimelineEmptyState: ({ description, title }: any) =>
    createElement(
      'div',
      { 'data-testid': 'studio-timeline-empty-state' },
      title,
      description,
    ),
  StudioTimelineHeader: () =>
    createElement('div', {
      'data-testid': 'studio-timeline-header',
    }),
  StudioTimelinePanel: ({ children }: any) =>
    createElement(
      'section',
      { 'data-testid': 'studio-timeline-panel' },
      children,
    ),
}));

vi.mock('../src/renderer/components/PlaygroundShell/mode-icons', () => ({
  ApiPlaygroundModeIcon: () => createElement('span'),
  RecorderModeIcon: () => createElement('span'),
  ReplayModeIcon: () => createElement('span'),
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

const { default: StudioModePanel } = await import(
  '../src/renderer/components/StudioModePanel'
);
const { StudioModeTab } = await import('../src/renderer/recorder/types');

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
      sessions: [],
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
      <StudioModePanel
        onStudioModeChange={() => undefined}
        studioMode={StudioModeTab.Replay}
      />,
    );
  });

  return { container, root };
}

async function renderApiPlayground() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const onStudioModeChange = vi.fn();

  await act(async () => {
    root.render(
      <StudioModePanel
        onStudioModeChange={onStudioModeChange}
        studioMode={StudioModeTab.Playground}
      />,
    );
  });

  return { container, onStudioModeChange, root };
}

async function renderStudioModePanel(studioMode: typeof StudioModeTab.Record) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <StudioModePanel
        onStudioModeChange={() => undefined}
        studioMode={studioMode}
      />,
    );
  });

  return { container, root };
}

async function renderReplayWithHeaderChange() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const onHeaderChange = vi.fn();

  await act(async () => {
    root.render(
      <StudioModePanel
        onHeaderChange={onHeaderChange}
        onStudioModeChange={() => undefined}
        studioMode={StudioModeTab.Replay}
      />,
    );
  });

  return { onHeaderChange, root };
}

describe('Studio Playground imported replay', () => {
  beforeEach(() => {
    mocks.latestExternalRunRequest = null;
    mocks.latestPlaygroundConfig = null;
    mocks.playground = createReadyPlayground();
    mocks.recorder = createRecorder();
    window.studioRuntime = {
      chooseReplayFile: vi.fn(async () => ({
        content: '# Replay\n\n## Steps\n1. Tap login',
        displayName: 'recording.md',
        type: 'markdown',
      })),
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

    const request = mocks.latestExternalRunRequest;
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

  it('imports replay files into the API Playground timeline without switching tabs', async () => {
    const { container, onStudioModeChange, root } = await renderApiPlayground();

    const importButton = container.querySelector(
      'button[aria-label="Import Markdown or YAML replay"]',
    );
    expect(importButton).not.toBeNull();

    await act(async () => {
      importButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onStudioModeChange).not.toHaveBeenCalled();
    expect(mocks.latestExternalRunRequest).toMatchObject({
      displayContent: 'Imported Markdown Replay: recording.md',
      value: {
        type: 'aiAct',
      },
    });

    await act(async () => {
      root.unmount();
    });
  });

  it('does not render the replay import action in the Replay header', async () => {
    const { onHeaderChange, root } = await renderReplayWithHeaderChange();

    expect(onHeaderChange).toHaveBeenCalledWith({
      title: 'Replay',
    });

    await act(async () => {
      root.unmount();
    });
  });

  it('keeps recorder, replay, and playground panels mounted while record is active', async () => {
    const { container, root } = await renderStudioModePanel(
      StudioModeTab.Record,
    );

    expect(
      container.querySelector('[data-testid="studio-recorder-panel"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="studio-replay-panel"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="playground-panel"]'),
    ).not.toBeNull();
    const recorderPane = container.querySelector('.studio-recorder-column');
    const replayPane = container.querySelector('.studio-replay-column');
    const playgroundPane = container.querySelector('.studio-playground-column');

    expect(
      recorderPane?.classList.contains('studio-mode-panel-pane-active'),
    ).toBe(true);
    expect(recorderPane?.getAttribute('aria-hidden')).toBe('false');
    expect(
      replayPane?.classList.contains('studio-mode-panel-pane-active'),
    ).toBe(false);
    expect(replayPane?.getAttribute('aria-hidden')).toBe('true');
    expect(
      playgroundPane?.classList.contains('studio-mode-panel-pane-active'),
    ).toBe(false);
    expect(playgroundPane?.getAttribute('aria-hidden')).toBe('true');

    await act(async () => {
      root.unmount();
    });
  });
});
