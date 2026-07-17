// @vitest-environment jsdom
import { act, cloneElement, createElement, isValidElement } from 'react';
import type { ComponentProps, ReactElement, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  playground: null as any,
  recorder: null as any,
  truncated: false,
}));

vi.mock('antd', () => {
  const message = {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  };

  return {
    App: Object.assign(({ children }: { children: ReactNode }) => children, {
      useApp: () => ({ message }),
    }),
    Button: ({ children, icon, ...props }: any) =>
      createElement('button', { type: 'button', ...props }, icon, children),
    Input: ({ allowClear, className, prefix, ...props }: any) =>
      createElement('label', null, prefix, createElement('input', props)),
    Popover: ({ children, content, onOpenChange, open }: any) => {
      const triggerElement = children as ReactElement<{
        onClick?: (event: MouseEvent) => void;
      }>;
      const trigger = isValidElement(children)
        ? cloneElement(triggerElement, {
            onClick: (event: MouseEvent) => {
              triggerElement.props.onClick?.(event);
              onOpenChange?.(!open);
            },
          } as any)
        : children;
      return createElement('span', null, trigger, open ? content : null);
    },
    Tooltip: ({
      children,
      title,
    }: { children: ReactNode; title?: ReactNode }) =>
      createElement('span', { 'data-tooltip-title': title }, children),
    Typography: {
      Text: ({ children }: { children: ReactNode }) =>
        createElement('span', null, children),
    },
    message,
  };
});

vi.mock('@midscene/recorder', () => ({
  RecordTimeline: ({ events }: { events: Array<{ actionSummary?: string }> }) =>
    createElement(
      'div',
      null,
      events.map((event, index) =>
        createElement('div', { key: index }, event.actionSummary),
      ),
    ),
}));

vi.mock('@midscene/shared/recorder', () => ({
  getMidsceneRecorderEventDescription: () => '',
  getMidsceneRecorderSemantic: () => null,
}));

vi.mock('@midscene/visualizer', () => ({
  useTextTruncation: () => ({
    ref: { current: null },
    truncated: mocks.truncated,
  }),
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

const { StudioRecorderPanel } = await import(
  '../src/renderer/components/Recorder/StudioRecorderPanel'
);
const { StudioReplayPanel } = await import(
  '../src/renderer/components/Recorder/StudioReplayPanel'
);
const { RecorderScreenshotDetailView } = await import(
  '../src/renderer/components/Recorder/RecorderFloatingPanel'
);

function createRecorderMock({
  currentSession,
  isRecording = false,
  sessionOverrides = {},
}: {
  currentSession?: any;
  isRecording?: boolean;
  sessionOverrides?: Record<string, unknown>;
} = {}) {
  const session = {
    createdAt: Date.now(),
    description: '',
    events: [
      {
        actionSummary: 'Tap the existing history item',
        hashId: 'event-1',
        type: 'tap',
      },
    ],
    generatedCode: {},
    id: 'session-1',
    name: 'Existing recording',
    status: 'completed',
    target: {
      label: 'Android Device',
      platformId: 'android',
      values: {},
    },
    updatedAt: Date.now(),
    ...sessionOverrides,
  };

  return {
    canStartRecording: true,
    currentSession: currentSession ?? null,
    currentTarget: session.target,
    deleteSession: vi.fn(),
    exportAllZip: vi.fn(),
    exportSessionCode: vi.fn(),
    generateSessionCode: vi.fn(),
    getRecorderScreenshotAssetUrl: vi.fn(() => null),
    loadSessionScreenshots: vi.fn(async (sessionId: string) => {
      const matchingSession = [currentSession, session].find(
        (item) => item?.id === sessionId,
      );
      return matchingSession?.events ?? [];
    }),
    renameSession: vi.fn(async () => undefined),
    selectSession: vi.fn(),
    startRecording: vi.fn(),
    state: {
      error: null,
      initializing: false,
      isRecording,
      sessions: [session],
    },
    stopRecording: vi.fn(),
  };
}

async function renderRecorderPanel(
  props: ComponentProps<typeof StudioRecorderPanel> = {},
) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<StudioRecorderPanel {...props} />);
  });

  return { container, root };
}

async function renderReplayPanel({
  activeSessionId = null,
  activeSessionStoppable = false,
  onDeleteSession,
  onDownloadSession,
  onReplaySession = vi.fn(),
  onSelectSession = vi.fn(),
  onStopActiveSession,
  selectedSessionId = null,
  sessions = createRecorderMock().state.sessions,
}: {
  activeSessionId?: string | null;
  activeSessionStoppable?: boolean;
  onDeleteSession?: ReturnType<typeof vi.fn>;
  onDownloadSession?: ReturnType<typeof vi.fn>;
  onReplaySession?: ReturnType<typeof vi.fn>;
  onSelectSession?: ReturnType<typeof vi.fn>;
  onStopActiveSession?: ReturnType<typeof vi.fn>;
  selectedSessionId?: string | null;
  sessions?: any[];
} = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <StudioReplayPanel
        activeSessionId={activeSessionId}
        activeSessionStoppable={activeSessionStoppable}
        onDeleteSession={onDeleteSession}
        onDownloadSession={onDownloadSession}
        onReplaySession={onReplaySession}
        onSelectSession={onSelectSession}
        onStopActiveSession={onStopActiveSession}
        selectedSessionId={selectedSessionId}
        sessions={sessions}
      />,
    );
  });

  return { container, onReplaySession, onSelectSession, root };
}

async function unmount(root: ReturnType<typeof createRoot>) {
  await act(async () => {
    root.unmount();
  });
}

describe('StudioRecorderPanel', () => {
  afterEach(() => {
    document.body.replaceChildren();
    mocks.truncated = false;
    vi.restoreAllMocks();
  });

  it('starts without the initial empty timeline panel or recorder history controls', async () => {
    mocks.recorder = createRecorderMock();
    mocks.playground = {
      controller: {
        state: {
          serverOnline: true,
          sessionViewState: { connected: true },
        },
      },
      phase: 'ready',
    };

    const { container, root } = await renderRecorderPanel();

    expect(container.textContent).not.toContain('Timeline');
    expect(container.textContent).not.toContain('No tasks available');
    expect(container.textContent).not.toContain(
      'The recording progress will be displayed here.',
    );
    expect(container.textContent).toContain('Record & Generate Markdown');
    expect(container.textContent).toContain(
      'Record interactions, then generate a natural language description.',
    );
    const startButton = container.querySelector(
      'button[aria-label="Start recording"]',
    );
    expect(startButton?.textContent).toContain('Start Recording');
    expect(
      container.querySelector('.studio-recorder-floating-ready-dot'),
    ).not.toBeNull();
    expect(startButton?.querySelector('svg')).not.toBeNull();
    expect(container.textContent).not.toContain('Existing recording');
    expect(
      container.querySelector('button[aria-label="Recording history"]'),
    ).toBeNull();

    await unmount(root);
  });

  it('scrolls the record timeline to the newest event', async () => {
    vi.useFakeTimers();
    const session = createRecorderMock().state.sessions[0];
    mocks.recorder = createRecorderMock({
      currentSession: session,
      isRecording: true,
    });
    mocks.playground = {
      controller: {
        state: {
          serverOnline: true,
          sessionViewState: { connected: true },
        },
      },
      phase: 'ready',
    };

    const { container, root } = await renderRecorderPanel();
    const timeline = container.querySelector<HTMLElement>(
      '.studio-recorder-floating-main',
    );
    expect(timeline).not.toBeNull();
    Object.defineProperty(timeline, 'scrollHeight', {
      configurable: true,
      value: 480,
    });

    await act(async () => {
      vi.runAllTimers();
    });

    expect(timeline?.scrollTop).toBe(480);

    await unmount(root);
    vi.useRealTimers();
  });

  it('scrolls again after stop actions expand the timeline footer', async () => {
    vi.useFakeTimers();
    const session = createRecorderMock().state.sessions[0];
    mocks.recorder = createRecorderMock({
      currentSession: session,
      isRecording: true,
    });
    mocks.playground = {
      controller: {
        state: {
          serverOnline: true,
          sessionViewState: { connected: true },
        },
      },
      phase: 'ready',
    };

    const { container, root } = await renderRecorderPanel();
    const timeline = container.querySelector<HTMLElement>(
      '.studio-recorder-floating-main',
    );
    expect(timeline).not.toBeNull();

    mocks.recorder.state.isRecording = false;
    mocks.recorder.currentSession = null;
    mocks.recorder.state.sessions = [{ ...session, status: 'completed' }];
    await act(async () => {
      root.render(<StudioRecorderPanel />);
    });

    expect(
      container.querySelector('button[aria-label="Generate Description"]'),
    ).not.toBeNull();
    Object.defineProperty(timeline, 'scrollHeight', {
      configurable: true,
      value: 560,
    });
    timeline!.scrollTop = 0;

    await act(async () => {
      vi.runAllTimers();
    });

    expect(timeline?.scrollTop).toBe(560);

    await unmount(root);
    vi.useRealTimers();
  });

  it('numbers screenshots independently from timeline events without images', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <RecorderScreenshotDetailView
          events={
            [
              { hashId: 'initial-navigation', type: 'navigation' },
              {
                hashId: 'click-search',
                screenshotBefore: 'data:image/png;base64,c2hvdA==',
                type: 'click',
              },
            ] as any
          }
        />,
      );
    });

    expect(container.textContent).toContain('screenshot-001-click');
    expect(container.textContent).not.toContain('event-002-click');

    await unmount(root);
  });

  it('loads an asset-backed screenshot only after its card enters the drawer viewport', async () => {
    let observe:
      | ((entries: Array<{ isIntersecting: boolean }>) => void)
      | null = null;
    const previousIntersectionObserver = globalThis.IntersectionObserver;

    class TestIntersectionObserver {
      constructor(
        callback: (entries: Array<{ isIntersecting: boolean }>) => void,
      ) {
        observe = callback;
      }

      disconnect() {}

      observe() {}
    }

    Object.defineProperty(globalThis, 'IntersectionObserver', {
      configurable: true,
      value: TestIntersectionObserver,
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(
          <RecorderScreenshotDetailView
            events={
              [
                {
                  hashId: 'asset-backed-click',
                  screenshotAsset: {
                    bytes: 32,
                    id: 'session-click-asset',
                    mimeType: 'image/png',
                  },
                  type: 'click',
                },
              ] as any
            }
            getScreenshotAssetUrl={(assetId) =>
              `http://127.0.0.1:5800/recorder/assets/${assetId}`
            }
          />,
        );
      });

      expect(container.querySelector('img')).toBeNull();
      expect(observe).not.toBeNull();

      await act(async () => {
        observe?.([{ isIntersecting: true }]);
      });

      const image = container.querySelector('img');
      expect(image?.getAttribute('src')).toBe(
        'http://127.0.0.1:5800/recorder/assets/session-click-asset',
      );
      expect(image?.getAttribute('src')).not.toContain('data:image/png;base64');
    } finally {
      await unmount(root);
      if (previousIntersectionObserver) {
        Object.defineProperty(globalThis, 'IntersectionObserver', {
          configurable: true,
          value: previousIntersectionObserver,
        });
      } else {
        Reflect.deleteProperty(globalThis, 'IntersectionObserver');
      }
    }
  });

  it('renders saved recordings in the replay panel', async () => {
    const session = createRecorderMock().state.sessions[0];
    const onReplaySession = vi.fn();
    const onSelectSession = vi.fn();
    const { container, root } = await renderReplayPanel({
      onReplaySession,
      onSelectSession,
      sessions: [session],
    });

    expect(container.textContent).toContain('Replay');
    expect(container.textContent).toContain('Existing recording');
    expect(container.textContent).not.toContain('No recordings yet');

    const replayButton = container.querySelector('[role="button"]');
    await act(async () => {
      replayButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSelectSession).toHaveBeenCalledWith(session);
    expect(onSelectSession).toHaveBeenCalledTimes(1);
    expect(onReplaySession).not.toHaveBeenCalled();

    const replayActionButton = container.querySelector(
      `button[aria-label="Replay ${session.name}"]`,
    );
    await act(async () => {
      replayActionButton?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });

    expect(onReplaySession).toHaveBeenCalledWith(session);
    expect(onSelectSession).toHaveBeenCalledTimes(1);

    await unmount(root);
  });

  it('only adds a replay-name tooltip when the name is truncated', async () => {
    const session = createRecorderMock().state.sessions[0];
    mocks.truncated = false;
    const { container, root } = await renderReplayPanel({
      sessions: [session],
    });

    expect(
      container.querySelector('[role="button"]')?.getAttribute('title'),
    ).toBeNull();

    await unmount(root);

    mocks.truncated = true;
    const truncatedReplay = await renderReplayPanel({ sessions: [session] });
    expect(
      truncatedReplay.container
        .querySelector('[role="button"]')
        ?.getAttribute('title'),
    ).toBe(session.name);

    await unmount(truncatedReplay.root);
  });

  it('renders the replay empty state from the interaction spec', async () => {
    const { container, root } = await renderReplayPanel({
      sessions: [],
    });

    expect(container.textContent).toContain(
      'No recording history available yet',
    );
    expect(container.textContent).toContain(
      'Generate Markdown from a completed recording to add it here.',
    );
    expect(container.textContent).not.toContain('No recordings yet');

    await unmount(root);
  });

  it('marks the running replay session in the replay panel', async () => {
    const session = createRecorderMock().state.sessions[0];
    const { container, root } = await renderReplayPanel({
      activeSessionId: session.id,
      sessions: [session],
    });

    expect(
      container.querySelector('.studio-replay-panel-item-active'),
    ).not.toBeNull();
    expect(
      container.querySelector('.studio-replay-panel-loading'),
    ).not.toBeNull();

    await unmount(root);
  });

  it('renders a stop control for the active stoppable replay session', async () => {
    const session = createRecorderMock().state.sessions[0];
    const onReplaySession = vi.fn();
    const onStopActiveSession = vi.fn();
    const { container, root } = await renderReplayPanel({
      activeSessionId: session.id,
      activeSessionStoppable: true,
      onReplaySession,
      onStopActiveSession,
      sessions: [session],
    });

    expect(
      container.querySelector('.studio-replay-panel-item-active'),
    ).not.toBeNull();
    expect(container.querySelector('.studio-replay-panel-loading')).toBeNull();

    const stopButton = container.querySelector(
      `button[aria-label="Stop replay for ${session.name}"]`,
    );
    expect(stopButton).not.toBeNull();

    await act(async () => {
      stopButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onStopActiveSession).toHaveBeenCalledTimes(1);
    expect(onReplaySession).not.toHaveBeenCalled();

    await unmount(root);
  });

  it('renders fixed replay history item actions for download and delete', async () => {
    const session = createRecorderMock().state.sessions[0];
    const onDeleteSession = vi.fn();
    const onDownloadSession = vi.fn();
    const { container, root } = await renderReplayPanel({
      onDeleteSession,
      onDownloadSession,
      sessions: [session],
    });

    const moreButton = container.querySelector(
      `button[aria-label="More actions for ${session.name}"]`,
    );
    expect(moreButton).not.toBeNull();

    await act(async () => {
      moreButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const downloadButton = Array.from(
      document.body.querySelectorAll('button'),
    ).find((button) => button.textContent?.includes('Download'));
    expect(downloadButton).not.toBeNull();
    const deleteButton = Array.from(
      document.body.querySelectorAll('button'),
    ).find((button) => button.textContent?.includes('Delete'));
    expect(deleteButton).not.toBeNull();
    expect(
      deleteButton?.classList.contains('studio-action-menu-item-danger'),
    ).toBe(true);
    expect(downloadButton?.querySelector('svg')).not.toBeNull();
    expect(deleteButton?.querySelector('svg')).not.toBeNull();

    await act(async () => {
      downloadButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onDownloadSession).toHaveBeenCalledWith(session);

    await act(async () => {
      moreButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const reopenedDeleteButton = Array.from(
      document.body.querySelectorAll('button'),
    ).find((button) => button.textContent?.includes('Delete'));
    await act(async () => {
      reopenedDeleteButton?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });

    expect(onDeleteSession).toHaveBeenCalledWith(session);

    await unmount(root);
  });

  it('closes replay history actions when clicking outside', async () => {
    const session = createRecorderMock().state.sessions[0];
    const { container, root } = await renderReplayPanel({
      onDeleteSession: vi.fn(),
      onDownloadSession: vi.fn(),
      sessions: [session],
    });

    const moreButton = container.querySelector(
      `button[aria-label="More actions for ${session.name}"]`,
    );

    await act(async () => {
      moreButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(document.body.textContent).toContain('Download');

    await act(async () => {
      document.body.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true }),
      );
    });

    expect(document.body.textContent).not.toContain('Download');
    expect(document.body.textContent).not.toContain('Delete');

    await unmount(root);
  });

  it('shows all recording events without a show more gate', async () => {
    const currentSession = {
      createdAt: Date.now(),
      description: '',
      events: [
        {
          actionSummary: 'Click - Booking.com app icon',
          hashId: 'event-1',
          screenshotBefore: 'data:image/png;base64,first',
          type: 'click',
        },
        {
          actionSummary: 'Click - destination input field containing Beijing',
          hashId: 'event-2',
          screenshotBefore: 'data:image/png;base64,second',
          type: 'click',
        },
        {
          actionSummary: 'Click - Hangzhou',
          hashId: 'event-3',
          screenshotBefore: 'data:image/png;base64,third',
          type: 'click',
        },
      ],
      generatedCode: {},
      id: 'session-recording',
      name: 'Recording now',
      status: 'recording',
      target: {
        label: 'Android Device',
        platformId: 'android',
        values: {},
      },
      updatedAt: Date.now(),
    };
    mocks.recorder = createRecorderMock({
      currentSession,
      isRecording: true,
      sessionOverrides: currentSession,
    });
    mocks.playground = {
      controller: {
        state: {
          serverOnline: true,
          sessionViewState: { connected: true },
        },
      },
      phase: 'ready',
    };

    const { container, root } = await renderRecorderPanel();

    expect(container.textContent).toContain('Timeline');
    expect(container.textContent).toContain('Booking.com app icon');
    expect(container.textContent).toContain(
      'destination input field containing Beijing',
    );
    expect(container.textContent).toContain('Click - Hangzhou');
    expect(container.textContent).not.toContain('Show more');
    expect(container.textContent).not.toContain('Hide more');
    expect(container.textContent).not.toContain('Outputs');
    expect(container.textContent).toContain('Record & Generate Markdown');
    expect(container.textContent).toContain(
      'Record interactions, then generate a natural language description.',
    );
    expect(
      container.querySelector('.studio-recorder-floating-recording-dot'),
    ).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="Stop recording"]')
        ?.textContent,
    ).toContain('Stop Recording');
    const timelineCopies = container.querySelectorAll<HTMLElement>(
      '.studio-recorder-timeline-copy',
    );
    expect(timelineCopies).toHaveLength(3);
    expect(timelineCopies[0]?.getAttribute('title')).toBeNull();
    expect(timelineCopies[1]?.getAttribute('title')).toBeNull();
    expect(
      container.querySelector(
        '[data-tooltip-title="Click - Booking.com app icon"]',
      ),
    ).toBeNull();

    await unmount(root);
  });

  it('opens asset-backed screenshots without materializing the whole session', async () => {
    const currentSession = {
      createdAt: Date.now(),
      description: '',
      events: [
        {
          actionSummary: 'Click - Search',
          hashId: 'event-asset-backed',
          screenshotAsset: { id: 'click-search.jpg' },
          type: 'click',
        },
      ],
      generatedCode: {},
      id: 'session-asset-backed',
      name: 'Asset-backed recording',
      status: 'recording',
      target: {
        label: 'Android Device',
        platformId: 'android',
        values: {},
      },
      updatedAt: Date.now(),
    };
    mocks.recorder = createRecorderMock({
      currentSession,
      isRecording: true,
      sessionOverrides: currentSession,
    });
    mocks.playground = {
      controller: {
        state: {
          serverOnline: true,
          sessionViewState: { connected: true },
        },
      },
      phase: 'ready',
    };
    const onShowScreenshots = vi.fn();
    const { container, root } = await renderRecorderPanel({
      onShowScreenshots,
    });

    mocks.recorder.state.isRecording = false;
    mocks.recorder.currentSession = null;
    mocks.recorder.state.sessions = [
      { ...currentSession, status: 'completed' },
    ];
    await act(async () => {
      root.render(
        <StudioRecorderPanel onShowScreenshots={onShowScreenshots} />,
      );
    });

    const screenshotsButton = container.querySelector(
      'button[aria-label="Show event screenshots"]',
    );
    expect(screenshotsButton).not.toBeNull();
    expect(mocks.recorder.loadSessionScreenshots).not.toHaveBeenCalled();

    await act(async () => {
      screenshotsButton?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
      await Promise.resolve();
    });

    expect(mocks.recorder.loadSessionScreenshots).not.toHaveBeenCalled();
    expect(onShowScreenshots).toHaveBeenCalledWith(currentSession.events);

    await unmount(root);
  });

  it('collapses and expands the timeline from the title arrow', async () => {
    const currentSession = {
      createdAt: Date.now(),
      description: '',
      events: [
        {
          actionSummary: 'Click - New chat button in the left sidebar',
          hashId: 'event-1',
          screenshotBefore: 'data:image/png;base64,first',
          type: 'click',
        },
      ],
      generatedCode: {},
      id: 'session-recording-single',
      name: 'Recording now',
      status: 'recording',
      target: {
        label: 'Android Device',
        platformId: 'android',
        values: {},
      },
      updatedAt: Date.now(),
    };
    mocks.recorder = createRecorderMock({
      currentSession,
      isRecording: true,
      sessionOverrides: currentSession,
    });
    mocks.playground = {
      controller: {
        state: {
          serverOnline: true,
          sessionViewState: { connected: true },
        },
      },
      phase: 'ready',
    };

    const { container, root } = await renderRecorderPanel();

    const timelineToggle = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Collapse timeline panel"]',
    );
    expect(timelineToggle).not.toBeNull();
    expect(timelineToggle?.getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('New chat button');

    await act(async () => {
      timelineToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const expandedToggle = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Expand timeline panel"]',
    );
    expect(expandedToggle).not.toBeNull();
    expect(expandedToggle?.getAttribute('aria-expanded')).toBe('false');
    expect(
      container.querySelector('.studio-timeline-panel-collapsed'),
    ).not.toBeNull();
    expect(
      container.querySelector('.studio-recorder-floating-main-collapsed'),
    ).not.toBeNull();

    await act(async () => {
      expandedToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Collapse timeline panel"]',
        )
        ?.getAttribute('aria-expanded'),
    ).toBe('true');
    expect(container.textContent).toContain('New chat button');

    await unmount(root);
  });

  it('keeps the timeline area visible immediately after recording starts', async () => {
    const currentSession = {
      createdAt: Date.now(),
      description: '',
      events: [],
      generatedCode: {},
      id: 'session-recording-empty',
      name: 'Recording now',
      status: 'recording',
      target: {
        label: 'Android Device',
        platformId: 'android',
        values: {},
      },
      updatedAt: Date.now(),
    };
    mocks.recorder = createRecorderMock({
      currentSession,
      isRecording: true,
      sessionOverrides: currentSession,
    });
    mocks.playground = {
      controller: {
        state: {
          serverOnline: true,
          sessionViewState: { connected: true },
        },
      },
      phase: 'ready',
    };

    const { container, root } = await renderRecorderPanel();

    expect(container.textContent).toContain('Timeline');
    expect(container.textContent).not.toContain('No tasks available');

    await unmount(root);
  });

  it('folds into a compact running status capsule', async () => {
    const currentSession = {
      createdAt: Date.now(),
      description: '',
      events: [
        {
          actionSummary: 'Click - destination input field containing Beijing',
          hashId: 'event-1',
          type: 'click',
        },
      ],
      generatedCode: {},
      id: 'session-recording',
      name: 'Recording now',
      status: 'recording',
      target: {
        label: 'Android Device',
        platformId: 'android',
        values: {},
      },
      updatedAt: Date.now(),
    };
    mocks.recorder = createRecorderMock({
      currentSession,
      isRecording: true,
      sessionOverrides: currentSession,
    });
    mocks.playground = {
      controller: {
        state: {
          serverOnline: true,
          sessionViewState: { connected: true },
        },
      },
      phase: 'ready',
    };

    const { container, root } = await renderRecorderPanel();

    const collapseButton = container.querySelector(
      'button[aria-label="Collapse timeline panel"]',
    );
    await act(async () => {
      collapseButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(
      container.querySelector('.studio-timeline-panel-collapsed'),
    ).not.toBeNull();
    expect(container.textContent).toContain('Record');
    expect(
      container.querySelector(
        '.studio-recorder-floating-main-collapsed[aria-hidden="true"]',
      ),
    ).not.toBeNull();
    expect(container.textContent).not.toContain('Outputs');
    expect(
      container.querySelector('.studio-timeline-panel-action-icon'),
    ).toBeNull();
    expect(
      container.querySelector('.studio-recorder-floating-status-running'),
    ).toBeNull();

    await unmount(root);
  });

  it('does not show the running status icon when folded outside recording', async () => {
    mocks.recorder = createRecorderMock();
    mocks.playground = {
      controller: {
        state: {
          serverOnline: true,
          sessionViewState: { connected: true },
        },
      },
      phase: 'ready',
    };

    const { container, root } = await renderRecorderPanel();

    const collapseButton = container.querySelector(
      'button[aria-label="Collapse timeline panel"]',
    );

    expect(collapseButton).toBeNull();
    expect(
      container.querySelector('.studio-timeline-panel-collapsed'),
    ).toBeNull();
    expect(
      container.querySelector('.studio-recorder-floating-status-running'),
    ).toBeNull();
    expect(
      container.querySelector('button[aria-label="Recording history"]'),
    ).toBeNull();

    await unmount(root);
  });

  it('keeps generated Markdown out of the recorder footer', async () => {
    const currentSession = {
      createdAt: Date.now(),
      description: '',
      events: [
        {
          actionSummary: 'Click - destination input field containing Beijing',
          hashId: 'event-1',
          type: 'click',
        },
      ],
      generatedCode: {
        markdown: '# Search for Hotels in Hangzhou\n\naiAction(...)',
      },
      id: 'session-1',
      name: 'Renamed recording',
      status: 'recording',
      target: {
        label: 'Android Device',
        platformId: 'android',
        values: {},
      },
      updatedAt: Date.now(),
    };
    mocks.recorder = createRecorderMock({
      currentSession,
      isRecording: true,
      sessionOverrides: currentSession,
    });
    mocks.playground = {
      controller: {
        state: {
          serverOnline: true,
          sessionViewState: { connected: true },
        },
      },
      phase: 'ready',
    };

    const { container, root } = await renderRecorderPanel();

    expect(container.textContent).not.toContain('Renamed recording');
    expect(container.textContent).not.toContain(
      'Search for Hotels in Hangzhou',
    );
    expect(container.textContent).not.toContain('Outputs');
    const downloadOutputButton = container.querySelector(
      'button[aria-label="Download Markdown output"]',
    );
    expect(downloadOutputButton).toBeNull();
    expect(mocks.recorder.exportSessionCode).not.toHaveBeenCalled();

    await unmount(root);
  });

  it('waits for an explicit action before generating Markdown after stopping recording', async () => {
    let resolveStopRecording: (() => void) | undefined;
    const stopRecordingPromise = new Promise<void>((resolve) => {
      resolveStopRecording = resolve;
    });
    const currentSession = {
      createdAt: Date.now(),
      description: '',
      events: [
        {
          actionSummary: 'Click - destination input field containing Beijing',
          hashId: 'event-1',
          type: 'click',
        },
      ],
      generatedCode: {},
      id: 'session-recording',
      name: 'Recording now',
      status: 'recording',
      target: {
        label: 'Android Device',
        platformId: 'android',
        values: {},
      },
      updatedAt: Date.now(),
    };
    mocks.recorder = createRecorderMock({
      currentSession,
      isRecording: true,
      sessionOverrides: currentSession,
    });
    mocks.recorder.stopRecording = vi.fn(() => stopRecordingPromise);
    mocks.recorder.generateSessionCode = vi.fn(async () => '# Generated');
    mocks.playground = {
      controller: {
        state: {
          serverOnline: true,
          sessionViewState: { connected: true },
        },
      },
      phase: 'ready',
    };

    const onShowMarkdown = vi.fn();
    const { container, root } = await renderRecorderPanel({ onShowMarkdown });

    const stopButton = container.querySelector(
      'button[aria-label="Stop recording"]',
    );
    await act(async () => {
      stopButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mocks.recorder.stopRecording).toHaveBeenCalled();
    expect(mocks.recorder.generateSessionCode).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('Generating Description...');
    expect(container.textContent).not.toContain('Generate Description');
    const stoppingButton = container.querySelector(
      'button[aria-label="Stopping recording"]',
    );
    expect(stoppingButton).not.toBeNull();
    expect((stoppingButton as HTMLButtonElement | null)?.disabled).toBe(true);
    expect(
      stoppingButton?.classList.contains(
        'studio-recorder-floating-start-button-active',
      ),
    ).toBe(false);

    await act(async () => {
      resolveStopRecording?.();
      await stopRecordingPromise;
    });

    mocks.recorder.state.isRecording = false;
    mocks.recorder.currentSession = null;
    mocks.recorder.state.sessions = [
      {
        ...currentSession,
        status: 'completed',
      },
    ];

    await act(async () => {
      root.render(<StudioRecorderPanel onShowMarkdown={onShowMarkdown} />);
    });

    const generateButton = container.querySelector(
      'button[aria-label="Generate Description"]',
    );
    expect(generateButton).not.toBeNull();
    expect(generateButton?.textContent).toContain('Generate Description');
    expect(mocks.recorder.generateSessionCode).not.toHaveBeenCalled();

    await act(async () => {
      generateButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(mocks.recorder.generateSessionCode).toHaveBeenCalledWith(
      'session-recording',
      expect.objectContaining({ type: 'markdown' }),
    );
    expect(onShowMarkdown).toHaveBeenCalledWith(
      expect.objectContaining({
        markdown: '# Generated',
        onDelete: expect.any(Function),
        onDownload: expect.any(Function),
        title: 'Recording now',
      }),
    );
    expect(
      container.querySelector('button[aria-label="Generate Description"]'),
    ).not.toBeNull();

    await unmount(root);
  });

  it('keeps replay actions out of the recorder output controls', async () => {
    const currentSession = {
      createdAt: Date.now(),
      description: '',
      events: [
        {
          actionSummary: 'Click - destination input field containing Beijing',
          hashId: 'event-1',
          type: 'click',
        },
      ],
      generatedCode: {
        markdown: '# Search for Hotels in Hangzhou\n\naiAction(...)',
      },
      id: 'session-1',
      name: 'Existing recording',
      status: 'recording',
      target: {
        label: 'Android Device',
        platformId: 'android',
        values: {},
      },
      updatedAt: Date.now(),
    };
    mocks.recorder = createRecorderMock({
      currentSession,
      isRecording: true,
      sessionOverrides: currentSession,
    });
    mocks.playground = {
      controller: {
        state: {
          serverOnline: true,
          sessionViewState: { connected: true },
        },
      },
      phase: 'ready',
    };

    const { container, root } = await renderRecorderPanel();

    const replayButton = container.querySelector(
      'button[aria-label="Replay Markdown output"]',
    );
    const downloadButton = container.querySelector(
      'button[aria-label="Download Markdown output"]',
    );
    expect(replayButton).toBeNull();
    expect(downloadButton).toBeNull();

    await unmount(root);
  });
});
