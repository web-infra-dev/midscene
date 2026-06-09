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
        elementDescription: 'AI described target',
        descriptionLoading: false,
        descriptionSource: 'ai',
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
}: {
  startResult?: {
    ok: boolean;
    supported?: boolean;
    source?: string;
    error?: string;
  };
  events?: unknown[];
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
      computer: [],
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
  };
}

async function mountRecorder(context: StudioPlaygroundContextValue) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let recorder: StudioRecorderContextValue | null = null;

  await act(async () => {
    root.render(
      createElement(
        StudioPlaygroundContext.Provider,
        { value: context },
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
  });
  await flushPromises();

  return {
    get recorder() {
      return recorder;
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
      elementDescription: 'Introduction',
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
      elementDescription: 'Introduction',
    });

    await mounted.cleanup();
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
      elementDescription: 'AI described target',
      descriptionLoading: false,
      descriptionSource: 'ai',
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
      screenshotAfter: 'data:image/png;base64,he',
      timestamp: 124,
      hashId: 'input-e',
    };
    const click = {
      type: 'click',
      source: 'studio-preview',
      actionType: 'Click',
      elementDescription: 'Submit',
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
      elementDescription: 'Submit',
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

  it('marks failed preview descriptions as fallback instead of leaving them pending', async () => {
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
      elementDescription: 'target element in the current visible UI',
      descriptionLoading: false,
      descriptionSource: 'fallback',
      semanticConfidence: 'low',
    });

    await mounted.cleanup();
  });

  it('drains final preview recorder events when recording stops', async () => {
    const finalEvent = {
      type: 'click',
      source: 'studio-preview',
      actionType: 'Click',
      elementDescription: '(30, 40)',
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
      elementDescription: '(10, 20)',
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
      elementDescription: '(10, 20)',
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
