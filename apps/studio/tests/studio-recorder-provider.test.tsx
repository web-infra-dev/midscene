/** @vitest-environment jsdom */
import type { StudioPlaygroundContextValue } from '@renderer/playground/types';
import { act, createElement, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { StudioPlaygroundContext } from '../src/renderer/playground/useStudioPlayground';
import { StudioRecorderProvider } from '../src/renderer/recorder/StudioRecorderProvider';
import {
  describeStudioRecorderEventsWithAI,
  generateStudioRecorderCodeWithAI,
} from '../src/renderer/recorder/codegen';
import type { StudioRecorderContextValue } from '../src/renderer/recorder/types';
import { useStudioRecorder } from '../src/renderer/recorder/useStudioRecorder';

type ReadyStudioPlaygroundContext = Extract<
  StudioPlaygroundContextValue,
  { phase: 'ready' }
>;

vi.mock('../src/renderer/recorder/codegen', () => ({
  describeStudioRecorderEventsWithAI: vi.fn(
    async (events: Array<Record<string, unknown>>) =>
      events.map((event) => ({
        ...event,
        semantic: {
          source: 'recorderAI',
          status: 'ready',
          elementDescription: 'AI described target',
        },
      })),
  ),
  generateStudioRecorderCodeWithAI: vi.fn(async (_session, options) => {
    const type = options?.type || 'markdown';
    options?.onChunk?.(`partial ${type}\n`);
    return `ai ${type}\n`;
  }),
  generateStudioRecorderMetadataWithAI: vi.fn(async () => ({
    title: 'Browsing Midscene.js Documentation',
    description: 'The user visited the Midscene.js introduction page.',
  })),
  generateStudioRecorderYamlWithAI: vi.fn(async (_session, options) => {
    options?.onChunk?.('partial yaml\n');
    return 'ai yaml\n';
  }),
}));

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  vi.clearAllMocks();
});

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
  });
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function RecorderProbe({
  onRecorder,
}: {
  onRecorder: (recorder: StudioRecorderContextValue) => void;
}) {
  const recorder = useStudioRecorder();
  useEffect(() => {
    onRecorder(recorder);
  }, [onRecorder, recorder]);
  return null;
}

function createConnectedStudioContext({
  startResult = {
    ok: true,
    supported: true,
    source: 'studio-preview' as const,
  },
  events = [],
  describeRecorderEventAtPoint,
}: {
  startResult?: {
    ok: boolean;
    supported?: boolean;
    source?: string;
    error?: string;
  };
  events?: unknown[];
  describeRecorderEventAtPoint?: ReturnType<typeof vi.fn>;
} = {}) {
  const interact = vi.fn(async (_payload?: unknown) => ({ ok: true }));
  const startRecorderSession = vi.fn(async () => startResult);
  const stopRecorderSession = vi.fn(async () => ({ ok: true }));
  const getRecorderEvents = vi.fn(async (since = 0) => ({
    events: since === 0 ? events : [],
    nextIndex: since === 0 ? events.length : since,
  }));
  const playgroundSDK = {
    interact,
    startRecorderSession,
    stopRecorderSession,
    getRecorderEvents,
    ...(describeRecorderEventAtPoint ? { describeRecorderEventAtPoint } : {}),
  };

  const context: StudioPlaygroundContextValue = {
    phase: 'ready',
    serverUrl: 'http://127.0.0.1:5800',
    controller: {
      state: {
        form: {
          getFieldsValue: () => ({}),
          setFieldsValue: () => undefined,
        },
        formValues: {
          platformId: 'computer',
          'computer.displayId': '2',
        },
        runtimeInfo: {
          platformId: 'computer',
          title: 'Computer Playground',
          interface: { type: 'computer' },
          preview: { kind: 'screenshot' },
          executionUxHints: [],
          metadata: {
            displayId: '2',
            sessionDisplayName: 'DELL U2720Q',
          },
        },
        sessionSetup: {
          fields: [],
          targets: [],
        },
        serverOnline: true,
        isUserOperating: false,
        sessionMutating: false,
        playgroundSDK,
        sessionViewState: {
          connected: true,
          setupState: 'ready',
        },
      },
      actions: {
        refreshSessionSetup: vi.fn(async () => undefined),
        createSession: vi.fn(async () => false),
        destroySession: vi.fn(async () => undefined),
      },
    } as unknown as ReadyStudioPlaygroundContext['controller'],
    discoveredDevices: {
      android: [],
      ios: [],
      computer: [
        {
          platformId: 'computer',
          id: '2',
          label: 'DELL U2720Q',
          status: 'device',
          sessionValues: { displayId: '2' },
        },
      ],
      harmony: [],
      web: [],
    },
    refreshDiscoveredDevices: vi.fn(async () => undefined),
    restartPlayground: vi.fn(async () => undefined),
    setDiscoveryPollingPaused: vi.fn(),
  };

  return {
    context,
    playgroundSDK,
    interact,
    startRecorderSession,
    stopRecorderSession,
    getRecorderEvents,
    describeRecorderEventAtPoint,
  };
}

async function mountRecorder(context: StudioPlaygroundContextValue) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let recorder: StudioRecorderContextValue | null = null;

  const render = (nextContext: StudioPlaygroundContextValue) => {
    root.render(
      createElement(
        StudioPlaygroundContext.Provider,
        { value: nextContext },
        createElement(
          StudioRecorderProvider,
          null,
          createElement(RecorderProbe, {
            onRecorder: (value) => {
              recorder = value;
            },
          }),
        ),
      ),
    );
  };

  await act(async () => {
    render(context);
  });
  await flushPromises();

  return {
    get recorder() {
      return recorder;
    },
    rerender: async (nextContext: StudioPlaygroundContextValue) => {
      await act(async () => {
        render(nextContext);
      });
      await flushPromises();
    },
    cleanup: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe('StudioRecorderProvider preview recording', () => {
  it('records events emitted by the playground preview recorder', async () => {
    const event = {
      type: 'click',
      source: 'studio-preview',
      semantic: {
        source: 'aiDescribe',
        status: 'ready',
        elementDescription: 'Introduction',
      },
      elementRect: { x: 10, y: 20 },
      pageInfo: { width: 1200, height: 800 },
      timestamp: 123,
      hashId: 'click-1',
    };
    const { context, startRecorderSession, getRecorderEvents } =
      createConnectedStudioContext({ events: [event] });
    const mounted = await mountRecorder(context);

    await act(async () => {
      await mounted.recorder?.startRecording();
    });
    await flushPromises();

    expect(startRecorderSession).toHaveBeenCalledWith(
      mounted.recorder?.currentSession?.id,
    );
    expect(getRecorderEvents).toHaveBeenCalledWith(0);
    expect(mounted.recorder?.currentSession?.events).toHaveLength(1);
    expect(mounted.recorder?.currentSession?.events[0]).toMatchObject({
      actionType: 'Click',
      type: 'click',
      platformId: 'computer',
      semantic: {
        elementDescription: 'Introduction',
      },
    });
    expect(describeStudioRecorderEventsWithAI).not.toHaveBeenCalled();

    await mounted.cleanup();
  });

  it('stops recording when the current target disappears from discovery', async () => {
    const { context, stopRecorderSession } = createConnectedStudioContext();
    const mounted = await mountRecorder(context);

    await act(async () => {
      await mounted.recorder?.startRecording();
    });
    await flushPromises();

    expect(mounted.recorder?.state.isRecording).toBe(true);

    await mounted.rerender({
      ...context,
      discoveredDevices: {
        ...context.discoveredDevices!,
        computer: [],
      },
    });
    await flushPromises();
    await flushPromises();

    expect(stopRecorderSession).toHaveBeenCalled();
    expect(mounted.recorder?.state.isRecording).toBe(false);
    expect(mounted.recorder?.currentSession?.status).toBe('completed');

    await mounted.cleanup();
  });

  it('serializes overlapping preview recorder drains so cursor advances in order', async () => {
    vi.useFakeTimers();
    const firstPoll = createDeferred<{
      events: unknown[];
      nextIndex: number;
    }>();
    const firstEvent = {
      type: 'click',
      source: 'studio-preview',
      actionType: 'Click',
      semantic: {
        source: 'aiDescribe',
        status: 'ready',
        elementDescription: 'First',
      },
      elementRect: { x: 10, y: 20 },
      pageInfo: { width: 1200, height: 800 },
      timestamp: 123,
      hashId: 'click-first',
    };
    const secondEvent = {
      type: 'click',
      source: 'studio-preview',
      actionType: 'Click',
      semantic: {
        source: 'aiDescribe',
        status: 'ready',
        elementDescription: 'Second',
      },
      elementRect: { x: 30, y: 40 },
      pageInfo: { width: 1200, height: 800 },
      timestamp: 124,
      hashId: 'click-second',
    };
    const { context, getRecorderEvents } = createConnectedStudioContext();
    getRecorderEvents
      .mockResolvedValueOnce({ events: [], nextIndex: 0 })
      .mockReturnValueOnce(firstPoll.promise as any)
      .mockResolvedValueOnce({ events: [secondEvent], nextIndex: 2 });
    const mounted = await mountRecorder(context);

    try {
      await act(async () => {
        await mounted.recorder?.startRecording();
      });
      await flushPromises();
      expect(getRecorderEvents).toHaveBeenCalledWith(0);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(getRecorderEvents).toHaveBeenCalledTimes(2);
      expect(getRecorderEvents).toHaveBeenNthCalledWith(2, 0);

      await act(async () => {
        firstPoll.resolve({ events: [firstEvent], nextIndex: 1 });
        await firstPoll.promise;
      });
      await flushPromises();

      expect(getRecorderEvents).toHaveBeenCalledTimes(3);
      expect(getRecorderEvents).toHaveBeenNthCalledWith(3, 1);
      expect(mounted.recorder?.currentSession?.events).toMatchObject([
        { hashId: 'click-first' },
        { hashId: 'click-second' },
      ]);
    } finally {
      await mounted.cleanup();
      vi.useRealTimers();
    }
  });

  it('falls back from aiDescribe failed events to recorderAI descriptions', async () => {
    const event = {
      type: 'click',
      source: 'studio-preview',
      actionType: 'Click',
      semantic: {
        source: 'aiDescribe',
        status: 'failed',
        error: 'aiDescribe verification failed.',
      },
      elementRect: { x: 10, y: 20 },
      pageInfo: { width: 1200, height: 800 },
      screenshotAfter: 'data:image/png;base64,shot',
      timestamp: 123,
      hashId: 'click-ai-describe-failed',
    };
    const { context } = createConnectedStudioContext({ events: [event] });
    const mounted = await mountRecorder(context);

    await act(async () => {
      await mounted.recorder?.startRecording();
    });
    await flushPromises();
    await flushPromises();

    expect(describeStudioRecorderEventsWithAI).toHaveBeenCalledWith(
      [expect.objectContaining({ hashId: 'click-ai-describe-failed' })],
      expect.any(Object),
    );
    expect(mounted.recorder?.currentSession?.events[0]).toMatchObject({
      hashId: 'click-ai-describe-failed',
      semantic: {
        source: 'recorderAI',
        status: 'ready',
        elementDescription: 'AI described target',
        fallbackFrom: {
          source: 'aiDescribe',
          status: 'failed',
          error: 'aiDescribe verification failed.',
        },
      },
    });

    await mounted.cleanup();
  });

  it('describes scroll events with recorderAI without calling aiDescribe', async () => {
    const event = {
      type: 'scroll',
      source: 'studio-preview',
      actionType: 'Scroll',
      rawPayload: {
        actionType: 'Scroll',
        direction: 'down',
        distance: 640,
        x: 500,
        y: 650,
      },
      value: 'down 640',
      title: 'Semi Design List',
      elementRect: { x: 500, y: 650 },
      pageInfo: { width: 1200, height: 800 },
      screenshotAfter: 'data:image/png;base64,shot',
      timestamp: 123,
      hashId: 'scroll-recorder-ai',
    };
    const describeRecorderEventAtPoint = vi.fn(async () => ({
      ok: true,
      event,
    }));
    const { context } = createConnectedStudioContext({
      events: [event],
      describeRecorderEventAtPoint,
    });
    const mounted = await mountRecorder(context);

    await act(async () => {
      await mounted.recorder?.startRecording();
    });
    await flushPromises();
    await flushPromises();

    expect(describeRecorderEventAtPoint).not.toHaveBeenCalled();
    expect(describeStudioRecorderEventsWithAI).toHaveBeenCalledWith(
      [expect.objectContaining({ hashId: 'scroll-recorder-ai' })],
      expect.any(Object),
    );
    expect(mounted.recorder?.currentSession?.events[0]).toMatchObject({
      hashId: 'scroll-recorder-ai',
      semantic: {
        source: 'recorderAI',
        status: 'ready',
        elementDescription: 'AI described target',
      },
    });

    await mounted.cleanup();
  });

  it('uses a detailed heuristic description when scroll recorderAI fails', async () => {
    vi.mocked(describeStudioRecorderEventsWithAI).mockRejectedValueOnce(
      new Error('model unavailable'),
    );
    const event = {
      type: 'scroll',
      source: 'studio-preview',
      actionType: 'Scroll',
      rawPayload: {
        actionType: 'Scroll',
        direction: 'down',
        distance: 640,
        x: 500,
        y: 650,
      },
      value: 'down 640',
      title: 'Semi Design List',
      elementRect: { x: 500, y: 650 },
      pageInfo: { width: 1200, height: 800 },
      screenshotAfter: 'data:image/png;base64,shot',
      timestamp: 123,
      hashId: 'scroll-heuristic',
    };
    const describeRecorderEventAtPoint = vi.fn();
    const { context } = createConnectedStudioContext({
      events: [event],
      describeRecorderEventAtPoint,
    });
    const mounted = await mountRecorder(context);

    await act(async () => {
      await mounted.recorder?.startRecording();
    });
    await flushPromises();
    await flushPromises();

    expect(describeRecorderEventAtPoint).not.toHaveBeenCalled();
    expect(mounted.recorder?.currentSession?.events[0]).toMatchObject({
      hashId: 'scroll-heuristic',
      semantic: {
        source: 'heuristic',
        status: 'ready',
        confidence: 'low',
        elementDescription:
          'Semi Design List near point (500, 650), scroll down 640',
        replayInstruction: expect.stringContaining('down 640'),
        actionSummary: expect.stringContaining('down 640'),
      },
    });

    await mounted.cleanup();
  });

  it('falls back to recorderAI when aiDescribe times out', async () => {
    vi.useFakeTimers();
    const event = {
      type: 'click',
      source: 'studio-preview',
      actionType: 'Click',
      elementRect: { x: 10, y: 20 },
      pageInfo: { width: 1200, height: 800 },
      screenshotAfter: 'data:image/png;base64,shot',
      timestamp: 123,
      hashId: 'click-ai-describe-timeout',
    };
    const describeRecorderEventAtPoint = vi.fn(
      () => new Promise<never>(() => undefined),
    );
    const { context } = createConnectedStudioContext({
      events: [event],
      describeRecorderEventAtPoint,
    });
    const mounted = await mountRecorder(context);

    try {
      await act(async () => {
        await mounted.recorder?.startRecording();
      });
      await flushPromises();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(32_000);
      });
      await flushPromises();
      await flushPromises();

      expect(describeStudioRecorderEventsWithAI).toHaveBeenCalledWith(
        [expect.objectContaining({ hashId: 'click-ai-describe-timeout' })],
        expect.any(Object),
      );
      expect(mounted.recorder?.currentSession?.events[0]).toMatchObject({
        hashId: 'click-ai-describe-timeout',
        semantic: {
          source: 'recorderAI',
          status: 'ready',
          elementDescription: 'AI described target',
          fallbackFrom: {
            source: 'aiDescribe',
            status: 'failed',
            error: 'Timed out while analyzing recorder event with aiDescribe.',
          },
        },
      });
    } finally {
      await mounted.cleanup();
      vi.useRealTimers();
    }
  });

  it('updates preview events with AI descriptions after recording', async () => {
    const event = {
      type: 'click',
      source: 'studio-preview',
      actionType: 'Click',
      elementRect: { x: 10, y: 20 },
      pageInfo: { width: 1200, height: 800 },
      screenshotAfter: 'data:image/png;base64,shot',
      timestamp: 123,
      hashId: 'click-described',
    };
    const { context } = createConnectedStudioContext({ events: [event] });
    const mounted = await mountRecorder(context);

    await act(async () => {
      await mounted.recorder?.startRecording();
    });
    await flushPromises();
    await flushPromises();

    expect(describeStudioRecorderEventsWithAI).toHaveBeenCalledWith(
      [expect.objectContaining({ hashId: 'click-described' })],
      expect.any(Object),
    );
    expect(mounted.recorder?.currentSession?.events[0]).toMatchObject({
      hashId: 'click-described',
      semantic: {
        source: 'recorderAI',
        status: 'ready',
        elementDescription: 'AI described target',
      },
    });

    await mounted.cleanup();
  });

  it('coalesces consecutive preview input events before recording and describing them', async () => {
    const inputH = {
      type: 'input',
      source: 'studio-preview',
      actionType: 'Input',
      rawPayload: { actionType: 'Input', mode: 'typeOnly', value: 'h' },
      value: 'h',
      url: 'https://example.com',
      title: 'Example',
      pageInfo: { width: 1200, height: 800 },
      elementRect: { x: 100, y: 200 },
      screenshotBefore: 'data:image/png;base64,before',
      screenshotAfter: 'data:image/png;base64,h',
      timestamp: 123,
      hashId: 'input-h',
    };
    const inputE = {
      type: 'input',
      source: 'studio-preview',
      actionType: 'Input',
      rawPayload: { actionType: 'Input', mode: 'typeOnly', value: 'e' },
      value: 'e',
      url: 'https://example.com',
      title: 'Example',
      pageInfo: { width: 1200, height: 800 },
      elementRect: { x: 100, y: 200 },
      screenshotAfter: 'data:image/png;base64,he',
      timestamp: 124,
      hashId: 'input-e',
    };
    const click = {
      type: 'click',
      source: 'studio-preview',
      actionType: 'Click',
      semantic: {
        source: 'aiDescribe',
        status: 'ready',
        elementDescription: 'Submit',
      },
      elementRect: { x: 10, y: 20 },
      pageInfo: { width: 1200, height: 800 },
      timestamp: 125,
      hashId: 'click-after-input',
    };
    const { context } = createConnectedStudioContext({
      events: [inputH, inputE, click],
    });
    const mounted = await mountRecorder(context);

    await act(async () => {
      await mounted.recorder?.startRecording();
    });
    await flushPromises();
    await flushPromises();

    expect(mounted.recorder?.currentSession?.events).toHaveLength(2);
    expect(mounted.recorder?.currentSession?.events[0]).toMatchObject({
      hashId: 'input-h',
      type: 'input',
      value: 'he',
      rawPayload: expect.objectContaining({ value: 'he' }),
      screenshotBefore: 'data:image/png;base64,before',
      screenshotAfter: 'data:image/png;base64,he',
      timestamp: 124,
    });
    expect(mounted.recorder?.currentSession?.events[1]).toMatchObject({
      hashId: 'click-after-input',
      type: 'click',
    });
    expect(describeStudioRecorderEventsWithAI).toHaveBeenCalledTimes(1);
    expect(describeStudioRecorderEventsWithAI).toHaveBeenCalledWith(
      [expect.objectContaining({ hashId: 'input-h', value: 'he' })],
      expect.any(Object),
    );

    await mounted.cleanup();
  });

  it('updates merged preview input when late semantic arrives for a merged fragment', async () => {
    const inputA = {
      type: 'input',
      source: 'studio-preview',
      actionType: 'Input',
      rawPayload: { actionType: 'Input', mode: 'typeOnly', value: 'a' },
      value: 'a',
      url: 'https://example.com',
      title: 'Example',
      pageInfo: { width: 1200, height: 800 },
      elementRect: { x: 100, y: 200 },
      screenshotAfter: 'data:image/png;base64,a',
      timestamp: 123,
      hashId: 'input-a',
      semantic: {
        source: 'aiDescribe',
        status: 'ready',
        elementDescription: 'login input field',
      },
    };
    const inputB = {
      type: 'input',
      source: 'studio-preview',
      actionType: 'Input',
      rawPayload: { actionType: 'Input', mode: 'typeOnly', value: 'b' },
      value: 'b',
      url: 'https://example.com',
      title: 'Example',
      pageInfo: { width: 1200, height: 800 },
      elementRect: { x: 100, y: 200 },
      screenshotAfter: 'data:image/png;base64,ab',
      timestamp: 124,
      hashId: 'input-b',
    };
    const click = {
      type: 'click',
      source: 'studio-preview',
      actionType: 'Click',
      semantic: {
        source: 'aiDescribe',
        status: 'ready',
        elementDescription: 'Submit',
      },
      elementRect: { x: 10, y: 20 },
      pageInfo: { width: 1200, height: 800 },
      timestamp: 125,
      hashId: 'click-after-input',
    };
    const lateInputBSemantic = {
      ...inputB,
      value: 'b',
      timestamp: 126,
      semantic: {
        source: 'aiDescribe',
        status: 'ready',
        elementDescription: 'verification code input field',
      },
    };
    const { context } = createConnectedStudioContext({
      events: [inputA, inputB, click, lateInputBSemantic],
    });
    const mounted = await mountRecorder(context);

    await act(async () => {
      await mounted.recorder?.startRecording();
    });
    await flushPromises();
    await flushPromises();

    expect(mounted.recorder?.currentSession?.events).toHaveLength(2);
    expect(mounted.recorder?.currentSession?.events[0]).toMatchObject({
      hashId: 'input-a',
      mergedHashIds: ['input-a', 'input-b'],
      type: 'input',
      value: 'ab',
      rawPayload: expect.objectContaining({ value: 'ab' }),
      semantic: {
        source: 'aiDescribe',
        status: 'ready',
        elementDescription: 'verification code input field',
        replayInstruction:
          'Input "ab" into the element described as "verification code input field".',
      },
    });
    expect(mounted.recorder?.currentSession?.events[1]).toMatchObject({
      hashId: 'click-after-input',
      type: 'click',
    });
    expect(describeStudioRecorderEventsWithAI).not.toHaveBeenCalled();

    await mounted.cleanup();
  });

  it('coalesces adjacent preview input events without requiring stable element rects', async () => {
    const inputA = {
      type: 'input',
      source: 'studio-preview',
      actionType: 'Input',
      rawPayload: { actionType: 'Input', mode: 'typeOnly', value: 'a' },
      value: 'a',
      url: 'https://example.com',
      title: 'Example',
      pageInfo: { width: 1200, height: 800 },
      timestamp: 123,
      hashId: 'input-a',
    };
    const inputB = {
      type: 'input',
      source: 'studio-preview',
      actionType: 'Input',
      rawPayload: { actionType: 'Input', mode: 'typeOnly', value: 'b' },
      value: 'b',
      url: 'https://example.com',
      title: 'Example',
      pageInfo: { width: 1200, height: 800 },
      timestamp: 124,
      hashId: 'input-b',
    };
    const click = {
      type: 'click',
      source: 'studio-preview',
      actionType: 'Click',
      semantic: {
        source: 'aiDescribe',
        status: 'ready',
        elementDescription: 'Submit',
      },
      elementRect: { x: 10, y: 20 },
      pageInfo: { width: 1200, height: 800 },
      timestamp: 125,
      hashId: 'click-after-input',
    };
    const { context } = createConnectedStudioContext({
      events: [inputA, inputB, click],
    });
    const mounted = await mountRecorder(context);

    await act(async () => {
      await mounted.recorder?.startRecording();
    });
    await flushPromises();
    await flushPromises();

    expect(mounted.recorder?.currentSession?.events).toHaveLength(2);
    expect(mounted.recorder?.currentSession?.events[0]).toMatchObject({
      hashId: 'input-a',
      value: 'ab',
      rawPayload: expect.objectContaining({ value: 'ab' }),
    });
    expect(mounted.recorder?.currentSession?.events[1]).toMatchObject({
      hashId: 'click-after-input',
      type: 'click',
    });

    await mounted.cleanup();
  });

  it('keeps delayed pending input events in original timestamp order', async () => {
    const clickBeforeDelayedInput = {
      type: 'click',
      source: 'studio-preview',
      actionType: 'Click',
      semantic: {
        source: 'aiDescribe',
        status: 'ready',
        elementDescription: 'Get verification code',
      },
      elementRect: { x: 300, y: 200 },
      pageInfo: { width: 1200, height: 800 },
      timestamp: 200,
      hashId: 'click-before-delayed-input',
    };
    const delayedInput = {
      type: 'input',
      source: 'studio-preview',
      actionType: 'Input',
      rawPayload: { actionType: 'Input', mode: 'typeOnly', value: '234' },
      value: '234',
      url: 'https://example.com',
      title: 'Example',
      pageInfo: { width: 1200, height: 800 },
      elementRect: { x: 100, y: 200 },
      timestamp: 100,
      hashId: 'delayed-input',
    };
    const clickAfterDelayedInput = {
      type: 'click',
      source: 'studio-preview',
      actionType: 'Click',
      semantic: {
        source: 'aiDescribe',
        status: 'ready',
        elementDescription: 'Submit',
      },
      elementRect: { x: 400, y: 300 },
      pageInfo: { width: 1200, height: 800 },
      timestamp: 300,
      hashId: 'click-after-delayed-input',
    };
    const { context } = createConnectedStudioContext({
      events: [clickBeforeDelayedInput, delayedInput, clickAfterDelayedInput],
    });
    const mounted = await mountRecorder(context);

    await act(async () => {
      await mounted.recorder?.startRecording();
    });
    await flushPromises();
    await flushPromises();

    expect(
      mounted.recorder?.currentSession?.events.map((event) => event.hashId),
    ).toEqual([
      'delayed-input',
      'click-before-delayed-input',
      'click-after-delayed-input',
    ]);

    await mounted.cleanup();
  });

  it('uses hashId timestamp fallback to order delayed recorder events', async () => {
    const clickBeforeDelayedInput = {
      type: 'click',
      source: 'studio-preview',
      actionType: 'Click',
      semantic: {
        source: 'aiDescribe',
        status: 'ready',
        elementDescription: 'Get verification code',
      },
      elementRect: { x: 300, y: 200 },
      pageInfo: { width: 1200, height: 800 },
      hashId: 'studio-preview-Tap-1781087667955-click-before-delayed-input',
    };
    const delayedInput = {
      type: 'input',
      source: 'studio-preview',
      actionType: 'Input',
      rawPayload: { actionType: 'Input', mode: 'typeOnly', value: '234' },
      value: '234',
      url: 'https://example.com',
      title: 'Example',
      pageInfo: { width: 1200, height: 800 },
      elementRect: { x: 100, y: 200 },
      hashId: 'studio-preview-Input-1781087662206-delayed-input',
    };
    const clickAfterDelayedInput = {
      type: 'click',
      source: 'studio-preview',
      actionType: 'Click',
      semantic: {
        source: 'aiDescribe',
        status: 'ready',
        elementDescription: 'Submit',
      },
      elementRect: { x: 400, y: 300 },
      pageInfo: { width: 1200, height: 800 },
      hashId: 'studio-preview-Tap-1781087669540-click-after-delayed-input',
    };
    const { context } = createConnectedStudioContext({
      events: [clickBeforeDelayedInput, delayedInput, clickAfterDelayedInput],
    });
    const mounted = await mountRecorder(context);

    await act(async () => {
      await mounted.recorder?.startRecording();
    });
    await flushPromises();
    await flushPromises();

    expect(
      mounted.recorder?.currentSession?.events.map((event) => event.hashId),
    ).toEqual([
      'studio-preview-Input-1781087662206-delayed-input',
      'studio-preview-Tap-1781087667955-click-before-delayed-input',
      'studio-preview-Tap-1781087669540-click-after-delayed-input',
    ]);

    await mounted.cleanup();
  });

  it('keeps phone and verification code input batches separated by click boundaries', async () => {
    const phoneFirst = {
      type: 'input',
      source: 'studio-preview',
      actionType: 'Input',
      rawPayload: { actionType: 'Input', mode: 'typeOnly', value: '1' },
      value: '1',
      url: 'https://www.douyin.com/jingxuan',
      title: 'Douyin',
      pageInfo: { width: 1200, height: 800 },
      elementRect: { x: 100, y: 200 },
      hashId: 'studio-preview-Input-1781087661904-phone-first',
    };
    const getCodeClick = {
      type: 'click',
      source: 'studio-preview',
      actionType: 'Click',
      semantic: {
        source: 'aiDescribe',
        status: 'ready',
        elementDescription: 'Get verification code',
      },
      elementRect: { x: 300, y: 200 },
      pageInfo: { width: 1200, height: 800 },
      hashId: 'studio-preview-Tap-1781087667955-get-code',
    };
    const codeFieldClick = {
      type: 'click',
      source: 'studio-preview',
      actionType: 'Click',
      semantic: {
        source: 'aiDescribe',
        status: 'ready',
        elementDescription: 'Verification code field',
      },
      elementRect: { x: 100, y: 260 },
      pageInfo: { width: 1200, height: 800 },
      hashId: 'studio-preview-Tap-1781087669540-code-field',
    };
    const delayedPhoneRest = {
      type: 'input',
      source: 'studio-preview',
      actionType: 'Input',
      rawPayload: {
        actionType: 'Input',
        mode: 'typeOnly',
        value: '2343014883',
      },
      value: '2343014883',
      url: 'https://www.douyin.com/jingxuan',
      title: 'Douyin',
      pageInfo: { width: 1200, height: 800 },
      elementRect: { x: 100, y: 200 },
      hashId: 'studio-preview-Input-1781087662206-phone-rest',
    };
    const codeInput = {
      type: 'input',
      source: 'studio-preview',
      actionType: 'Input',
      rawPayload: { actionType: 'Input', mode: 'typeOnly', value: '002937' },
      value: '002937',
      url: 'https://www.douyin.com/jingxuan',
      title: 'Douyin',
      pageInfo: { width: 1200, height: 800 },
      elementRect: { x: 100, y: 260 },
      hashId: 'studio-preview-Input-1781087671200-code',
    };
    const submitClick = {
      type: 'click',
      source: 'studio-preview',
      actionType: 'Click',
      semantic: {
        source: 'aiDescribe',
        status: 'ready',
        elementDescription: 'Submit login',
      },
      elementRect: { x: 500, y: 360 },
      pageInfo: { width: 1200, height: 800 },
      hashId: 'studio-preview-Tap-1781087678000-submit',
    };
    const { context } = createConnectedStudioContext({
      events: [
        phoneFirst,
        getCodeClick,
        codeFieldClick,
        delayedPhoneRest,
        codeInput,
        submitClick,
      ],
    });
    const mounted = await mountRecorder(context);

    await act(async () => {
      await mounted.recorder?.startRecording();
    });
    await flushPromises();
    await flushPromises();

    expect(
      mounted.recorder?.currentSession?.events.map((event) => ({
        type: event.type,
        value: event.value,
        hashId: event.hashId,
      })),
    ).toEqual([
      {
        type: 'input',
        value: '12343014883',
        hashId: 'studio-preview-Input-1781087661904-phone-first',
      },
      {
        type: 'click',
        value: undefined,
        hashId: 'studio-preview-Tap-1781087667955-get-code',
      },
      {
        type: 'click',
        value: undefined,
        hashId: 'studio-preview-Tap-1781087669540-code-field',
      },
      {
        type: 'input',
        value: '002937',
        hashId: 'studio-preview-Input-1781087671200-code',
      },
      {
        type: 'click',
        value: undefined,
        hashId: 'studio-preview-Tap-1781087678000-submit',
      },
    ]);

    await mounted.cleanup();
  });

  it('describes merged input with the same canonical event for aiDescribe and recorderAI fallback', async () => {
    vi.mocked(describeStudioRecorderEventsWithAI).mockResolvedValueOnce([
      {
        type: 'input',
        actionType: 'Input',
        semantic: {
          source: 'recorderAI',
          status: 'ready',
          elementDescription: 'phone number input field',
        },
      } as any,
    ]);
    const describeRecorderEventAtPoint = vi.fn(async (event) => ({
      ok: true,
      event: {
        ...event,
        semantic: {
          source: 'aiDescribe',
          status: 'failed',
          error: 'aiDescribe verification failed.',
        },
      },
    }));
    const phoneFirst = {
      type: 'input',
      source: 'studio-preview',
      actionType: 'Input',
      rawPayload: { actionType: 'Input', mode: 'typeOnly', value: '1' },
      value: '1',
      url: 'https://www.douyin.com/jingxuan',
      title: 'Douyin',
      pageInfo: { width: 1200, height: 800 },
      elementRect: { x: 100, y: 200 },
      screenshotAfter: 'data:image/png;base64,phone-a',
      timestamp: 123,
      hashId: 'studio-preview-Input-1781087661904-phone-first',
    };
    const phoneRest = {
      type: 'input',
      source: 'studio-preview',
      actionType: 'Input',
      rawPayload: {
        actionType: 'Input',
        mode: 'typeOnly',
        value: '2343014883',
      },
      value: '2343014883',
      url: 'https://www.douyin.com/jingxuan',
      title: 'Douyin',
      pageInfo: { width: 1200, height: 800 },
      elementRect: { x: 100, y: 200 },
      screenshotAfter: 'data:image/png;base64,phone-b',
      timestamp: 124,
      hashId: 'studio-preview-Input-1781087662206-phone-rest',
    };
    const clickBoundary = {
      type: 'click',
      source: 'studio-preview',
      actionType: 'Click',
      semantic: {
        source: 'aiDescribe',
        status: 'ready',
        elementDescription: 'Get verification code',
      },
      elementRect: { x: 300, y: 200 },
      pageInfo: { width: 1200, height: 800 },
      screenshotAfter: 'data:image/png;base64,click',
      timestamp: 125,
      hashId: 'studio-preview-Tap-1781087667955-get-code',
    };
    const { context } = createConnectedStudioContext({
      events: [phoneFirst, phoneRest, clickBoundary],
      describeRecorderEventAtPoint,
    });
    const mounted = await mountRecorder(context);

    await act(async () => {
      await mounted.recorder?.startRecording();
    });
    await flushPromises();
    await flushPromises();

    expect(describeRecorderEventAtPoint).toHaveBeenCalledTimes(1);
    expect(describeRecorderEventAtPoint).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'input',
        value: '12343014883',
        hashId: 'studio-preview-Input-1781087661904-phone-first',
        mergedHashIds: [
          'studio-preview-Input-1781087661904-phone-first',
          'studio-preview-Input-1781087662206-phone-rest',
        ],
      }),
    );
    expect(describeStudioRecorderEventsWithAI).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          type: 'input',
          value: '12343014883',
          hashId: 'studio-preview-Input-1781087661904-phone-first',
          mergedHashIds: [
            'studio-preview-Input-1781087661904-phone-first',
            'studio-preview-Input-1781087662206-phone-rest',
          ],
        }),
      ],
      expect.any(Object),
    );
    expect(mounted.recorder?.currentSession?.events[0]).toMatchObject({
      value: '12343014883',
      semantic: {
        source: 'recorderAI',
        status: 'ready',
        elementDescription: 'phone number input field',
        fallbackFrom: {
          source: 'aiDescribe',
          status: 'failed',
          error: 'aiDescribe verification failed.',
        },
      },
    });

    await mounted.cleanup();
  });

  it('uses recorder input value when recorderAI describes input target', async () => {
    vi.mocked(describeStudioRecorderEventsWithAI).mockResolvedValueOnce([
      {
        type: 'input',
        actionType: 'Input',
        value: '00022993377',
        semantic: {
          source: 'recorderAI',
          status: 'ready',
          elementDescription: 'verification code input field',
          replayInstruction:
            'Input "00022993377" into the element described as "verification code input field".',
          actionSummary: 'Input wrong OCR value',
        },
      } as any,
    ]);
    const inputEvent = {
      type: 'input',
      source: 'studio-preview',
      actionType: 'Input',
      rawPayload: { actionType: 'Input', mode: 'typeOnly', value: '002937' },
      value: '002937',
      url: 'https://example.com',
      title: 'Example',
      pageInfo: { width: 1200, height: 800 },
      elementRect: { x: 100, y: 200 },
      screenshotAfter: 'data:image/png;base64,code',
      timestamp: 123,
      hashId: 'input-code',
      semantic: {
        source: 'aiDescribe',
        status: 'failed',
        error: 'aiDescribe failed',
      },
    };
    const click = {
      type: 'click',
      source: 'studio-preview',
      actionType: 'Click',
      semantic: {
        source: 'aiDescribe',
        status: 'ready',
        elementDescription: 'Submit',
      },
      elementRect: { x: 10, y: 20 },
      pageInfo: { width: 1200, height: 800 },
      timestamp: 124,
      hashId: 'click-after-input',
    };
    const { context } = createConnectedStudioContext({
      events: [inputEvent, click],
    });
    const mounted = await mountRecorder(context);

    await act(async () => {
      await mounted.recorder?.startRecording();
    });
    await flushPromises();
    await flushPromises();

    expect(mounted.recorder?.currentSession?.events[0]).toMatchObject({
      hashId: 'input-code',
      value: '002937',
      semantic: {
        source: 'recorderAI',
        status: 'ready',
        elementDescription: 'verification code input field',
        replayInstruction:
          'Input "002937" into the element described as "verification code input field".',
        actionSummary: 'Input into verification code input field',
      },
    });

    await mounted.cleanup();
  });

  it('does not coalesce preview input events unless both are typeOnly', async () => {
    const inputH = {
      type: 'input',
      source: 'studio-preview',
      actionType: 'Input',
      rawPayload: { actionType: 'Input', mode: 'typeOnly', value: 'h' },
      value: 'h',
      url: 'https://example.com',
      title: 'Example',
      pageInfo: { width: 1200, height: 800 },
      timestamp: 123,
      hashId: 'input-h',
    };
    const replaceInput = {
      type: 'input',
      source: 'studio-preview',
      actionType: 'Input',
      rawPayload: { actionType: 'Input', mode: 'replace', value: 'hello' },
      value: 'hello',
      url: 'https://example.com',
      title: 'Example',
      pageInfo: { width: 1200, height: 800 },
      timestamp: 124,
      hashId: 'input-replace',
    };
    const click = {
      type: 'click',
      source: 'studio-preview',
      actionType: 'Click',
      semantic: {
        source: 'aiDescribe',
        status: 'ready',
        elementDescription: 'Submit',
      },
      elementRect: { x: 10, y: 20 },
      pageInfo: { width: 1200, height: 800 },
      timestamp: 125,
      hashId: 'click-after-input',
    };
    const { context } = createConnectedStudioContext({
      events: [inputH, replaceInput, click],
    });
    const mounted = await mountRecorder(context);

    await act(async () => {
      await mounted.recorder?.startRecording();
    });
    await flushPromises();
    await flushPromises();

    expect(mounted.recorder?.currentSession?.events).toHaveLength(3);
    expect(mounted.recorder?.currentSession?.events[0]).toMatchObject({
      hashId: 'input-h',
      type: 'input',
      value: 'h',
      rawPayload: expect.objectContaining({ mode: 'typeOnly', value: 'h' }),
    });
    expect(mounted.recorder?.currentSession?.events[1]).toMatchObject({
      hashId: 'input-replace',
      type: 'input',
      value: 'hello',
      rawPayload: expect.objectContaining({ mode: 'replace', value: 'hello' }),
    });
    expect(mounted.recorder?.currentSession?.events[2]).toMatchObject({
      hashId: 'click-after-input',
      type: 'click',
    });

    await mounted.cleanup();
  });

  it('marks failed preview descriptions as heuristic instead of leaving them pending', async () => {
    vi.mocked(describeStudioRecorderEventsWithAI).mockRejectedValueOnce(
      new Error('model unavailable'),
    );
    const event = {
      type: 'click',
      source: 'studio-preview',
      actionType: 'Click',
      elementRect: { x: 30, y: 40 },
      pageInfo: { width: 1200, height: 800 },
      screenshotAfter: 'data:image/png;base64,shot',
      timestamp: 456,
      hashId: 'click-fallback',
    };
    const { context } = createConnectedStudioContext({ events: [event] });
    const mounted = await mountRecorder(context);

    await act(async () => {
      await mounted.recorder?.startRecording();
    });
    await flushPromises();
    await flushPromises();

    expect(mounted.recorder?.currentSession?.events[0]).toMatchObject({
      hashId: 'click-fallback',
      semantic: {
        source: 'heuristic',
        status: 'ready',
        elementDescription: 'target element in the current visible UI',
        confidence: 'low',
      },
    });

    await mounted.cleanup();
  });

  it('drains final preview recorder events when recording stops', async () => {
    const finalEvent = {
      type: 'click',
      source: 'studio-preview',
      actionType: 'Click',
      semantic: {
        source: 'heuristic',
        status: 'ready',
        elementDescription: '(30, 40)',
      },
      elementRect: { x: 30, y: 40 },
      pageInfo: { width: 1200, height: 800 },
      timestamp: 456,
      hashId: 'click-final',
    };
    const { context, stopRecorderSession, getRecorderEvents } =
      createConnectedStudioContext();
    let stopped = false;
    stopRecorderSession.mockImplementation(async () => {
      stopped = true;
      return { ok: true };
    });
    getRecorderEvents.mockImplementation(async (since = 0) => ({
      events: stopped && since === 0 ? [finalEvent] : [],
      nextIndex: stopped ? 1 : since,
    }));
    const mounted = await mountRecorder(context);

    await act(async () => {
      await mounted.recorder?.startRecording();
    });
    await flushPromises();
    expect(mounted.recorder?.currentSession?.events).toHaveLength(0);

    await act(async () => {
      await mounted.recorder?.stopRecording();
    });
    await flushPromises();

    expect(stopRecorderSession).toHaveBeenCalledTimes(1);
    expect(getRecorderEvents).toHaveBeenLastCalledWith(0);
    expect(mounted.recorder?.currentSession?.status).toBe('completed');
    expect(mounted.recorder?.currentSession?.events).toHaveLength(1);
    expect(mounted.recorder?.currentSession?.events[0]).toMatchObject({
      hashId: 'click-final',
      type: 'click',
      platformId: 'computer',
    });

    await mounted.cleanup();
  });

  it('waits for final event descriptions before completing a stopped recording', async () => {
    const finalEvent = {
      type: 'click',
      source: 'studio-preview',
      actionType: 'Click',
      elementRect: { x: 30, y: 40 },
      pageInfo: { width: 1200, height: 800 },
      screenshotAfter: 'data:image/png;base64,shot',
      timestamp: 456,
      hashId: 'click-final-ai-describe',
    };
    const describedFinalEvent = {
      ...finalEvent,
      semantic: {
        source: 'aiDescribe',
        status: 'ready',
        confidence: 'high',
        elementDescription: 'Save button in the login dialog',
      },
    };
    const describeDeferred = createDeferred<{
      ok: boolean;
      event: typeof describedFinalEvent;
    }>();
    const describeRecorderEventAtPoint = vi.fn(() => describeDeferred.promise);
    const { context, stopRecorderSession, getRecorderEvents } =
      createConnectedStudioContext({ describeRecorderEventAtPoint });
    let stopped = false;
    stopRecorderSession.mockImplementation(async () => {
      stopped = true;
      return { ok: true };
    });
    getRecorderEvents.mockImplementation(async (since = 0) => ({
      events: stopped && since === 0 ? [finalEvent] : [],
      nextIndex: stopped ? 1 : since,
    }));
    const mounted = await mountRecorder(context);

    await act(async () => {
      await mounted.recorder?.startRecording();
    });
    await flushPromises();

    let stopSettled = false;
    let stopPromise!: Promise<void>;
    await act(async () => {
      stopPromise = mounted.recorder!.stopRecording();
      stopPromise.then(() => {
        stopSettled = true;
      });
      await Promise.resolve();
    });
    await flushPromises();

    expect(describeRecorderEventAtPoint).toHaveBeenCalledWith(
      expect.objectContaining({ hashId: 'click-final-ai-describe' }),
    );
    expect(stopSettled).toBe(false);
    expect(mounted.recorder?.currentSession?.status).toBe('recording');

    await act(async () => {
      describeDeferred.resolve({ ok: true, event: describedFinalEvent });
      await stopPromise;
    });
    await flushPromises();

    expect(stopSettled).toBe(true);
    expect(mounted.recorder?.currentSession?.status).toBe('completed');
    expect(mounted.recorder?.currentSession?.events[0]).toMatchObject({
      hashId: 'click-final-ai-describe',
      semantic: {
        source: 'aiDescribe',
        status: 'ready',
        elementDescription: 'Save button in the login dialog',
      },
    });

    await mounted.cleanup();
  });

  it('keeps the recorder runtime available while queued descriptions drain after stop', async () => {
    const events = [1, 2, 3].map((index) => ({
      type: 'click',
      source: 'studio-preview',
      actionType: 'Click',
      elementRect: { x: 30 + index, y: 40 + index },
      pageInfo: { width: 1200, height: 800 },
      screenshotAfter: 'data:image/png;base64,shot',
      timestamp: 456 + index,
      hashId: `queued-click-${index}`,
    }));
    const firstDeferred = createDeferred<any>();
    const secondDeferred = createDeferred<any>();
    const describeRecorderEventAtPoint = vi
      .fn()
      .mockReturnValueOnce(firstDeferred.promise)
      .mockReturnValueOnce(secondDeferred.promise)
      .mockImplementation(async (event) => ({
        ok: true,
        event: {
          ...event,
          semantic: {
            source: 'aiDescribe',
            status: 'ready',
            confidence: 'high',
            elementDescription: `described ${event.hashId}`,
          },
        },
      }));
    const { context } = createConnectedStudioContext({
      events,
      describeRecorderEventAtPoint,
    });
    const mounted = await mountRecorder(context);

    await act(async () => {
      await mounted.recorder?.startRecording();
    });
    await flushPromises();

    expect(describeRecorderEventAtPoint).toHaveBeenCalledTimes(2);

    let stopPromise!: Promise<void>;
    await act(async () => {
      stopPromise = mounted.recorder!.stopRecording();
      await Promise.resolve();
    });
    await flushPromises();

    expect(describeRecorderEventAtPoint).toHaveBeenCalledTimes(2);

    await act(async () => {
      firstDeferred.resolve({
        ok: true,
        event: {
          ...events[0],
          semantic: {
            source: 'aiDescribe',
            status: 'ready',
            confidence: 'high',
            elementDescription: 'described queued-click-1',
          },
        },
      });
      secondDeferred.resolve({
        ok: true,
        event: {
          ...events[1],
          semantic: {
            source: 'aiDescribe',
            status: 'ready',
            confidence: 'high',
            elementDescription: 'described queued-click-2',
          },
        },
      });
      await stopPromise;
    });
    await flushPromises();

    expect(describeRecorderEventAtPoint).toHaveBeenCalledTimes(3);
    expect(describeRecorderEventAtPoint).toHaveBeenLastCalledWith(
      expect.objectContaining({ hashId: 'queued-click-3' }),
    );
    expect(mounted.recorder?.currentSession?.events[2]).toMatchObject({
      hashId: 'queued-click-3',
      semantic: {
        source: 'aiDescribe',
        status: 'ready',
        elementDescription: 'described queued-click-3',
      },
    });

    await mounted.cleanup();
  });

  it('does not record SDK interact calls as recorder events', async () => {
    const { context, playgroundSDK, interact } = createConnectedStudioContext();
    const mounted = await mountRecorder(context);

    await act(async () => {
      await mounted.recorder?.startRecording();
    });
    await flushPromises();

    await act(async () => {
      await playgroundSDK.interact({ actionType: 'Tap', x: 10, y: 20 });
    });
    await flushPromises();

    expect(interact).toHaveBeenCalledWith({
      actionType: 'Tap',
      x: 10,
      y: 20,
    });
    expect(mounted.recorder?.currentSession?.events).toHaveLength(0);

    await mounted.cleanup();
  });

  it('renames the current recorder session', async () => {
    const { context } = createConnectedStudioContext();
    const mounted = await mountRecorder(context);

    await act(async () => {
      await mounted.recorder?.startRecording();
    });
    await flushPromises();

    const sessionId = mounted.recorder?.currentSession?.id;
    await act(async () => {
      await mounted.recorder?.renameSession(sessionId!, '  Checkout replay  ');
    });
    await flushPromises();

    expect(mounted.recorder?.currentSession?.name).toBe('Checkout replay');

    await mounted.cleanup();
  });

  it('stops recording when the current target has no preview recorder support', async () => {
    const { context } = createConnectedStudioContext({
      startResult: {
        ok: false,
        supported: false,
        source: 'unsupported',
        error: 'Preview recording is unavailable for computer.',
      },
    });
    const mounted = await mountRecorder(context);

    await act(async () => {
      await mounted.recorder?.startRecording();
    });
    await flushPromises();

    expect(mounted.recorder?.state.isRecording).toBe(false);
    expect(mounted.recorder?.state.error).toBe(
      'Preview recording is unavailable for computer.',
    );

    await mounted.cleanup();
  });

  it('generates and persists AI YAML for the current session', async () => {
    const event = {
      type: 'click',
      source: 'studio-preview',
      actionType: 'Click',
      semantic: {
        source: 'heuristic',
        status: 'ready',
        elementDescription: '(10, 20)',
      },
      elementRect: { x: 10, y: 20 },
      pageInfo: { width: 1200, height: 800 },
      timestamp: 123,
      hashId: 'click-1',
    };
    const { context } = createConnectedStudioContext({ events: [event] });
    const mounted = await mountRecorder(context);

    await act(async () => {
      await mounted.recorder?.startRecording();
    });
    await flushPromises();

    const sessionId = mounted.recorder?.currentSession?.id;
    const onChunk = vi.fn();
    const onProgress = vi.fn();
    let yaml = '';
    await act(async () => {
      yaml = await mounted.recorder!.generateSessionYaml(sessionId!, {
        onChunk,
        onProgress,
      });
    });
    await flushPromises();

    expect(generateStudioRecorderCodeWithAI).toHaveBeenCalledWith(
      expect.objectContaining({
        id: sessionId,
        events: [expect.objectContaining({ hashId: 'click-1' })],
      }),
      expect.objectContaining({ onChunk, type: 'yaml' }),
    );
    expect(onChunk).toHaveBeenCalledWith('partial yaml\n');
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        step: 'prepare',
        status: 'completed',
      }),
    );
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        step: 'metadata',
        status: 'loading',
      }),
    );
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        step: 'metadata',
        status: 'completed',
      }),
    );
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        step: 'code',
        status: 'loading',
      }),
    );
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        step: 'code',
        status: 'completed',
      }),
    );
    expect(yaml).toBe('ai yaml\n');
    expect(mounted.recorder?.currentSession?.generatedCode?.yaml).toBe(
      'ai yaml\n',
    );
    expect(mounted.recorder?.currentSession?.name).toBe(
      'Browsing Midscene.js Documentation',
    );
    expect(mounted.recorder?.currentSession?.description).toBe(
      'The user visited the Midscene.js introduction page.',
    );

    await mounted.cleanup();
  });

  it('generates Markdown by default for the current session', async () => {
    const event = {
      type: 'click',
      source: 'studio-preview',
      actionType: 'Click',
      semantic: {
        source: 'heuristic',
        status: 'ready',
        elementDescription: '(10, 20)',
      },
      elementRect: { x: 10, y: 20 },
      pageInfo: { width: 1200, height: 800 },
      timestamp: 123,
      hashId: 'click-1',
    };
    const { context } = createConnectedStudioContext({ events: [event] });
    const mounted = await mountRecorder(context);

    await act(async () => {
      await mounted.recorder?.startRecording();
    });
    await flushPromises();

    const sessionId = mounted.recorder?.currentSession?.id;
    let markdown = '';
    await act(async () => {
      markdown = await mounted.recorder!.generateSessionCode(sessionId!);
    });
    await flushPromises();

    expect(generateStudioRecorderCodeWithAI).toHaveBeenCalledWith(
      expect.objectContaining({
        id: sessionId,
      }),
      expect.objectContaining({ type: 'markdown' }),
    );
    expect(markdown).toBe('ai markdown\n');
    expect(mounted.recorder?.currentSession?.generatedCode?.markdown).toBe(
      'ai markdown\n',
    );

    await mounted.cleanup();
  });
});
