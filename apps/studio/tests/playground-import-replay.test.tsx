// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  latestExternalRunRequest: null as any,
  latestApiPlaygroundConfig: null as any,
  latestPlaygroundConfig: null as any,
  latestReplayExecutionConfig: null as any,
  latestReplayPanelProps: null as any,
  playground: null as any,
  recorder: null as any,
  timelineWrapperState: { empty: true } as { empty: boolean },
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
    if (playgroundConfig.hidePromptInput) {
      mocks.latestReplayExecutionConfig = playgroundConfig;
    } else {
      mocks.latestApiPlaygroundConfig = playgroundConfig;
    }
    if (playgroundConfig.externalRunRequest) {
      mocks.latestExternalRunRequest = playgroundConfig.externalRunRequest;
    }
    const timelineContent = playgroundConfig.timelineWrapper?.(
      createElement('div', { 'data-testid': 'timeline-content' }),
      mocks.timelineWrapperState,
    );
    return createElement(
      'div',
      { 'data-testid': 'playground-panel' },
      timelineContent,
      playgroundConfig.promptInputChrome?.inputActions,
    );
  },
}));

vi.mock('../src/renderer/components/Recorder', () => ({
  StudioReplayPanel: (props: any) => {
    mocks.latestReplayPanelProps = props;
    return createElement('div', { 'data-testid': 'studio-replay-panel' });
  },
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
  StudioExecutionTimelinePanel: ({ children }: any) =>
    createElement(
      'section',
      { 'data-testid': 'studio-execution-timeline-panel' },
      children,
    ),
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
    generateSessionCode: vi.fn(async () => '# Replay'),
    state: {
      isRecording: false,
      sessions: [],
    },
    stopRecording: vi.fn(async () => undefined),
  };
}

async function renderPlayground(onOpenStudioRightPanel?: (view: any) => void) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <StudioModePanel
        onOpenStudioRightPanel={onOpenStudioRightPanel}
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
    mocks.latestApiPlaygroundConfig = null;
    mocks.latestPlaygroundConfig = null;
    mocks.latestReplayExecutionConfig = null;
    mocks.latestReplayPanelProps = null;
    mocks.playground = createReadyPlayground();
    mocks.recorder = createRecorder();
    mocks.timelineWrapperState = { empty: true };
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
    expect(request.value.prompt).toContain(
      'do not keep repeating the same navigation or action pattern',
    );
    expect(request.value.prompt).toContain(
      'current UI likely does not match the recording state',
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

  it('does not render the initial empty timeline panel for Replay or API Playground', async () => {
    const { container: replayContainer, root: replayRoot } =
      await renderPlayground();

    expect(
      replayContainer.querySelector('[data-testid="studio-timeline-panel"]'),
    ).toBeNull();
    expect(
      replayContainer.querySelector(
        '[data-testid="studio-timeline-empty-state"]',
      ),
    ).toBeNull();

    await act(async () => {
      replayRoot.unmount();
    });

    const { container: playgroundContainer, root: playgroundRoot } =
      await renderApiPlayground();

    expect(
      playgroundContainer.querySelector(
        '[data-testid="studio-timeline-panel"]',
      ),
    ).toBeNull();
    expect(
      playgroundContainer.querySelector(
        '[data-testid="studio-timeline-empty-state"]',
      ),
    ).toBeNull();

    await act(async () => {
      playgroundRoot.unmount();
    });
  });

  it('renders the API Playground timeline panel after execution exists', async () => {
    mocks.timelineWrapperState = { empty: false };

    const { container, root } = await renderApiPlayground();

    expect(
      container.querySelector(
        '[data-testid="studio-execution-timeline-panel"]',
      ),
    ).not.toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('keeps the replay history item active while execution is running', async () => {
    const session = {
      createdAt: Date.now(),
      events: [],
      generatedCode: {
        markdown: '# Recorded Replay',
      },
      id: 'session-running',
      name: 'Search for Hotels in Hangzhou on Booking.com',
      status: 'completed',
      target,
      updatedAt: Date.now(),
    };
    mocks.recorder = {
      ...createRecorder(),
      state: {
        isRecording: false,
        sessions: [session],
      },
    };
    const stop = vi.fn();
    const { root } = await renderPlayground();

    await act(async () => {
      await mocks.latestReplayPanelProps.onReplaySession(session);
    });

    expect(mocks.latestReplayPanelProps.activeSessionId).toBe(session.id);
    expect(mocks.latestExternalRunRequest).toMatchObject({
      displayContent: `Replay: ${session.name}`,
    });

    await act(async () => {
      mocks.latestReplayExecutionConfig.onExecutionStatusChange({
        running: true,
        stop,
        stoppable: true,
      });
    });

    expect(mocks.latestReplayPanelProps.activeSessionId).toBe(session.id);
    expect(mocks.latestReplayPanelProps.activeSessionStoppable).toBe(true);

    await act(async () => {
      mocks.latestReplayPanelProps.onStopActiveSession();
    });

    expect(stop).toHaveBeenCalledTimes(1);

    await act(async () => {
      mocks.latestReplayExecutionConfig.onExecutionStatusChange({
        running: false,
        stop,
        stoppable: false,
      });
    });

    expect(mocks.latestReplayPanelProps.activeSessionId).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('lists only recordings with generated Markdown in Replay history', async () => {
    const replayableSession = {
      createdAt: Date.now(),
      events: [],
      generatedCode: { markdown: '# Recorded Replay' },
      id: 'session-replayable',
      name: 'Replayable recording',
      status: 'completed',
      target,
      updatedAt: Date.now(),
    };
    const recordedOnlySession = {
      ...replayableSession,
      generatedCode: {},
      id: 'session-recorded-only',
      name: 'Recorded only',
    };
    mocks.recorder = {
      ...createRecorder(),
      state: {
        isRecording: false,
        sessions: [replayableSession, recordedOnlySession],
      },
    };
    const { root } = await renderPlayground();

    expect(mocks.latestReplayPanelProps.sessions).toEqual([replayableSession]);

    await act(async () => {
      root.unmount();
    });
  });

  it('opens a replay history item as Markdown without starting playback', async () => {
    const session = {
      createdAt: Date.now(),
      events: [],
      generatedCode: {
        markdown: '# Recorded Replay',
      },
      id: 'session-markdown',
      name: 'Search for Hotels in Hangzhou on Booking.com',
      status: 'completed',
      target,
      updatedAt: Date.now(),
    };
    mocks.recorder = {
      ...createRecorder(),
      state: {
        isRecording: false,
        sessions: [session],
      },
    };
    const onOpenStudioRightPanel = vi.fn();
    const { root } = await renderPlayground(onOpenStudioRightPanel);

    await act(async () => {
      await mocks.latestReplayPanelProps.onSelectSession(session);
    });

    expect(onOpenStudioRightPanel).toHaveBeenCalledWith({
      markdown: '# Recorded Replay',
      onDelete: expect.any(Function),
      onDownload: expect.any(Function),
      title: session.name,
      type: 'markdown',
    });
    expect(mocks.latestExternalRunRequest).toBeNull();
    expect(mocks.latestReplayPanelProps.activeSessionId).toBeNull();
    expect(mocks.latestReplayPanelProps.selectedSessionId).toBe(session.id);

    await act(async () => {
      root.unmount();
    });
  });

  it('stops the running playground task before a replay task starts', async () => {
    const session = {
      createdAt: Date.now(),
      events: [],
      generatedCode: {
        markdown: '# Recorded Replay',
      },
      id: 'session-preempt',
      name: 'Navigate Midscene docs',
      status: 'completed',
      target,
      updatedAt: Date.now(),
    };
    mocks.recorder = {
      ...createRecorder(),
      state: {
        isRecording: false,
        sessions: [session],
      },
    };
    const stopPlayground = vi.fn(async () => undefined);
    const { root } = await renderPlayground();

    await act(async () => {
      mocks.latestApiPlaygroundConfig.onExecutionStatusChange({
        running: true,
        stop: stopPlayground,
        stoppable: true,
      });
    });

    await act(async () => {
      await mocks.latestReplayPanelProps.onReplaySession(session);
    });

    await act(async () => {
      await mocks.latestReplayExecutionConfig.onBeforeExecutionStart();
    });

    expect(stopPlayground).toHaveBeenCalledTimes(1);

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
    expect(replayPane?.querySelector('.playground-shell')).toBeNull();
    expect(
      playgroundPane?.classList.contains('studio-mode-panel-pane-active'),
    ).toBe(false);
    expect(playgroundPane?.getAttribute('aria-hidden')).toBe('true');

    await act(async () => {
      root.unmount();
    });
  });
});
