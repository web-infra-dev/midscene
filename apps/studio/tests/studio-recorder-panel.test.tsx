// @vitest-environment jsdom
import { act, cloneElement, createElement, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  playground: null as any,
  recorder: null as any,
}));

vi.mock('antd', () => ({
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
  Tooltip: ({ children }: { children: ReactNode }) => children,
  Typography: {
    Text: ({ children }: { children: ReactNode }) =>
      createElement('span', null, children),
  },
  message: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

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
type StudioRecorderPanelProps = Parameters<typeof StudioRecorderPanel>[0];

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

async function renderRecorderPanel(props?: StudioRecorderPanelProps) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      props ? <StudioRecorderPanel {...props} /> : <StudioRecorderPanel />,
    );
  });

  return { container, root };
}

async function unmount(root: ReturnType<typeof createRoot>) {
  await act(async () => {
    root.unmount();
  });
}

describe('StudioRecorderPanel', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('starts on an empty timeline until history is opened', async () => {
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

    expect(container.textContent).toContain(
      'The recording task has not yet begun.',
    );
    expect(container.textContent).not.toContain('Existing recording');

    const historyButton = container.querySelector(
      'button[aria-label="Recording history"]',
    );
    await act(async () => {
      historyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(document.body.textContent).toContain('Existing recording');

    const actionsButton = document.body.querySelector(
      'button[aria-label="More actions for Existing recording"]',
    );
    await act(async () => {
      actionsButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const actionsMenu = document.body.querySelector(
      '.studio-recorder-history-actions-menu',
    );
    expect(actionsMenu?.textContent).toContain('download');
    expect(actionsMenu?.textContent).toContain('edit');
    expect(actionsMenu?.textContent).toContain('delete');
    expect(actionsMenu?.textContent).not.toContain('replay');
    const downloadButton = Array.from(
      actionsMenu?.querySelectorAll('button') ?? [],
    ).find((button) => button.textContent?.includes('download'));
    expect((downloadButton as HTMLButtonElement | undefined)?.disabled).toBe(
      true,
    );

    await act(async () => {
      historyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(document.body.textContent).not.toContain('Existing recording');

    await unmount(root);
  });

  it('edits the recording name from history item actions', async () => {
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

    const historyButton = container.querySelector(
      'button[aria-label="Recording history"]',
    );
    await act(async () => {
      historyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(document.body.textContent).toContain('Existing recording');

    const actionsButton = document.body.querySelector(
      'button[aria-label="More actions for Existing recording"]',
    );
    await act(async () => {
      actionsButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const editButton = Array.from(
      document.body.querySelectorAll(
        '.studio-recorder-history-actions-menu button',
      ),
    ).find((button) => button.textContent?.includes('edit'));

    expect(editButton).toBeTruthy();

    await act(async () => {
      editButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const input = document.body.querySelector<HTMLInputElement>(
      'input[aria-label="Recording name"]',
    );
    expect(input).toBeTruthy();
    expect(input?.value).toBe('Existing recording');

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      nativeInputValueSetter?.call(input, 'Renamed recording');
      input?.dispatchEvent(
        new InputEvent('input', { bubbles: true, inputType: 'insertText' }),
      );
    });

    await act(async () => {
      input?.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }),
      );
    });

    expect(mocks.recorder.renameSession).toHaveBeenCalledWith(
      'session-1',
      'Renamed recording',
    );

    await unmount(root);
  });

  it('closes recording history item actions when the history list scrolls', async () => {
    mocks.recorder = createRecorderMock({
      sessionOverrides: {
        generatedCode: {
          markdown: '# Existing recording\n\naiAction(...)',
        },
      },
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

    const historyButton = container.querySelector(
      'button[aria-label="Recording history"]',
    );
    await act(async () => {
      historyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const actionsButton = document.body.querySelector(
      'button[aria-label="More actions for Existing recording"]',
    );
    await act(async () => {
      actionsButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(
      document.body.querySelector('.studio-recorder-history-actions-menu'),
    ).not.toBeNull();

    const historyContent = document.body.querySelector('.history-content');
    await act(async () => {
      historyContent?.dispatchEvent(new Event('scroll', { bubbles: true }));
    });

    expect(
      document.body.querySelector('.studio-recorder-history-actions-menu'),
    ).toBeNull();

    await unmount(root);
  });

  it('shows all recording events and can expand the timeline height', async () => {
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

    expect(container.textContent).toContain('Record Timeline');
    expect(container.textContent).toContain('Booking.com app icon');
    expect(container.textContent).toContain(
      'destination input field containing Beijing',
    );
    expect(container.textContent).toContain('Click - Hangzhou');
    expect(container.textContent).toContain('Show more');

    const showMoreButton = container.querySelector(
      '.studio-recorder-floating-show-more',
    );
    await act(async () => {
      showMoreButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Hide more');
    expect(container.textContent).toContain('Outputs');
    expect(
      container.querySelector('.studio-recorder-floating-card-expanded'),
    ).not.toBeNull();

    await unmount(root);
  });

  it('shows the timeline toggle even when there is only one event', async () => {
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

    const showMoreButton = container.querySelector(
      'button[aria-label="Expand record timeline"]',
    );
    expect(showMoreButton).not.toBeNull();
    expect(container.textContent).toContain('Show more');

    await act(async () => {
      showMoreButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Hide more');
    expect(
      container.querySelector('.studio-recorder-floating-card-expanded'),
    ).not.toBeNull();

    const hideMoreButton = container.querySelector(
      'button[aria-label="Collapse record timeline"]',
    );
    await act(async () => {
      hideMoreButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Show more');
    expect(
      container.querySelector('.studio-recorder-floating-card-expanded'),
    ).toBeNull();

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

    expect(container.textContent).toContain('Record Timeline');
    expect(container.textContent).not.toContain(
      'The recording task has not yet begun.',
    );

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
      'button[aria-label="Collapse recorder panel"]',
    );
    await act(async () => {
      collapseButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(
      container.querySelector('.studio-recorder-floating-card-collapsed'),
    ).not.toBeNull();
    expect(container.textContent).toContain('Record and replay');
    expect(
      container.querySelector(
        '.studio-recorder-floating-main-collapsed[aria-hidden="true"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '.studio-recorder-floating-outputs-hidden[aria-hidden="true"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector('.studio-recorder-floating-status-running'),
    ).not.toBeNull();

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
      'button[aria-label="Collapse recorder panel"]',
    );
    await act(async () => {
      collapseButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(
      container.querySelector('.studio-recorder-floating-card-collapsed'),
    ).not.toBeNull();
    expect(
      container.querySelector('.studio-recorder-floating-status-running'),
    ).toBeNull();

    const historyButton = container.querySelector(
      'button[aria-label="Recording history"]',
    );
    await act(async () => {
      historyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(document.body.textContent).toContain('Existing recording');

    await unmount(root);
  });

  it('uses the current recording name for the generated Markdown output label', async () => {
    mocks.recorder = createRecorderMock({
      sessionOverrides: {
        generatedCode: {
          markdown: '# Search for Hotels in Hangzhou\n\naiAction(...)',
        },
        name: 'Renamed recording',
      },
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

    const historyButton = container.querySelector(
      'button[aria-label="Recording history"]',
    );
    await act(async () => {
      historyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const actionsButton = document.body.querySelector(
      'button[aria-label="More actions for Renamed recording"]',
    );
    await act(async () => {
      actionsButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const downloadButton = Array.from(
      document.body.querySelectorAll(
        '.studio-recorder-history-actions-menu button',
      ),
    ).find((button) => button.textContent?.includes('download'));
    expect((downloadButton as HTMLButtonElement | undefined)?.disabled).toBe(
      false,
    );

    const sessionCard = document.body.querySelector('.history-item');
    await act(async () => {
      sessionCard?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Renamed recording');
    expect(container.textContent).not.toContain(
      'Search for Hotels in Hangzhou',
    );
    const downloadOutputButton = container.querySelector(
      'button[aria-label="Download Markdown output"]',
    );
    expect(downloadOutputButton).not.toBeNull();
    await act(async () => {
      downloadOutputButton?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    expect(mocks.recorder.exportSessionCode).toHaveBeenCalledWith(
      'session-1',
      'markdown',
    );

    await unmount(root);
  });

  it('shows Markdown generation immediately after stopping recording', async () => {
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

    const { container, root } = await renderRecorderPanel();

    const stopButton = container.querySelector(
      'button[aria-label="Stop recording"]',
    );
    await act(async () => {
      stopButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mocks.recorder.stopRecording).toHaveBeenCalled();
    expect(mocks.recorder.generateSessionCode).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Generating markdown...');
    expect(container.textContent).not.toContain('No outputs yet');
    const stoppingButton = container.querySelector(
      'button[aria-label="Stopping recording"]',
    );
    expect(stoppingButton).not.toBeNull();
    expect((stoppingButton as HTMLButtonElement | null)?.disabled).toBe(true);
    expect(
      stoppingButton?.classList.contains(
        'studio-recorder-floating-record-button-active',
      ),
    ).toBe(false);

    await act(async () => {
      resolveStopRecording?.();
      await stopRecordingPromise;
    });

    await unmount(root);
  });

  it('replays generated Markdown output through the recorder panel action', async () => {
    const onReplayMarkdown = vi.fn(async () => undefined);
    mocks.recorder = createRecorderMock({
      sessionOverrides: {
        generatedCode: {
          markdown: '# Search for Hotels in Hangzhou\n\naiAction(...)',
        },
      },
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

    const { container, root } = await renderRecorderPanel({
      onReplayMarkdown,
    });

    const historyButton = container.querySelector(
      'button[aria-label="Recording history"]',
    );
    await act(async () => {
      historyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const sessionCard = document.body.querySelector('.history-item');
    await act(async () => {
      sessionCard?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const replayButton = container.querySelector(
      'button[aria-label="Replay Markdown output"]',
    );
    await act(async () => {
      replayButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onReplayMarkdown).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'session-1' }),
    );

    await unmount(root);
  });
});
