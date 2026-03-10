import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlaygroundAgent } from '../../src/types';

vi.mock('../../src/common', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/common')>();
  return {
    ...actual,
    executeAction: vi.fn(),
  };
});

import * as common from '../../src/common';
import { PlaygroundServer } from '../../src/server';

type MockResponse = ReturnType<typeof createMockResponse>;
type RouteHandler = (
  req: Record<string, any>,
  res: MockResponse,
) => Promise<void>;

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function createGroupedDump(name: string): string {
  return JSON.stringify({
    sdkVersion: 'test',
    groupName: 'test-group',
    modelBriefs: [],
    executions: [
      {
        logTime: Date.now(),
        name,
        tasks: [],
      },
    ],
  });
}

function createMockAgent(label: string): PlaygroundAgent {
  return {
    interface: {
      interfaceType: 'mock',
      actionSpace: vi.fn(() => []),
      screenshotBase64: vi.fn().mockResolvedValue(`${label}-screenshot`),
      describe: vi.fn(() => `${label}-description`),
    },
    destroy: vi.fn().mockResolvedValue(undefined),
    dumpDataString: vi.fn(() => createGroupedDump(label)),
    reportHTMLString: vi.fn(() => `${label}-report`),
    writeOutActionDumps: vi.fn(),
    resetDump: vi.fn(),
  } as unknown as PlaygroundAgent;
}

function createMockResponse() {
  const res = {
    statusCode: 200,
    jsonBody: undefined as unknown,
    sentBody: undefined as unknown,
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn((body: unknown) => {
      res.jsonBody = body;
      return res;
    }),
    send: vi.fn((body: unknown) => {
      res.sentBody = body;
      return res;
    }),
    setHeader: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
  };

  return res;
}

function getPostHandler(server: PlaygroundServer, path: string): RouteHandler {
  const postMock = vi.mocked(server.app.post as any);
  const route = postMock.mock.calls.find(([routePath]) => routePath === path);

  if (!route) {
    throw new Error(`Route not found: ${path}`);
  }

  return route[1] as RouteHandler;
}

describe('PlaygroundServer cancel and recreate agent', () => {
  const launchedServers: PlaygroundServer[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(common.executeAction).mockReset();
  });

  afterEach(async () => {
    await Promise.all(
      launchedServers.splice(0).map((server) => server.close()),
    );
  });

  async function launchServer(
    agent:
      | PlaygroundAgent
      | (() => PlaygroundAgent)
      | (() => Promise<PlaygroundAgent>),
  ): Promise<PlaygroundServer> {
    const server = new PlaygroundServer(agent);
    launchedServers.push(server);
    await server.launch();
    return server;
  }

  it('keeps using the in-flight agent for dump/report cleanup after cancel', async () => {
    const activeAgent = createMockAgent('active');
    const recreatedAgent = createMockAgent('recreated');
    const agentFactory = vi
      .fn<() => Promise<PlaygroundAgent>>()
      .mockResolvedValueOnce(activeAgent)
      .mockResolvedValueOnce(recreatedAgent);

    const server = await launchServer(agentFactory);
    const executeHandler = getPostHandler(server, '/execute');
    const cancelHandler = getPostHandler(server, '/cancel/:requestId');
    const deferred = createDeferred<string>();

    vi.mocked(common.executeAction).mockReturnValueOnce(deferred.promise);

    const executeRes = createMockResponse();
    const executePromise = executeHandler(
      {
        body: {
          type: 'aiQuery',
          prompt: 'run',
          requestId: 'req-1',
        },
      },
      executeRes,
    );

    await Promise.resolve();

    const cancelRes = createMockResponse();
    await cancelHandler(
      {
        params: {
          requestId: 'req-1',
        },
      },
      cancelRes,
    );

    deferred.resolve('done');
    await executePromise;

    expect(cancelRes.jsonBody).toMatchObject({
      status: 'cancelled',
      canExecute: true,
      reportHTML: 'active-report',
    });
    expect(executeRes.sentBody).toMatchObject({
      result: 'done',
      reportHTML: 'active-report',
    });
    expect(activeAgent.writeOutActionDumps).toHaveBeenCalledTimes(1);
    expect(activeAgent.resetDump).toHaveBeenCalledTimes(1);
    expect(recreatedAgent.writeOutActionDumps).not.toHaveBeenCalled();
    expect(recreatedAgent.resetDump).not.toHaveBeenCalled();
  });

  it('marks instance-mode cancel as non-restartable and blocks later execute calls', async () => {
    const fixedAgent = createMockAgent('fixed');
    const server = await launchServer(fixedAgent);
    const executeHandler = getPostHandler(server, '/execute');
    const cancelHandler = getPostHandler(server, '/cancel/:requestId');
    const deferred = createDeferred<string>();

    vi.mocked(common.executeAction).mockReturnValueOnce(deferred.promise);

    const runningRes = createMockResponse();
    const runningPromise = executeHandler(
      {
        body: {
          type: 'aiQuery',
          prompt: 'run',
          requestId: 'req-fixed',
        },
      },
      runningRes,
    );

    await Promise.resolve();

    const cancelRes = createMockResponse();
    await cancelHandler(
      {
        params: {
          requestId: 'req-fixed',
        },
      },
      cancelRes,
    );

    deferred.resolve('stopped');
    await runningPromise;

    expect(cancelRes.jsonBody).toMatchObject({
      status: 'cancelled',
      canExecute: false,
    });
    expect((cancelRes.jsonBody as { message: string }).message).toContain(
      'fixed agent instance',
    );

    const rerunRes = createMockResponse();
    await executeHandler(
      {
        body: {
          type: 'aiQuery',
          prompt: 'rerun',
          requestId: 'req-rerun',
        },
      },
      rerunRes,
    );

    expect(rerunRes.statusCode).toBe(409);
    expect(rerunRes.jsonBody).toMatchObject({
      error: expect.stringContaining('fixed agent instance'),
    });
  });

  it('merges deviceOptions even when the interface had no options property', async () => {
    const agent = createMockAgent('device');
    (agent.interface as Record<string, unknown>).options = undefined;

    const server = await launchServer(agent);
    const executeHandler = getPostHandler(server, '/execute');

    vi.mocked(common.executeAction).mockResolvedValueOnce('done');

    const res = createMockResponse();
    await executeHandler(
      {
        body: {
          type: 'aiQuery',
          prompt: 'run',
          deviceOptions: {
            alwaysRefreshScreenInfo: true,
          },
        },
      },
      res,
    );

    expect(
      (agent.interface as { options?: Record<string, unknown> }).options,
    ).toEqual({
      alwaysRefreshScreenInfo: true,
    });
  });

  it('surfaces recreate failures during cancel and allows a later factory recovery', async () => {
    const activeAgent = createMockAgent('active');
    const recoveredAgent = createMockAgent('recovered');
    const agentFactory = vi
      .fn<() => Promise<PlaygroundAgent>>()
      .mockResolvedValueOnce(activeAgent)
      .mockRejectedValueOnce(new Error('factory failed'));

    const server = await launchServer(agentFactory);
    const executeHandler = getPostHandler(server, '/execute');
    const cancelHandler = getPostHandler(server, '/cancel/:requestId');
    const deferred = createDeferred<string>();

    vi.mocked(common.executeAction).mockReturnValueOnce(deferred.promise);

    const runningRes = createMockResponse();
    const runningPromise = executeHandler(
      {
        body: {
          type: 'aiQuery',
          prompt: 'run',
          requestId: 'req-factory-error',
        },
      },
      runningRes,
    );

    await Promise.resolve();

    const cancelRes = createMockResponse();
    await cancelHandler(
      {
        params: {
          requestId: 'req-factory-error',
        },
      },
      cancelRes,
    );

    deferred.resolve('stopped');
    await runningPromise;

    expect(cancelRes.statusCode).toBe(500);
    expect(cancelRes.jsonBody).toMatchObject({
      error: expect.stringContaining('failed to prepare the next agent'),
      reportHTML: 'active-report',
    });

    agentFactory.mockResolvedValueOnce(recoveredAgent);
    vi.mocked(common.executeAction).mockResolvedValueOnce('recovered-result');

    const retryRes = createMockResponse();
    await executeHandler(
      {
        body: {
          type: 'aiQuery',
          prompt: 'retry',
          requestId: 'req-after-recovery',
        },
      },
      retryRes,
    );

    expect(retryRes.sentBody).toMatchObject({
      result: 'recovered-result',
      reportHTML: 'recovered-report',
    });
  });
});
