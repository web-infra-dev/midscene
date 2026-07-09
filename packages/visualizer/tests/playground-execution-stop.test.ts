// @vitest-environment jsdom
import type { DeviceAction } from '@midscene/core';
import { act, createElement, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePlaygroundExecution } from '../src/hooks/usePlaygroundExecution';
import type { InfoListItem, PlaygroundSDKLike } from '../src/types';

vi.mock('@midscene/core/agent', () => ({
  paramStr: () => '',
  typeStr: () => 'Plan',
}));

vi.mock('../src/store/store', () => ({
  useEnvConfig: () => ({
    alwaysRefreshScreenInfo: false,
    autoDismissKeyboard: false,
    deepLocate: undefined,
    deepThink: 'unset',
    domIncluded: false,
    imeStrategy: undefined,
    keyboardDismissStrategy: undefined,
    screenshotIncluded: false,
  }),
}));

vi.mock('../src/utils/replay-scripts', () => ({
  allScriptsFromDump: () => null,
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

interface HarnessSnapshot {
  cancelCurrentExecution: ReturnType<
    typeof usePlaygroundExecution
  >['cancelCurrentExecution'];
  handleRun: ReturnType<typeof usePlaygroundExecution>['handleRun'];
  handleStop: ReturnType<typeof usePlaygroundExecution>['handleStop'];
  infoList: InfoListItem[];
  loading: boolean;
}

function Harness({
  onSnapshot,
  playgroundSDK,
}: {
  onSnapshot: (snapshot: HarnessSnapshot) => void;
  playgroundSDK: PlaygroundSDKLike;
}) {
  const [loading, setLoading] = useState(false);
  const [infoList, setInfoList] = useState<InfoListItem[]>([]);
  const [replayCounter, setReplayCounter] = useState(0);
  const currentRunningIdRef = useRef<number | null>(null);
  const interruptedFlagRef = useRef<Record<number, boolean>>({});
  const execution = usePlaygroundExecution({
    actionSpace: [] as DeviceAction<unknown>[],
    currentRunningIdRef,
    deviceType: 'web',
    interruptedFlagRef,
    loading,
    playgroundSDK,
    replayCounter,
    setInfoList,
    setLoading,
    setReplayCounter,
    storage: null,
    verticalMode: false,
  });

  useEffect(() => {
    onSnapshot({
      cancelCurrentExecution: execution.cancelCurrentExecution,
      handleRun: execution.handleRun,
      handleStop: execution.handleStop,
      infoList,
      loading,
    });
  }, [
    execution.handleRun,
    execution.handleStop,
    infoList,
    loading,
    onSnapshot,
  ]);

  return null;
}

describe('usePlaygroundExecution stop handling', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('does not render abort errors after the user stops execution', async () => {
    let rejectRun: (error: Error) => void = () => undefined;
    let resolveCancel: (value: null) => void = () => undefined;
    let snapshot: HarnessSnapshot | null = null;
    const getSnapshot = () => {
      if (!snapshot) {
        throw new Error('Harness snapshot is not ready');
      }
      return snapshot;
    };
    const playgroundSDK = {
      cancelExecution: vi.fn(
        () =>
          new Promise<null>((resolve) => {
            resolveCancel = resolve;
          }),
      ),
      executeAction: vi.fn(
        () =>
          new Promise((_resolve, reject) => {
            rejectRun = reject;
          }),
      ),
      onDumpUpdate: vi.fn(),
      onProgressUpdate: vi.fn(),
    } as unknown as PlaygroundSDKLike;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(Harness, {
          onSnapshot: (nextSnapshot) => {
            snapshot = nextSnapshot;
          },
          playgroundSDK,
        }),
      );
    });

    await act(async () => {
      void getSnapshot().handleRun({ prompt: 'Replay', type: 'aiAct' });
    });

    expect(getSnapshot().loading).toBe(true);

    let stopPromise: Promise<void> | undefined;
    await act(async () => {
      stopPromise = getSnapshot().handleStop();
    });

    expect(getSnapshot().loading).toBe(false);

    await act(async () => {
      rejectRun(new Error('Request was aborted'));
      await Promise.resolve();
    });

    await act(async () => {
      resolveCancel(null);
      await stopPromise;
    });

    const renderedText = getSnapshot()
      .infoList.map((item) => `${item.content} ${item.result?.error ?? ''}`)
      .join('\n');
    expect(renderedText).toContain('Operation stopped');
    expect(renderedText).not.toContain('Request was aborted');
    expect(
      getSnapshot().infoList.some(
        (item) => item.type === 'result' && item.result?.error,
      ),
    ).toBe(false);

    await act(async () => {
      root.unmount();
    });
  });

  it('silently cancels execution for clear or target changes', async () => {
    let rejectRun: (error: Error) => void = () => undefined;
    let resolveCancel: (value: null) => void = () => undefined;
    let snapshot: HarnessSnapshot | null = null;
    const getSnapshot = () => {
      if (!snapshot) {
        throw new Error('Harness snapshot is not ready');
      }
      return snapshot;
    };
    const playgroundSDK = {
      cancelExecution: vi.fn(
        () =>
          new Promise<null>((resolve) => {
            resolveCancel = resolve;
          }),
      ),
      executeAction: vi.fn(
        () =>
          new Promise((_resolve, reject) => {
            rejectRun = reject;
          }),
      ),
      onDumpUpdate: vi.fn(),
      onProgressUpdate: vi.fn(),
    } as unknown as PlaygroundSDKLike;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(Harness, {
          onSnapshot: (nextSnapshot) => {
            snapshot = nextSnapshot;
          },
          playgroundSDK,
        }),
      );
    });

    await act(async () => {
      void getSnapshot().handleRun({ prompt: 'Replay', type: 'aiAct' });
    });

    let cancelPromise: Promise<void> | undefined;
    await act(async () => {
      cancelPromise = getSnapshot().cancelCurrentExecution();
    });

    await act(async () => {
      rejectRun(new Error('Request was aborted'));
      resolveCancel(null);
      await cancelPromise;
    });

    const renderedText = getSnapshot()
      .infoList.map((item) => `${item.content} ${item.result?.error ?? ''}`)
      .join('\n');
    expect(renderedText).not.toContain('Request was aborted');
    expect(renderedText).not.toContain('Operation stopped');
    expect(
      getSnapshot().infoList.some(
        (item) => item.type === 'result' && item.result?.error,
      ),
    ).toBe(false);

    await act(async () => {
      root.unmount();
    });
  });
});
