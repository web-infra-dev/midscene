// @vitest-environment jsdom
import type { PlaygroundControllerResult } from '@midscene/playground-app';
import type { PlaygroundExecutionStatus } from '@midscene/visualizer';
import type { StudioPlaygroundContextValue } from '@renderer/playground/types';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import MainContent from '../src/renderer/components/MainContent';
import { StudioPlaygroundContext } from '../src/renderer/playground/useStudioPlayground';
import { StudioRecorderContext } from '../src/renderer/recorder/useStudioRecorder';

type ReadyStudioPlaygroundContextValue = Extract<
  StudioPlaygroundContextValue,
  { phase: 'ready' }
>;

(globalThis as { __APP_VERSION__?: string }).__APP_VERSION__ = 'test-version';

const studioModePanelMockState = vi.hoisted(() => ({
  executionStatus: null as PlaygroundExecutionStatus | null,
}));

vi.mock('@midscene/playground-app', () => ({
  PlaygroundPreview: () => null,
  PlaygroundConversationPanel: () => null,
}));

vi.mock('../src/renderer/components/StudioModePanel', async () => {
  const React = await import('react');

  return {
    default: (props: {
      onTimelineExecutionStatusChange?: (
        status: PlaygroundExecutionStatus,
      ) => void;
    }) => {
      React.useEffect(() => {
        if (studioModePanelMockState.executionStatus) {
          props.onTimelineExecutionStatusChange?.(
            studioModePanelMockState.executionStatus,
          );
        }
      }, [props]);
      return null;
    },
  };
});

beforeAll(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  studioModePanelMockState.executionStatus = null;
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
  return { promise, reject, resolve };
}

function createRecorderContextValue(overrides: Record<string, unknown> = {}) {
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
    startRecording: vi.fn(async () => null),
    stopRecording: vi.fn(async () => undefined),
    deleteSession: vi.fn(async () => undefined),
    renameSession: vi.fn(async () => undefined),
    selectSession: vi.fn(),
    generateSessionYaml: vi.fn(async () => ''),
    generateSessionCode: vi.fn(async () => ''),
    deleteSessionCode: vi.fn(async () => undefined),
    exportSessionJson: vi.fn(async () => undefined),
    exportSessionYaml: vi.fn(async () => undefined),
    exportSessionCode: vi.fn(async () => undefined),
    exportAllZip: vi.fn(async () => undefined),
    ...overrides,
  };
}

function createConnectedWebContextValue(): ReadyStudioPlaygroundContextValue {
  return {
    phase: 'ready',
    serverUrl: 'http://127.0.0.1:5800',
    controller: {
      state: {
        form: {
          getFieldsValue: () => ({}),
          setFieldsValue: () => undefined,
        },
        formValues: {
          platformId: 'web',
        },
        runtimeInfo: {
          platformId: 'web',
          title: 'Midscene Web Playground',
          interface: {
            type: 'puppeteer',
            description: 'https://todomvc.com/examples/react/dist/',
          },
          preview: {
            kind: 'mjpeg',
            mjpegPath: '/mjpeg',
            screenshotPath: '/screenshot',
            capabilities: [{ kind: 'mjpeg' }],
          },
          executionUxHints: [],
          metadata: {
            sessionDisplayName: 'https://todomvc.com/examples/react/dist/',
          },
        },
        sessionSetup: {
          fields: [],
          targets: [],
        },
        serverOnline: true,
        isUserOperating: false,
        sessionMutating: false,
        playgroundSDK: {
          getInterfaceInfo: vi.fn(async () => {
            throw new Error('server restarting');
          }),
          interact: vi.fn(async () => ({ ok: true })),
        },
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
    } as unknown as PlaygroundControllerResult,
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
}

describe('MainContent web navigation', () => {
  it('handles transient loading-state polling failures without throwing', async () => {
    const context = createConnectedWebContextValue();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    let renderError: unknown = null;
    await act(async () => {
      try {
        root.render(
          createElement(
            StudioPlaygroundContext.Provider,
            { value: context },
            createElement(
              StudioRecorderContext.Provider,
              { value: createRecorderContextValue() as any },
              createElement(MainContent, {
                activeView: 'device',
              }),
            ),
          ),
        );
      } catch (error) {
        renderError = error;
      }
    });
    await flushPromises();

    expect(renderError).toBeNull();
    expect(
      context.controller.state.playgroundSDK.getInterfaceInfo,
    ).toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('stops active timeline execution before reloading the web page', async () => {
    const context = createConnectedWebContextValue();
    const calls: string[] = [];
    const stopTimelineExecution = vi.fn(async () => {
      calls.push('stop');
    });
    const interact = vi.fn(async ({ actionType }: { actionType: string }) => {
      calls.push(`interact:${actionType}`);
      return { ok: true };
    });
    context.controller.state.playgroundSDK.interact = interact;
    studioModePanelMockState.executionStatus = {
      running: true,
      stoppable: true,
      stop: stopTimelineExecution,
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(
          StudioPlaygroundContext.Provider,
          { value: context },
          createElement(
            StudioRecorderContext.Provider,
            { value: createRecorderContextValue() as any },
            createElement(MainContent, {
              activeView: 'device',
            }),
          ),
        ),
      );
    });
    await flushPromises();

    const reloadButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Reload page"]',
    );
    expect(reloadButton).not.toBeNull();

    await act(async () => {
      reloadButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(stopTimelineExecution).toHaveBeenCalledTimes(1);
    expect(interact).toHaveBeenCalledWith({ actionType: 'Reload' });
    expect(calls).toEqual(['stop', 'interact:Reload']);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('stops an active recorder before disconnecting the live session', async () => {
    const context = createConnectedWebContextValue();
    const stopDeferred = createDeferred<void>();
    const stopRecording = vi.fn(() => stopDeferred.promise);
    const destroySession = context.controller.actions
      .destroySession as ReturnType<typeof vi.fn>;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(
          StudioPlaygroundContext.Provider,
          { value: context },
          createElement(
            StudioRecorderContext.Provider,
            {
              value: createRecorderContextValue({
                state: {
                  initialized: true,
                  initializing: false,
                  sessions: [],
                  currentSessionId: 'recording-1',
                  isRecording: true,
                  error: null,
                },
                canStartRecording: true,
                stopRecording,
              }) as any,
            },
            createElement(MainContent, {
              activeView: 'device',
            }),
          ),
        ),
      );
    });

    const disconnectButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Disconnect"]',
    );
    expect(disconnectButton).not.toBeNull();

    await act(async () => {
      disconnectButton?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
      await Promise.resolve();
    });

    expect(stopRecording).toHaveBeenCalledTimes(1);
    expect(destroySession).not.toHaveBeenCalled();

    await act(async () => {
      stopDeferred.resolve();
      await stopDeferred.promise;
      await Promise.resolve();
    });

    expect(destroySession).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
