// @vitest-environment jsdom
import type { DeviceAction } from '@midscene/core';
import { act, createElement, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePlaygroundExecution } from '../src/hooks/usePlaygroundExecution';
import type { InfoListItem, PlaygroundSDKLike } from '../src/types';

const { allScriptsFromDumpMock } = vi.hoisted(() => ({
  allScriptsFromDumpMock: vi.fn(() => null),
}));

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
  allScriptsFromDump: allScriptsFromDumpMock,
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

function replayDump() {
  return {
    sdkVersion: 'test',
    groupName: 'Playground run',
    modelBriefs: [],
    executions: [
      {
        id: 'playground-execution',
        logTime: 1,
        name: 'Playground execution',
        tasks: [
          {
            type: 'Planning',
            uiContext: {
              screenshot: {
                type: 'midscene_screenshot_ref',
                id: 'shot-1',
                capturedAt: 1,
                mimeType: 'image/png',
                storage: 'inline',
              },
            },
          },
        ],
      },
    ],
  };
}

function reportWithReplay() {
  return `
    <script type="midscene-image" data-id="shot-1">data:image/png;base64,abc</script>
    <script type="midscene_web_dump">${JSON.stringify(replayDump())}</script>
  `;
}

describe('usePlaygroundExecution stop handling', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    allScriptsFromDumpMock.mockReset();
    allScriptsFromDumpMock.mockReturnValue(null);
  });

  it('restores replay scripts from a report-only stop result', async () => {
    allScriptsFromDumpMock.mockReturnValue({
      scripts: [{ type: 'img', duration: 0, img: 'data:image/png;base64,abc' }],
      width: 100,
      height: 200,
      modelBriefs: [],
    });
    const reportHTML = reportWithReplay();
    let snapshot: HarnessSnapshot | null = null;
    const getSnapshot = () => {
      if (!snapshot) throw new Error('Harness snapshot is not ready');
      return snapshot;
    };
    const playgroundSDK = {
      cancelExecution: vi.fn(async () => ({
        dump: null,
        reportHTML,
      })),
      executeAction: vi.fn(() => new Promise(() => undefined)),
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
    await act(async () => {
      await getSnapshot().handleStop();
    });

    const stoppedResult = getSnapshot().infoList.find((item) =>
      item.id.startsWith('stop-result-'),
    );
    expect(stoppedResult?.result?.reportHTML).toBe(reportHTML);
    expect(stoppedResult?.replayScriptsInfo?.scripts).toHaveLength(1);
    const restoredDump = allScriptsFromDumpMock.mock.calls[0]?.[0] as any;
    expect(
      restoredDump.executions[0].tasks[0].uiContext.screenshot.base64,
    ).toBe('data:image/png;base64,abc');

    await act(async () => root.unmount());
  });

  it('restores stopped replay from a compact report reference', async () => {
    allScriptsFromDumpMock.mockReturnValue({
      scripts: [{ type: 'img', duration: 0, img: 'report-image-url' }],
      width: 100,
      height: 200,
      modelBriefs: [],
    });
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => replayDump(),
    }));
    vi.stubGlobal('fetch', fetchMock);
    let snapshot: HarnessSnapshot | null = null;
    const getSnapshot = () => {
      if (!snapshot) throw new Error('Harness snapshot is not ready');
      return snapshot;
    };
    const report = {
      id: 'stopped-report',
      url: 'http://localhost/reports/stopped-report/',
      replayUrl: 'http://localhost/reports/stopped-report/replay',
      bytes: 1024,
      format: 'single-html' as const,
    };
    const playgroundSDK = {
      cancelExecution: vi.fn(async () => ({
        dump: null,
        reportHTML: null,
        report,
      })),
      executeAction: vi.fn(() => new Promise(() => undefined)),
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
    await act(async () => {
      await getSnapshot().handleStop();
    });

    const stoppedResult = getSnapshot().infoList.find((item) =>
      item.id.startsWith('stop-result-'),
    );
    expect(stoppedResult?.result?.report).toEqual(report);
    expect(stoppedResult?.replayScriptsInfo?.scripts).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(report.replayUrl);
    const restoredDump = allScriptsFromDumpMock.mock.calls[0]?.[0] as any;
    expect(
      restoredDump.executions[0].tasks[0].uiContext.screenshot.base64,
    ).toBe('http://localhost/reports/stopped-report/screenshots/shot-1.png');

    await act(async () => root.unmount());
  });

  it('restores replay scripts from a report-only completed result', async () => {
    allScriptsFromDumpMock.mockReturnValue({
      scripts: [{ type: 'img', duration: 0, img: 'data:image/png;base64,abc' }],
      width: 100,
      height: 200,
      modelBriefs: [],
    });
    const reportHTML = reportWithReplay();
    const fetchMock = vi.fn(async () =>
      Promise.resolve({
        ok: true,
        json: async () => replayDump(),
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    let snapshot: HarnessSnapshot | null = null;
    const playgroundSDK = {
      cancelExecution: vi.fn(),
      executeAction: vi.fn(async () => ({
        dump: null,
        reportHTML: null,
        report: {
          id: 'report-1',
          url: 'http://localhost/reports/report-1/',
          replayUrl: 'http://localhost/reports/report-1/replay',
          bytes: reportHTML.length,
          format: 'single-html',
        },
        result: 'done',
      })),
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
      await snapshot?.handleRun({ prompt: 'Replay', type: 'aiAct' });
    });

    const completedResult = snapshot?.infoList.find(
      (item) => item.type === 'result',
    );
    expect(completedResult?.result?.reportHTML).toBeNull();
    expect(completedResult?.replayScriptsInfo?.scripts).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost/reports/report-1/replay',
    );
    const restoredDump = allScriptsFromDumpMock.mock.calls[0]?.[0] as any;
    expect(
      restoredDump.executions[0].tasks[0].uiContext.screenshot.base64,
    ).toBe('http://localhost/reports/report-1/screenshots/shot-1.png');

    await act(async () => root.unmount());
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

  it('does not clear shared progress subscriptions while cancelling', async () => {
    let resolveRun: (value: null) => void = () => undefined;
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
          new Promise<null>((resolve) => {
            resolveRun = resolve;
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

    expect(playgroundSDK.onDumpUpdate).toHaveBeenCalledTimes(1);
    expect(playgroundSDK.onProgressUpdate).not.toHaveBeenCalled();

    let stopPromise: Promise<void> | undefined;
    await act(async () => {
      stopPromise = getSnapshot().handleStop();
    });

    expect(playgroundSDK.onDumpUpdate).toHaveBeenCalledTimes(1);
    expect(playgroundSDK.onProgressUpdate).not.toHaveBeenCalled();

    await act(async () => {
      resolveCancel(null);
      resolveRun(null);
      await stopPromise;
    });

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
