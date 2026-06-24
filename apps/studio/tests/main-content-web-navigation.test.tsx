// @vitest-environment jsdom
import type { PlaygroundControllerResult } from '@midscene/playground-app';
import type { StudioPlaygroundContextValue } from '@renderer/playground/types';
import { beforeAll, describe, expect, it, rs } from '@rstest/core';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import MainContent from '../src/renderer/components/MainContent';
import { StudioPlaygroundContext } from '../src/renderer/playground/useStudioPlayground';
import { StudioRecorderContext } from '../src/renderer/recorder/useStudioRecorder';

type ReadyStudioPlaygroundContextValue = Extract<
  StudioPlaygroundContextValue,
  { phase: 'ready' }
>;

rs.mock('@midscene/playground-app', () => ({
  PlaygroundPreview: () => null,
}));

beforeAll(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
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
          getInterfaceInfo: rs.fn(async () => {
            throw new Error('server restarting');
          }),
          interact: rs.fn(async () => ({ ok: true })),
        },
        sessionViewState: {
          connected: true,
          setupState: 'ready',
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
      computer: [],
      harmony: [],
      web: [],
    },
    refreshDiscoveredDevices: rs.fn(async () => undefined),
    restartPlayground: rs.fn(async () => undefined),
    setDiscoveryPollingPaused: rs.fn(),
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
            createElement(MainContent, {
              activeView: 'device',
            }),
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

  it('stops an active recorder before disconnecting the live session', async () => {
    const context = createConnectedWebContextValue();
    const stopDeferred = createDeferred<void>();
    const stopRecording = rs.fn(() => stopDeferred.promise);
    const destroySession = context.controller.actions
      .destroySession as ReturnType<typeof rs.fn>;
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
              value: {
                state: {
                  initialized: true,
                  initializing: false,
                  sessions: [],
                  currentSessionId: 'recording-1',
                  isRecording: true,
                  error: null,
                },
                currentSession: null,
                currentTarget: null,
                canStartRecording: true,
                startRecording: rs.fn(),
                stopRecording,
                deleteSession: rs.fn(),
                renameSession: rs.fn(),
                selectSession: rs.fn(),
                generateSessionYaml: rs.fn(),
                generateSessionCode: rs.fn(),
                exportAllZip: rs.fn(),
                exportSessionCode: rs.fn(),
                exportSessionJson: rs.fn(),
              } as any,
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
