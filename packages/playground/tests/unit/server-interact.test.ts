import { createReadStream, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type ReportActionDump,
  describeElementAtPoint as coreDescribeElementAtPoint,
} from '@midscene/core';
import * as coreActual from '@midscene/core' with { rstest: 'importActual' };
import type { InputPrimitives } from '@midscene/core/device';
import { beforeEach, describe, expect, rs, test } from '@rstest/core';
import { PlaygroundServer } from '../../src/server';

rs.mock('@midscene/core', () => ({
  ...coreActual,
  describeElementAtPoint: rs.fn(),
}));

const VALID_PNG_BASE64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAKklEQVR4nO3MIQEAAAzDsPo3/ePhDi4CwpWxUMMXaaFH4QgLPQpHWHg6fOdROhs7ULsmAAAAAElFTkSuQmCC';
const RECORDER_FRAME_FIXTURES = [
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAE0lEQVR4nGP4z8DwnwGM/zMwAAAf7gP9NRsAMwAAAABJRU5ErkJggg==',
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAD0lEQVR4nGNg+M8AQhAKABvyA/1tVLjHAAAAAElFTkSuQmCC',
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAD0lEQVR4nGNgYPgPRmAKABf2A/1+6zfzAAAAAElFTkSuQmCC',
];

function createMockResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    send(payload: unknown) {
      this.body = payload;
      return this;
    },
    type() {
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
    sendFile(filePath: string, callback?: (error?: any) => void) {
      this.body = { filePath };
      callback?.();
      return this;
    },
  };
}

function latestRecorderEventsBody(body: any) {
  const events = Array.isArray(body?.events) ? body.events : [];
  const indexes = new Map<string, number>();
  const latest: unknown[] = [];
  for (const event of events) {
    const hashId = event?.hashId;
    if (typeof hashId !== 'string') {
      latest.push(event);
      continue;
    }
    const existingIndex = indexes.get(hashId);
    if (existingIndex === undefined) {
      indexes.set(hashId, latest.length);
      latest.push(event);
    } else {
      latest[existingIndex] = event;
    }
  }
  latest.sort((left: any, right: any) => {
    if (
      typeof left?.sequence === 'number' &&
      typeof right?.sequence === 'number'
    ) {
      const sequenceOrder = left.sequence - right.sequence;
      if (sequenceOrder !== 0) {
        return sequenceOrder;
      }
      return (
        Number(Boolean(left.parentEventId)) -
        Number(Boolean(right.parentEventId))
      );
    }
    return 0;
  });
  return {
    ...body,
    events: latest,
    nextIndex: latest.length,
  };
}

function getRouteHandler(
  server: PlaygroundServer,
  method: 'get' | 'post',
  route: string,
) {
  const calls = (server.app[method] as any).mock.calls as Array<[string, any]>;
  return calls.find(([registeredRoute]) => registeredRoute === route)?.[1];
}

async function describeRecorderEvent(server: PlaygroundServer, event: unknown) {
  const describeHandler = getRouteHandler(
    server,
    'post',
    '/recorder/describe-event',
  );
  const describeResponse = createMockResponse();
  await describeHandler({ body: { event } }, describeResponse);
  return describeResponse;
}

function makeInputPrimitiveStub(
  overrides: Partial<InputPrimitives> = {},
): InputPrimitives {
  return {
    pointer: {
      tap: rs.fn(async () => {}),
      doubleClick: rs.fn(async () => {}),
      longPress: rs.fn(async () => {}),
      dragAndDrop: rs.fn(async () => {}),
    },
    keyboard: {
      keyboardPress: rs.fn(async () => {}),
      typeText: rs.fn(async () => {}),
      clearInput: rs.fn(async () => {}),
    },
    touch: {
      swipe: rs.fn(async () => {}),
      pinch: rs.fn(async () => {}),
    },
    scroll: {
      scroll: rs.fn(async () => {}),
    },
    ...overrides,
  };
}

function mockDescribeElementAtPoint(
  implementation: (
    center: [number, number],
    opt?: { onProgress?: (progress: Record<string, unknown>) => void },
  ) => unknown,
) {
  const describeElementAtPoint = rs.fn(implementation);
  rs.mocked(coreDescribeElementAtPoint).mockImplementation(((
    _runtime: unknown,
    center: [number, number],
    opt?: { onProgress?: (progress: Record<string, unknown>) => void },
  ) => describeElementAtPoint(center, opt)) as any);
  return describeElementAtPoint;
}

describe('PlaygroundServer manual interaction APIs', () => {
  test('recorder stop does not wait for navigation completion', async () => {
    const server = new PlaygroundServer({ interface: {} } as any);
    (server as any)._recorderSessionId = 'session-navigation-pending';

    await server.launch(6130);
    const stopRecorderHandler = getRouteHandler(
      server,
      'post',
      '/recorder/stop',
    );
    const response = createMockResponse();

    await stopRecorderHandler({}, response);

    expect(response.body).toEqual({ ok: true });
    expect((server as any)._recorderSessionId).toBeNull();
  });

  test('records a session navigation event without polling for page idle', async () => {
    const server = new PlaygroundServer({ interface: {} } as any);
    (server as any)._recorderSessionId = 'session-navigation-event';
    (server as any)._studioPreviewRecorderLastPageState = {
      pageInfo: { width: 1280, height: 720 },
      url: 'https://example.com/start',
      title: 'Start page',
    };
    (server as any)._recorderEvents = [
      {
        source: 'studio-preview',
        type: 'click',
        actionType: 'Tap',
        hashId: 'tap-search-result',
      },
    ];

    (server as any).recordStudioPreviewNavigationState({
      url: 'https://example.com/next',
    });
    await server.waitForRecorderIdle();
    (server as any).recordStudioPreviewNavigationState({
      url: 'https://example.com/final',
    });
    await server.waitForRecorderIdle();

    expect(
      latestRecorderEventsBody({ events: (server as any)._recorderEvents })
        .events,
    ).toEqual([
      expect.objectContaining({ type: 'click' }),
      expect.objectContaining({
        type: 'navigation',
        actionType: 'Navigate',
        url: 'https://example.com/final',
        rawPayload: expect.objectContaining({
          implicitNavigationState: true,
          navigationSource: 'session-event',
        }),
      }),
    ]);
  });

  beforeEach(() => {
    rs.mocked(coreDescribeElementAtPoint).mockReset();
    rs.mocked(coreDescribeElementAtPoint).mockRejectedValue(
      new Error('Active agent does not support describeElementAtPoint.'),
    );
  });

  test('POST /execute reads the persisted report after replay execution', async () => {
    const dump = {
      sdkVersion: 'test',
      groupName: 'Midscene Report',
      modelBriefs: [],
      executions: [
        { id: 'stale-preview', logTime: 100, name: 'Locate - final login' },
      ],
    };
    const appendExecution = (execution: {
      id: string;
      logTime: number;
      name: string;
    }) => {
      dump.executions.push({ ...execution, tasks: [] } as any);
    };
    const agent = {
      interface: {
        actionSpace: () => [{ name: 'aiAct', description: 'act' }],
      },
      resetDump: rs.fn(() => {
        dump.executions = [];
      }),
      callActionInActionSpace: rs.fn(async () => {
        appendExecution({ id: 'login', logTime: 300, name: 'Act - login' });
        return { ok: true };
      }),
      dumpDataString: rs.fn(() => JSON.stringify(dump)),
      reportHTMLString: rs.fn(() => '<html></html>'),
      writeOutActionDumps: rs.fn(),
      reportFile: `${process.cwd()}/package.json`,
    };
    const server = new PlaygroundServer(agent as any);
    server.setPreparedPlatform({
      platformId: 'web',
      title: 'Web',
      description: 'Web',
      preview: { kind: 'none' },
      executionHooks: {
        beforeExecute: async () => {
          appendExecution({
            id: 'logout',
            logTime: 200,
            name: 'Act - logout',
          });
        },
      },
    });

    await server.launch(6110);
    const executeHandler = getRouteHandler(server, 'post', '/execute');
    expect(executeHandler).toBeTypeOf('function');

    const response = createMockResponse();
    await executeHandler(
      {
        body: {
          type: 'aiAct',
          prompt: 'replay markdown',
          requestId: 'replay-1',
        },
      },
      response,
    );

    expect(response.statusCode).toBe(200);
    const body = response.body as {
      dump: ReportActionDump | null;
      reportHTML: string | null;
      report: {
        id: string;
        url: string;
        replayUrl: string;
        bytes: number;
        format: string;
      };
    };
    expect(agent.resetDump).toHaveBeenCalledBefore(
      agent.callActionInActionSpace,
    );
    expect(body.dump).toBeNull();
    expect(body.reportHTML).toBeNull();
    expect(body.report).toMatchObject({
      id: expect.any(String),
      url: expect.stringMatching(/^\/reports\/.*\/$/),
      replayUrl: expect.stringMatching(/^\/reports\/.*\/replay$/),
      bytes: expect.any(Number),
      format: 'single-html',
    });
    expect(agent.dumpDataString).not.toHaveBeenCalled();
    expect(agent.reportHTMLString).not.toHaveBeenCalled();

    const reportHandler = getRouteHandler(server, 'get', '/reports/:reportId/');
    const reportResponse = createMockResponse();
    reportHandler({ params: { reportId: body.report.id } }, reportResponse);
    expect(reportResponse.body).toEqual({
      filePath: `${process.cwd()}/package.json`,
    });
    expect(reportResponse.headers['Cache-Control']).toBe('no-store');
  });

  test('POST /cancel aborts the running execute action', async () => {
    const dump = {
      sdkVersion: 'test',
      groupName: 'Midscene Report',
      modelBriefs: [],
      executions: [],
    };
    let capturedSignal: AbortSignal | undefined;
    let resolveExecuteStarted: (() => void) | undefined;
    const executeStarted = new Promise<void>((resolve) => {
      resolveExecuteStarted = resolve;
    });
    const agent = {
      reportFile: `${process.cwd()}/package.json`,
      interface: {
        actionSpace: () => [],
      },
      resetDump: rs.fn(),
      aiAct: rs.fn(async (_prompt: string, options: any) => {
        capturedSignal = options.abortSignal;
        (agent as any).onDumpUpdate?.('', {
          id: 'partial-execution',
          tasks: [],
        });
        resolveExecuteStarted?.();

        return await new Promise((resolve) => {
          capturedSignal?.addEventListener(
            'abort',
            () => {
              resolve('aborted');
            },
            { once: true },
          );
        });
      }),
      dumpDataString: rs.fn(() => JSON.stringify(dump)),
      reportHTMLString: rs.fn(() => '<html></html>'),
      writeOutActionDumps: rs.fn(),
    };
    const server = new PlaygroundServer(agent as any);

    try {
      await server.launch(6140);
      rs.spyOn(server as any, 'recreateAgent').mockResolvedValue(undefined);
      const executeHandler = getRouteHandler(server, 'post', '/execute');
      const cancelHandler = getRouteHandler(
        server,
        'post',
        '/cancel/:requestId',
      );
      expect(executeHandler).toBeTypeOf('function');
      expect(cancelHandler).toBeTypeOf('function');

      const executeResponse = createMockResponse();
      const executePromise = executeHandler(
        {
          body: {
            type: 'aiAct',
            prompt: 'keep running until cancelled',
            requestId: 'abort-request-1',
          },
        },
        executeResponse,
      );

      await executeStarted;
      expect(capturedSignal).toBeDefined();
      expect(capturedSignal?.aborted).toBe(false);

      const cancelResponse = createMockResponse();
      await cancelHandler(
        { params: { requestId: 'abort-request-1' } },
        cancelResponse,
      );

      expect(cancelResponse.statusCode).toBe(200);
      expect((cancelResponse.body as { status: string }).status).toBe(
        'cancelled',
      );
      expect(cancelResponse.body).toMatchObject({
        dump: null,
        reportHTML: null,
        report: {
          id: expect.any(String),
          url: expect.stringMatching(/^\/reports\//),
          replayUrl: expect.stringMatching(/^\/reports\/.*\/replay$/),
          bytes: expect.any(Number),
          format: 'single-html',
        },
      });
      expect(capturedSignal?.aborted).toBe(true);
      expect(agent.writeOutActionDumps).toHaveBeenCalledWith({
        id: 'partial-execution',
        tasks: [],
      });

      await executePromise;
      expect(executeResponse.statusCode).toBe(200);
      expect((executeResponse.body as { result: unknown }).result).toBe(
        'aborted',
      );
      expect(agent.dumpDataString).not.toHaveBeenCalled();
      expect(agent.reportHTMLString).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  test('report replay and screenshot routes stream compact persisted data', async () => {
    const dump = {
      sdkVersion: 'test',
      groupName: 'Playground run',
      modelBriefs: [],
      executions: [
        {
          id: 'execution-1',
          logTime: 1,
          name: 'Execution',
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
    const reportHTML = `<html></html>\n<script type="midscene-image" data-id="shot-1">${VALID_PNG_BASE64}</script>\n<script type="midscene_web_dump">${JSON.stringify(dump)}</script>`;
    rs.mocked(createReadStream).mockImplementation(
      () =>
        ({
          async *[Symbol.asyncIterator]() {
            for (let index = 0; index < reportHTML.length; index += 17) {
              yield reportHTML.slice(index, index + 17);
            }
          },
        }) as any,
    );
    const agent = {
      interface: {
        actionSpace: () => [{ name: 'aiAct', description: 'act' }],
      },
      resetDump: rs.fn(),
      callActionInActionSpace: rs.fn(async () => ({ ok: true })),
      reportFile: `${process.cwd()}/package.json`,
    };
    const server = new PlaygroundServer(agent as any);

    try {
      await server.launch(6111);
      const executeHandler = getRouteHandler(server, 'post', '/execute');
      const executeResponse = createMockResponse();
      await executeHandler(
        {
          body: {
            type: 'aiAct',
            prompt: 'replay',
            requestId: 'compact-replay-1',
          },
        },
        executeResponse,
      );
      const report = (executeResponse.body as any).report;

      const replayHandler = getRouteHandler(
        server,
        'get',
        '/reports/:reportId/replay',
      );
      const replayResponse = createMockResponse();
      await replayHandler({ params: { reportId: report.id } }, replayResponse);
      expect(JSON.parse(replayResponse.body as string)).toEqual(dump);

      const screenshotHandler = getRouteHandler(
        server,
        'get',
        '/reports/:reportId/screenshots/:assetName',
      );
      const screenshotResponse = createMockResponse();
      await screenshotHandler(
        {
          params: { reportId: report.id, assetName: 'shot-1.png' },
        },
        screenshotResponse,
      );
      expect(Buffer.isBuffer(screenshotResponse.body)).toBe(true);
      expect((screenshotResponse.body as Buffer).length).toBeGreaterThan(0);
    } finally {
      await server.close();
    }
  });

  test('external report assets remain available under the report URL', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'midscene-report-assets-'));
    const screenshotsDir = join(tempDir, 'screenshots');
    const reportPath = join(tempDir, 'index.html');
    const screenshotPath = join(screenshotsDir, 'shot-1.png');
    await mkdir(screenshotsDir);
    await Promise.all([
      writeFile(reportPath, '<html></html>'),
      writeFile(screenshotPath, Buffer.from('png')),
    ]);
    const agent = {
      interface: {
        actionSpace: () => [{ name: 'aiAct', description: 'act' }],
      },
      resetDump: rs.fn(),
      callActionInActionSpace: rs.fn(async () => ({ ok: true })),
      reportFile: reportPath,
    };
    const server = new PlaygroundServer(agent as any);

    try {
      await server.launch(6112);
      const executeHandler = getRouteHandler(server, 'post', '/execute');
      const executeResponse = createMockResponse();
      await executeHandler(
        {
          body: {
            type: 'aiAct',
            prompt: 'external report',
            requestId: 'external-report-1',
          },
        },
        executeResponse,
      );
      const report = (executeResponse.body as any).report;
      expect(report.format).toBe('html-and-external-assets');

      const screenshotHandler = getRouteHandler(
        server,
        'get',
        '/reports/:reportId/screenshots/:assetName',
      );
      const screenshotResponse = createMockResponse();
      await screenshotHandler(
        {
          params: { reportId: report.id, assetName: 'shot-1.png' },
        },
        screenshotResponse,
      );
      expect(screenshotResponse.body).toEqual({ filePath: screenshotPath });
    } finally {
      await server.close();
      await rm(tempDir, { force: true, recursive: true });
    }
  });

  test('POST /interact routes pointer events to input primitives', async () => {
    const inputPrimitives = makeInputPrimitiveStub();
    const actionCall = rs.fn();
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'android',
        describe: () => 'Android device',
        actionSpace: () => [
          { name: 'Tap', description: 'tap', call: actionCall },
        ],
        inputPrimitives,
        screenshotBase64: async () => VALID_PNG_BASE64,
        size: async () => ({ width: 1080, height: 1920 }),
      },
    } as any);

    await server.launch(6110);
    const interactHandler = getRouteHandler(server, 'post', '/interact');
    expect(interactHandler).toBeTypeOf('function');

    const response = createMockResponse();
    await interactHandler(
      { body: { actionType: 'Tap', x: 10, y: 20 } },
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({});
    expect(inputPrimitives.pointer?.tap).toHaveBeenCalledWith(
      { x: 10, y: 20 },
      { duration: undefined },
    );
    expect(actionCall).not.toHaveBeenCalled();
  });

  test('POST /interact can run pointer actions without touch primitives', async () => {
    const inputPrimitives = makeInputPrimitiveStub({
      touch: undefined,
    });
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'computer',
        actionSpace: () => [],
        inputPrimitives,
      },
    } as any);

    await server.launch(6110);
    const interactHandler = getRouteHandler(server, 'post', '/interact');
    const response = createMockResponse();
    await interactHandler(
      { body: { actionType: 'Tap', x: 10, y: 20 } },
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(inputPrimitives.pointer?.tap).toHaveBeenCalledWith(
      { x: 10, y: 20 },
      { duration: undefined },
    );
  });

  test('POST /interact delegates replace input clearing to typeText', async () => {
    const inputPrimitives = makeInputPrimitiveStub();
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'android',
        actionSpace: () => [],
        inputPrimitives,
      },
    } as any);

    await server.launch(6110);
    const interactHandler = getRouteHandler(server, 'post', '/interact');
    const response = createMockResponse();
    await interactHandler(
      {
        body: {
          actionType: 'Input',
          x: 10,
          y: 20,
          value: 'hello',
          mode: 'replace',
        },
      },
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(inputPrimitives.keyboard?.clearInput).not.toHaveBeenCalled();
    expect(inputPrimitives.keyboard?.typeText).toHaveBeenCalledWith(
      'hello',
      expect.objectContaining({
        replace: true,
        target: expect.objectContaining({
          center: [10, 20],
        }),
      }),
    );
  });

  test('POST /interact forwards Swipe with start, end, and options', async () => {
    const inputPrimitives = makeInputPrimitiveStub();
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'android',
        actionSpace: () => [],
        inputPrimitives,
      },
    } as any);

    await server.launch(6111);
    const interactHandler = getRouteHandler(server, 'post', '/interact');
    const response = createMockResponse();
    await interactHandler(
      {
        body: {
          actionType: 'Swipe',
          x: 10,
          y: 20,
          endX: 110,
          endY: 220,
          duration: 500,
          repeat: 2,
        },
      },
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(inputPrimitives.touch?.swipe).toHaveBeenCalledWith(
      { x: 10, y: 20 },
      { x: 110, y: 220 },
      { duration: 500, repeat: 2 },
    );
  });

  test('POST /interact forwards Scroll to input primitives', async () => {
    const inputPrimitives = makeInputPrimitiveStub();
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'computer',
        actionSpace: () => [],
        inputPrimitives,
      },
    } as any);

    await server.launch(6111);
    const interactHandler = getRouteHandler(server, 'post', '/interact');
    const response = createMockResponse();
    await interactHandler(
      {
        body: {
          actionType: 'Scroll',
          x: 10,
          y: 20,
          direction: 'down',
          scrollType: 'singleAction',
          distance: 120,
        },
      },
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(inputPrimitives.scroll?.scroll).toHaveBeenCalledWith({
      direction: 'down',
      scrollType: 'singleAction',
      distance: 120,
      locate: expect.objectContaining({
        center: [10, 20],
        description: 'manual scroll target',
      }),
    });
  });

  test('POST /interact returns 400 when a required pointer field is missing', async () => {
    const inputPrimitives = makeInputPrimitiveStub();
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'android',
        actionSpace: () => [],
        inputPrimitives,
      },
    } as any);

    await server.launch(6112);
    const interactHandler = getRouteHandler(server, 'post', '/interact');
    const response = createMockResponse();
    await interactHandler({ body: { actionType: 'Tap', y: 20 } }, response);

    expect(response.statusCode).toBe(400);
    expect((response.body as { error: string }).error).toBe(
      'x must be a number',
    );
    expect(inputPrimitives.pointer?.tap).not.toHaveBeenCalled();
  });

  test('POST /interact invokes the selected action with manual params', async () => {
    const tapCall = rs.fn();
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'android',
        describe: () => 'Android device',
        actionSpace: () => [{ name: 'Tap', description: 'tap', call: tapCall }],
        screenshotBase64: async () => VALID_PNG_BASE64,
        size: async () => ({ width: 1080, height: 1920 }),
      },
    } as any);

    await server.launch(6110);
    const interactHandler = getRouteHandler(server, 'post', '/interact');
    expect(interactHandler).toBeTypeOf('function');

    const response = createMockResponse();
    await interactHandler(
      { body: { actionType: 'Tap', x: 10, y: 20 } },
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({});
    expect(tapCall).toHaveBeenCalledWith(
      {
        locate: expect.objectContaining({
          center: [10, 20],
          description: 'manual Tap',
        }),
      },
      {
        task: expect.objectContaining({
          type: 'Action Space',
          subType: 'Tap',
        }),
      },
    );
  });

  test('recorder start is unsupported without preview interaction support', async () => {
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'computer',
        actionSpace: () => [],
      },
    } as any);

    await server.launch(6116);
    const capabilitiesHandler = getRouteHandler(
      server,
      'get',
      '/recorder/capabilities',
    );
    const startRecorderHandler = getRouteHandler(
      server,
      'post',
      '/recorder/start',
    );

    const capabilitiesResponse = createMockResponse();
    await capabilitiesHandler({}, capabilitiesResponse);
    expect(capabilitiesResponse.body).toMatchObject({
      supported: false,
      source: 'unsupported',
      platformId: 'computer',
    });

    const startResponse = createMockResponse();
    await startRecorderHandler(
      {
        body: {
          sessionId: 'session-1',
        },
      },
      startResponse,
    );
    expect(startResponse.body).toMatchObject({
      ok: false,
      supported: false,
      source: 'unsupported',
      platformId: 'computer',
    });
  });

  test('recorder records successful Studio preview interactions', async () => {
    const inputPrimitives = makeInputPrimitiveStub();
    const describeElementAtPoint = mockDescribeElementAtPoint(async () => ({
      prompt: 'login button',
      deepLocate: false,
      verifyResult: {
        pass: true,
        rect: { left: 0, top: 0, width: 20, height: 20 },
        center: [10, 20] as [number, number],
        centerDistance: 0,
      },
    }));
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'ios',
        actionSpace: () => [],
        inputPrimitives,
        screenshotBase64: async () => VALID_PNG_BASE64,
        size: async () => ({ width: 390, height: 844 }),
      },
    } as any);

    await server.launch(6118);
    const startRecorderHandler = getRouteHandler(
      server,
      'post',
      '/recorder/start',
    );
    const startResponse = createMockResponse();
    await startRecorderHandler(
      { body: { sessionId: 'session-preview' } },
      startResponse,
    );
    expect(startResponse.body).toMatchObject({
      ok: true,
      supported: true,
      source: 'studio-preview',
    });

    const interactHandler = getRouteHandler(server, 'post', '/interact');
    await interactHandler(
      { body: { actionType: 'Tap', x: 10, y: 20 } },
      createMockResponse(),
    );
    await server.waitForRecorderIdle();

    const eventsHandler = getRouteHandler(server, 'get', '/recorder/events');
    const eventsResponse = createMockResponse();
    await eventsHandler({ query: { since: '0' } }, eventsResponse);
    expect(eventsResponse.body).toMatchObject({
      events: [
        {
          type: 'click',
          semantic: {
            source: 'aiDescribe',
            status: 'pending',
          },
        },
      ],
      nextIndex: 1,
    });
    const rawEvents = (eventsResponse.body as any).events;
    expect(rawEvents).toHaveLength(1);
    expect(rawEvents[0]).toMatchObject({
      screenshotAsset: {
        id: expect.stringMatching(/^session-preview-/),
        mimeType: 'image/png',
        bytes: expect.any(Number),
      },
    });
    expect(rawEvents[0].screenshotBefore).toBeUndefined();
    expect(rawEvents[0].screenshotAfter).toBeUndefined();
    expect(rawEvents[0].screenshotWithBox).toBeUndefined();

    const assetHandler = getRouteHandler(
      server,
      'get',
      '/recorder/assets/:assetId',
    );
    const assetResponse = createMockResponse();
    await assetHandler(
      { params: { assetId: rawEvents[0].screenshotAsset.id } },
      assetResponse,
    );
    expect(assetResponse.statusCode).toBe(200);

    const describeResponse = await describeRecorderEvent(server, rawEvents[0]);
    expect(describeResponse.body).toMatchObject({
      ok: true,
      trace: {
        eventHashId: rawEvents[0].hashId,
        eventType: 'click',
        actionType: 'Tap',
        eventSummary: {
          hashId: rawEvents[0].hashId,
          type: 'click',
          source: 'studio-preview',
          actionType: 'Tap',
          rawPayloadSummary: {
            actionType: 'Tap',
            x: 10,
            y: 20,
          },
          elementRect: { x: 10, y: 20 },
          pageInfo: { width: 390, height: 844 },
        },
        status: 'ready',
        point: [10, 20],
        pageInfo: { width: 390, height: 844 },
        screenshotBytes: expect.any(Number),
        durationMs: expect.any(Number),
        modelCallDurationMs: expect.any(Number),
        elementDescription: 'login button',
        verifyPrompt: false,
      },
      event: {
        type: 'click',
        source: 'studio-preview',
        actionType: 'Tap',
        elementRect: { x: 10, y: 20 },
        pageInfo: { width: 390, height: 844 },
        semantic: {
          source: 'aiDescribe',
          status: 'ready',
          elementDescription: 'login button',
          replayInstruction: 'Tap on the element described as "login button".',
          actionSummary: 'Tap login button',
          confidence: 'medium',
          aiDescribe: {
            verifyPrompt: false,
            deepLocate: false,
            expectedCenter: [10, 20],
          },
        },
      },
    });
    expect(describeElementAtPoint).toHaveBeenCalledWith(
      [10, 20],
      expect.objectContaining({
        verifyPrompt: false,
        screenshotBase64: expect.stringMatching(/^data:image\/png;base64,/),
        coordinateSpace: 'logical',
        logicalSize: { width: 390, height: 844 },
        onProgress: expect.any(Function),
      }),
    );
  });

  test('recorder publishes an event envelope before its screenshot patch is ready', async () => {
    const inputPrimitives = makeInputPrimitiveStub();
    let resolveAfterScreenshot: ((value: string) => void) | undefined;
    const afterScreenshot = new Promise<string>((resolve) => {
      resolveAfterScreenshot = resolve;
    });
    let screenshotCalls = 0;
    const screenshotBase64 = vi.fn(async () => {
      screenshotCalls += 1;
      if (screenshotCalls === 3) {
        return afterScreenshot;
      }
      return VALID_PNG_BASE64;
    });
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'ios',
        actionSpace: () => [],
        inputPrimitives,
        screenshotBase64,
        size: async () => ({ width: 390, height: 844 }),
      },
    } as any);

    await server.launch(6137);
    const startRecorderHandler = getRouteHandler(
      server,
      'post',
      '/recorder/start',
    );
    await startRecorderHandler(
      { body: { sessionId: 'session-preview-envelope' } },
      createMockResponse(),
    );

    const interactHandler = getRouteHandler(server, 'post', '/interact');
    await interactHandler(
      { body: { actionType: 'Tap', x: 10, y: 20 } },
      createMockResponse(),
    );

    const eventsHandler = getRouteHandler(server, 'get', '/recorder/events');
    const envelopeResponse = createMockResponse();
    await eventsHandler({ query: { since: '0' } }, envelopeResponse);
    expect(envelopeResponse.body).toMatchObject({
      nextIndex: 1,
      events: [
        {
          type: 'click',
          eventId: expect.any(String),
          sequence: 1,
          logSequence: 1,
          interactionStartedAt: expect.any(Number),
          interactionCompletedAt: expect.any(Number),
          captureStatus: 'pending',
          revisions: { capture: 0, semantic: 0 },
          frame: {
            token: expect.stringMatching(/^screenshot-/),
            capturedAt: expect.any(Number),
            source: 'screenshot-fallback',
            offsetMs: expect.any(Number),
          },
        },
      ],
    });
    const envelope = (envelopeResponse.body as any).events[0];
    expect(envelope.screenshotAsset).toBeUndefined();

    resolveAfterScreenshot?.(VALID_PNG_BASE64);
    await server.waitForRecorderIdle();

    const patchResponse = createMockResponse();
    await eventsHandler({ query: { since: '1' } }, patchResponse);
    expect(patchResponse.body).toMatchObject({
      nextIndex: 2,
      events: [
        {
          hashId: envelope.hashId,
          eventId: envelope.eventId,
          sequence: 1,
          logSequence: 2,
          captureStatus: 'ready',
          revisions: { capture: 1, semantic: 0 },
          screenshotAsset: {
            mimeType: 'image/png',
            bytes: expect.any(Number),
          },
        },
      ],
    });
  });

  test('recorder reserves action sequence at interaction start when requests finish out of order', async () => {
    let releaseFirstTap: (() => void) | undefined;
    const firstTapGate = new Promise<void>((resolve) => {
      releaseFirstTap = resolve;
    });
    let tapCount = 0;
    const tap = vi.fn(async () => {
      tapCount += 1;
      if (tapCount === 1) {
        await firstTapGate;
      }
    });
    const inputPrimitives = makeInputPrimitiveStub({
      pointer: {
        tap,
        doubleClick: vi.fn(async () => {}),
        longPress: vi.fn(async () => {}),
        dragAndDrop: vi.fn(async () => {}),
      },
    });
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'web',
        actionSpace: () => [],
        inputPrimitives,
        screenshotBase64: async () => VALID_PNG_BASE64,
        size: async () => ({ width: 1280, height: 720 }),
      },
    } as any);

    await server.launch(6140);
    const startRecorderHandler = getRouteHandler(
      server,
      'post',
      '/recorder/start',
    );
    await startRecorderHandler(
      { body: { sessionId: 'session-preview-sequence-reservation' } },
      createMockResponse(),
    );
    const interactHandler = getRouteHandler(server, 'post', '/interact');
    const firstInteraction = interactHandler(
      { body: { actionType: 'Tap', x: 10, y: 20 } },
      createMockResponse(),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    await interactHandler(
      { body: { actionType: 'Tap', x: 30, y: 40 } },
      createMockResponse(),
    );
    releaseFirstTap?.();
    await firstInteraction;
    await server.waitForRecorderIdle();

    const eventsHandler = getRouteHandler(server, 'get', '/recorder/events');
    const response = createMockResponse();
    await eventsHandler({ query: { since: '0' } }, response);
    const events = latestRecorderEventsBody(response.body).events as any[];
    expect(
      events.map((event) => [event.elementRect.x, event.sequence]),
    ).toEqual([
      [10, 1],
      [30, 2],
    ]);
  });

  test('recorder keeps burst events bound to their interaction-boundary frames', async () => {
    vi.mocked(writeFileSync).mockClear();
    let emitFrame:
      | ((frame: { data: string; contentType: string }) => void)
      | undefined;
    let tapIndex = 0;
    const tap = vi.fn(async () => {
      const afterFrame =
        RECORDER_FRAME_FIXTURES[
          Math.min(++tapIndex, RECORDER_FRAME_FIXTURES.length - 1)
        ];
      setTimeout(() => {
        emitFrame?.({
          data: afterFrame.split(';base64,')[1],
          contentType: 'image/png',
        });
      }, 0);
    });
    const inputPrimitives = makeInputPrimitiveStub({
      pointer: {
        tap,
        doubleClick: vi.fn(async () => {}),
        longPress: vi.fn(async () => {}),
        dragAndDrop: vi.fn(async () => {}),
      },
    });
    const startMjpegStream = vi.fn(async ({ onFrame }) => {
      emitFrame = onFrame;
      onFrame({
        data: RECORDER_FRAME_FIXTURES[0].split(';base64,')[1],
        contentType: 'image/png',
      });
      return { stop: vi.fn() };
    });
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'web',
        actionSpace: () => [],
        inputPrimitives,
        screenshotBase64: async () => VALID_PNG_BASE64,
        size: async () => ({ width: 1280, height: 720 }),
        startMjpegStream,
      },
    } as any);

    await server.launch(6139);
    const startRecorderHandler = getRouteHandler(
      server,
      'post',
      '/recorder/start',
    );
    await startRecorderHandler(
      { body: { sessionId: 'session-preview-frame-binding' } },
      createMockResponse(),
    );
    const interactHandler = getRouteHandler(server, 'post', '/interact');
    for (let index = 0; index < RECORDER_FRAME_FIXTURES.length; index += 1) {
      await interactHandler(
        { body: { actionType: 'Tap', x: 10 + index, y: 20 } },
        createMockResponse(),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    await server.waitForRecorderIdle();

    const eventsHandler = getRouteHandler(server, 'get', '/recorder/events');
    const response = createMockResponse();
    await eventsHandler({ query: { since: '0' } }, response);
    const events = latestRecorderEventsBody(response.body).events as any[];
    expect(events).toHaveLength(RECORDER_FRAME_FIXTURES.length);
    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3]);
    expect(new Set(events.map((event) => event.frame.token)).size).toBe(3);

    const assetWrites = vi
      .mocked(writeFileSync)
      .mock.calls.filter(([filePath]) =>
        String(filePath).includes('session-preview-frame-binding-'),
      );
    expect(assetWrites).toHaveLength(RECORDER_FRAME_FIXTURES.length);
    expect(
      assetWrites.map(([, bytes]) => Buffer.from(bytes as Buffer)),
    ).toEqual(
      RECORDER_FRAME_FIXTURES.map((frame) =>
        Buffer.from(frame.split(';base64,')[1], 'base64'),
      ),
    );
  });

  test('recorder marks events failed when a screenshot cannot be retained', async () => {
    const inputPrimitives = makeInputPrimitiveStub();
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'ios',
        actionSpace: () => [],
        inputPrimitives,
        screenshotBase64: async () => undefined,
        size: async () => ({ width: 390, height: 844 }),
      },
    } as any);

    await server.launch(6119);
    const startRecorderHandler = getRouteHandler(
      server,
      'post',
      '/recorder/start',
    );
    await startRecorderHandler(
      { body: { sessionId: 'session-without-screenshot' } },
      createMockResponse(),
    );
    const interactHandler = getRouteHandler(server, 'post', '/interact');
    await interactHandler(
      { body: { actionType: 'Tap', x: 10, y: 20 } },
      createMockResponse(),
    );
    await server.waitForRecorderIdle();

    const eventsHandler = getRouteHandler(server, 'get', '/recorder/events');
    const eventsResponse = createMockResponse();
    await eventsHandler({ query: { since: '0' } }, eventsResponse);
    expect((eventsResponse.body as any).events).toMatchObject([
      {
        type: 'click',
        semantic: {
          source: 'aiDescribe',
          status: 'failed',
          error: expect.stringContaining('could not capture a screenshot'),
        },
        captureStatus: 'failed',
        captureError: { code: 'capture_failed' },
      },
    ]);
  });

  test('recorder captures a correct before-frame when no shared stream exists', async () => {
    const callOrder: string[] = [];
    const tap = rs.fn(async () => {
      callOrder.push('tap');
    });
    const inputPrimitives = makeInputPrimitiveStub({
      pointer: {
        tap,
        doubleClick: rs.fn(async () => {}),
        longPress: rs.fn(async () => {}),
        dragAndDrop: rs.fn(async () => {}),
      },
    });
    const screenshotBase64 = rs.fn(async () => {
      callOrder.push('screenshot');
      return VALID_PNG_BASE64;
    });
    const size = rs.fn(async () => {
      callOrder.push('size');
      return { width: 390, height: 844 };
    });
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'computer',
        actionSpace: () => [],
        inputPrimitives,
        screenshotBase64,
        size,
      },
    } as any);

    await server.launch(6120);
    const startRecorderHandler = getRouteHandler(
      server,
      'post',
      '/recorder/start',
    );
    await startRecorderHandler(
      { body: { sessionId: 'session-preview-order' } },
      createMockResponse(),
    );
    callOrder.length = 0;

    const interactHandler = getRouteHandler(server, 'post', '/interact');
    await interactHandler(
      { body: { actionType: 'Tap', x: 10, y: 20 } },
      createMockResponse(),
    );
    await server.waitForRecorderIdle();

    expect(tap).toHaveBeenCalledWith({ x: 10, y: 20 }, { duration: undefined });
    expect(callOrder).toEqual(['screenshot', 'tap', 'screenshot', 'size']);
  });

  test('recorder returns input aiDescribe failed when no describe capability is available', async () => {
    const inputPrimitives = makeInputPrimitiveStub();
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'ios',
        actionSpace: () => [],
        inputPrimitives,
        screenshotBase64: async () => VALID_PNG_BASE64,
        size: async () => ({ width: 390, height: 844 }),
      },
    } as any);

    await server.launch(6122);
    const startRecorderHandler = getRouteHandler(
      server,
      'post',
      '/recorder/start',
    );
    await startRecorderHandler(
      { body: { sessionId: 'session-preview-delayed-describe' } },
      createMockResponse(),
    );

    const interactHandler = getRouteHandler(server, 'post', '/interact');
    await interactHandler(
      {
        body: {
          actionType: 'Input',
          x: 10,
          y: 20,
          value: 'hello',
        },
      },
      createMockResponse(),
    );
    await server.waitForRecorderIdle();

    const eventsHandler = getRouteHandler(server, 'get', '/recorder/events');
    const eventsResponse = createMockResponse();
    await eventsHandler({ query: { since: '0' } }, eventsResponse);
    expect(latestRecorderEventsBody(eventsResponse.body)).toMatchObject({
      events: [
        {
          type: 'input',
          source: 'studio-preview',
          actionType: 'Input',
          value: 'hello',
          semantic: {
            source: 'aiDescribe',
            status: 'pending',
          },
        },
      ],
      nextIndex: 1,
    });
    const describeResponse = await describeRecorderEvent(
      server,
      latestRecorderEventsBody(eventsResponse.body).events[0],
    );
    expect(describeResponse.body).toMatchObject({
      ok: true,
      trace: {
        eventType: 'input',
        actionType: 'Input',
        eventSummary: {
          type: 'input',
          source: 'studio-preview',
          actionType: 'Input',
          valueLength: 5,
          rawPayloadSummary: {
            actionType: 'Input',
            x: 10,
            y: 20,
            valueLength: 5,
          },
        },
        status: 'failed',
        error: 'Active agent does not support describeElementAtPoint.',
        durationMs: expect.any(Number),
        screenshotRef: {
          path: expect.stringContaining('recorder-ai-describe-screenshots'),
          sha256: expect.any(String),
          bytes: expect.any(Number),
        },
      },
      event: {
        type: 'input',
        semantic: {
          source: 'aiDescribe',
          status: 'failed',
          error: 'Active agent does not support describeElementAtPoint.',
        },
      },
    });
    const failedTrace = (describeResponse.body as any).trace;
    expect(failedTrace.eventSummary.rawPayloadSummary.value).toBeUndefined();
  });

  test('recorder does not report verification metadata when verifyPrompt is disabled', async () => {
    const inputPrimitives = makeInputPrimitiveStub();
    const describeElementAtPoint = mockDescribeElementAtPoint(async () => ({
      prompt: 'login button',
      deepLocate: false,
      success: true,
      verifyResult: {
        pass: false,
        rect: { left: 10, top: 10, width: 5, height: 5 },
        center: [12.5, 12.5] as [number, number],
        centerDistance: 14.14,
      },
    }));
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'ios',
        actionSpace: () => [],
        inputPrimitives,
        screenshotBase64: async () => VALID_PNG_BASE64,
        size: async () => ({ width: 20, height: 20 }),
      },
    } as any);

    await server.launch(6118);

    const describeResponse = await describeRecorderEvent(server, {
      type: 'click',
      source: 'studio-preview',
      actionType: 'Tap',
      rawPayload: { actionType: 'Tap', x: 2.5, y: 2.5 },
      elementRect: {
        x: 2.5,
        y: 2.5,
        left: 0,
        top: 0,
        width: 5,
        height: 5,
      },
      pageInfo: { width: 20, height: 20 },
      screenshotBefore: VALID_PNG_BASE64,
      timestamp: 123,
      hashId: 'verify-failed-event',
    });

    expect(describeResponse.statusCode).toBe(200);
    expect(describeResponse.body).toMatchObject({
      ok: true,
      trace: {
        status: 'ready',
        elementDescription: 'login button',
        verifyPrompt: false,
      },
      event: {
        semantic: {
          source: 'aiDescribe',
          status: 'ready',
          elementDescription: 'login button',
          confidence: 'medium',
          aiDescribe: {
            verifyPrompt: false,
            expectedCenter: [2.5, 2.5],
          },
        },
      },
    });
    const trace = (describeResponse.body as any).trace;
    expect(trace.verifyPassed).toBeUndefined();
    expect(trace.verifyResult).toBeUndefined();
    expect(trace.screenshotRef).toBeUndefined();
    expect(trace.annotatedScreenshotRef).toBeUndefined();
  });

  test('recorder sanitizes screenshot dump paths from event metadata', async () => {
    const inputPrimitives = makeInputPrimitiveStub();
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'ios',
        actionSpace: () => [],
        inputPrimitives,
        screenshotBase64: async () => VALID_PNG_BASE64,
        size: async () => ({ width: 20, height: 20 }),
      },
    } as any);

    await server.launch(6130);

    const describeResponse = await describeRecorderEvent(server, {
      type: 'click',
      source: 'studio-preview',
      actionType: '../Tap/../../escape',
      rawPayload: { actionType: '../Tap/../../escape', x: 2.5, y: 2.5 },
      elementRect: {
        x: 2.5,
        y: 2.5,
        left: 0,
        top: 0,
        width: 5,
        height: 5,
      },
      pageInfo: { width: 20, height: 20 },
      screenshotBefore: VALID_PNG_BASE64,
      timestamp: 123,
      hashId: '../../outside',
    });

    const screenshotPath = (describeResponse.body as any).trace.screenshotRef
      .path;
    expect(screenshotPath).toContain('recorder-ai-describe-screenshots');
    expect(screenshotPath).not.toContain('..');
    expect(screenshotPath).not.toContain('/outside/');
    expect(screenshotPath).not.toContain('Tap-escape');
    expect(screenshotPath).toMatch(/_raw\.png$/);
  });

  test('recorder reports timeout instead of verification failure when verifyPrompt is disabled', async () => {
    const inputPrimitives = makeInputPrimitiveStub();
    const describeElementAtPoint = mockDescribeElementAtPoint(
      (
        _center: [number, number],
        opt?: { onProgress?: (progress: Record<string, unknown>) => void },
      ) => {
        opt?.onProgress?.({
          prompt: 'sidebar Icon menu item',
          deepLocate: true,
          verifyResult: {
            pass: false,
            rect: { left: 110, top: 700, width: 121, height: 36 },
            center: [170, 718] as [number, number],
            centerDistance: 140,
            includedInRect: false,
          },
        });
        return new Promise(() => {});
      },
    );
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'ios',
        actionSpace: () => [],
        inputPrimitives,
        screenshotBase64: async () => VALID_PNG_BASE64,
        size: async () => ({ width: 20, height: 20 }),
      },
    } as any);

    await server.launch(6129);

    const waitWithRealTimer = setTimeout;
    rs.useFakeTimers();
    try {
      const describePromise = describeRecorderEvent(server, {
        type: 'click',
        source: 'studio-preview',
        actionType: 'Tap',
        rawPayload: { actionType: 'Tap', x: 155, y: 709 },
        elementRect: {
          x: 155,
          y: 709,
          left: 149,
          top: 703,
          width: 12,
          height: 12,
        },
        pageInfo: { width: 1280, height: 768 },
        screenshotBefore: VALID_PNG_BASE64,
        timestamp: 123,
        hashId: 'verify-failed-then-timeout-event',
      });
      for (
        let attempt = 0;
        attempt < 20 && describeElementAtPoint.mock.calls.length === 0;
        attempt += 1
      ) {
        await new Promise((resolve) => waitWithRealTimer(resolve, 1));
      }
      expect(describeElementAtPoint).toHaveBeenCalledTimes(1);
      await rs.advanceTimersByTimeAsync(30_000);

      const describeResponse = await describePromise;

      expect(describeResponse.statusCode).toBe(200);
      expect(describeResponse.body).toMatchObject({
        ok: true,
        trace: {
          status: 'failed',
          error: 'Timed out while analyzing recorder event with aiDescribe.',
          modelCallDurationMs: expect.any(Number),
          elementDescription: 'sidebar Icon menu item',
          verifyPrompt: false,
        },
        event: {
          semantic: {
            source: 'aiDescribe',
            status: 'failed',
            error: 'Timed out while analyzing recorder event with aiDescribe.',
          },
        },
      });
      expect((describeResponse.body as any).trace.verifyPassed).toBeUndefined();
      expect((describeResponse.body as any).trace.verifyResult).toBeUndefined();
      expect(
        (describeResponse.body as any).event.semantic.aiDescribe,
      ).toBeUndefined();
    } finally {
      rs.useRealTimers();
    }
  });

  test('recorder does not verify aiDescribe results for scroll events', async () => {
    const inputPrimitives = makeInputPrimitiveStub();
    const describeElementAtPoint = mockDescribeElementAtPoint(async () => ({
      prompt: 'main documentation content area',
      deepLocate: false,
      verifyResult: {
        pass: false,
        rect: { left: 10, top: 10, width: 5, height: 5 },
        center: [12.5, 12.5] as [number, number],
        centerDistance: 14.14,
      },
    }));
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'ios',
        actionSpace: () => [],
        inputPrimitives,
        screenshotBase64: async () => VALID_PNG_BASE64,
        size: async () => ({ width: 20, height: 20 }),
      },
    } as any);

    await server.launch(6119);

    const describeResponse = await describeRecorderEvent(server, {
      type: 'scroll',
      source: 'studio-preview',
      actionType: 'Scroll',
      rawPayload: {
        actionType: 'Scroll',
        direction: 'down',
        distance: 640,
        x: 2.5,
        y: 2.5,
      },
      value: 'down 640',
      elementRect: {
        x: 2.5,
        y: 2.5,
        left: 2.5,
        top: 2.5,
      },
      pageInfo: { width: 20, height: 20 },
      screenshotBefore: VALID_PNG_BASE64,
      timestamp: 123,
      hashId: 'scroll-no-verify',
    });

    expect(describeElementAtPoint).toHaveBeenCalledWith(
      [2.5, 2.5],
      expect.objectContaining({
        verifyPrompt: false,
      }),
    );
    expect(describeResponse.statusCode).toBe(200);
    expect(describeResponse.body).toMatchObject({
      ok: true,
      trace: {
        status: 'ready',
        verifyPassed: undefined,
        verifyResult: undefined,
      },
      event: {
        semantic: {
          source: 'aiDescribe',
          status: 'ready',
          aiDescribe: {
            verifyPrompt: false,
            verifyPassed: undefined,
          },
        },
      },
    });
  });

  test('recorder inherits the last target point for input events without coordinates', async () => {
    const inputPrimitives = makeInputPrimitiveStub();
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'ios',
        actionSpace: () => [],
        inputPrimitives,
        screenshotBase64: async () => VALID_PNG_BASE64,
        size: async () => ({ width: 390, height: 844 }),
      },
    } as any);

    await server.launch(6126);
    const startRecorderHandler = getRouteHandler(
      server,
      'post',
      '/recorder/start',
    );
    await startRecorderHandler(
      { body: { sessionId: 'session-preview-input-target' } },
      createMockResponse(),
    );

    const interactHandler = getRouteHandler(server, 'post', '/interact');
    await interactHandler(
      { body: { actionType: 'Tap', x: 33, y: 44 } },
      createMockResponse(),
    );
    await interactHandler(
      { body: { actionType: 'Input', value: 'hello' } },
      createMockResponse(),
    );
    await server.waitForRecorderIdle();

    const eventsHandler = getRouteHandler(server, 'get', '/recorder/events');
    const eventsResponse = createMockResponse();
    await eventsHandler({ query: { since: '0' } }, eventsResponse);
    expect(latestRecorderEventsBody(eventsResponse.body)).toMatchObject({
      events: [
        {
          type: 'click',
          elementRect: { x: 33, y: 44, left: 33, top: 44 },
        },
        {
          type: 'input',
          value: 'hello',
          elementRect: { x: 33, y: 44, left: 33, top: 44 },
        },
      ],
      nextIndex: 2,
    });
  });

  test('publishes typeOnly input envelopes immediately for Studio-side coalescing', async () => {
    const inputPrimitives = makeInputPrimitiveStub();
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'ios',
        actionSpace: () => [],
        inputPrimitives,
        screenshotBase64: async () => VALID_PNG_BASE64,
        size: async () => ({ width: 390, height: 844 }),
      },
    } as any);

    await server.launch(6126);
    const startRecorderHandler = getRouteHandler(
      server,
      'post',
      '/recorder/start',
    );
    await startRecorderHandler(
      { body: { sessionId: 'session-preview-typeonly-input' } },
      createMockResponse(),
    );

    const interactHandler = getRouteHandler(server, 'post', '/interact');
    await interactHandler(
      {
        body: {
          actionType: 'Input',
          x: 10,
          y: 20,
          value: 'h',
          mode: 'typeOnly',
        },
      },
      createMockResponse(),
    );
    await interactHandler(
      {
        body: {
          actionType: 'Input',
          x: 10,
          y: 20,
          value: 'e',
          mode: 'typeOnly',
        },
      },
      createMockResponse(),
    );
    await server.waitForRecorderIdle();

    const eventsHandler = getRouteHandler(server, 'get', '/recorder/events');
    const pendingEventsResponse = createMockResponse();
    await eventsHandler(
      { query: { since: '0', flushPending: 'false' } },
      pendingEventsResponse,
    );
    expect(pendingEventsResponse.body).toMatchObject({
      nextIndex: 2,
      events: [
        {
          type: 'input',
          value: 'h',
          sequence: 1,
          captureStatus: 'ready',
          screenshotAsset: expect.any(Object),
        },
        {
          type: 'input',
          value: 'e',
          sequence: 2,
          captureStatus: 'ready',
          screenshotAsset: expect.any(Object),
        },
      ],
    });
  });

  test('recorder leaves clicks eligible for recorderAI fallback when aiDescribe is unavailable', async () => {
    const inputPrimitives = makeInputPrimitiveStub();
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'ios',
        actionSpace: () => [],
        inputPrimitives,
        screenshotBase64: async () => VALID_PNG_BASE64,
        size: async () => ({ width: 390, height: 844 }),
      },
    } as any);

    await server.launch(6123);
    const startRecorderHandler = getRouteHandler(
      server,
      'post',
      '/recorder/start',
    );
    await startRecorderHandler(
      { body: { sessionId: 'session-preview-verify-failure' } },
      createMockResponse(),
    );

    const interactHandler = getRouteHandler(server, 'post', '/interact');
    await interactHandler(
      { body: { actionType: 'Tap', x: 10, y: 20 } },
      createMockResponse(),
    );
    await server.waitForRecorderIdle();

    const eventsHandler = getRouteHandler(server, 'get', '/recorder/events');
    const eventsResponse = createMockResponse();
    await eventsHandler({ query: { since: '0' } }, eventsResponse);
    expect(latestRecorderEventsBody(eventsResponse.body)).toMatchObject({
      events: [
        {
          type: 'click',
          source: 'studio-preview',
          actionType: 'Tap',
          semantic: {
            source: 'aiDescribe',
            status: 'pending',
          },
        },
      ],
      nextIndex: 1,
    });
    const describeResponse = await describeRecorderEvent(
      server,
      latestRecorderEventsBody(eventsResponse.body).events[0],
    );
    expect(describeResponse.body).toMatchObject({
      ok: true,
      event: {
        type: 'click',
        semantic: {
          source: 'aiDescribe',
          status: 'failed',
          error: 'Active agent does not support describeElementAtPoint.',
        },
      },
    });
    expect(
      latestRecorderEventsBody(eventsResponse.body).events[0],
    ).not.toHaveProperty('descriptionSource');
  });

  test('recorder continues recording clicks when canonical aiDescribe fails', async () => {
    const inputPrimitives = makeInputPrimitiveStub();
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'ios',
        actionSpace: () => [],
        inputPrimitives,
        screenshotBase64: async () => VALID_PNG_BASE64,
        size: async () => ({ width: 390, height: 844 }),
      },
    } as any);

    await server.launch(6121);
    const startRecorderHandler = getRouteHandler(
      server,
      'post',
      '/recorder/start',
    );
    await startRecorderHandler(
      { body: { sessionId: 'session-preview-describe-failure' } },
      createMockResponse(),
    );

    const interactHandler = getRouteHandler(server, 'post', '/interact');
    await interactHandler(
      { body: { actionType: 'Tap', x: 10, y: 20 } },
      createMockResponse(),
    );
    await server.waitForRecorderIdle();

    const eventsHandler = getRouteHandler(server, 'get', '/recorder/events');
    const eventsResponse = createMockResponse();
    await eventsHandler({ query: { since: '0' } }, eventsResponse);
    expect(latestRecorderEventsBody(eventsResponse.body)).toMatchObject({
      events: [
        {
          type: 'click',
          source: 'studio-preview',
          actionType: 'Tap',
          semantic: {
            source: 'aiDescribe',
            status: 'pending',
          },
        },
      ],
      nextIndex: 1,
    });
    const describeResponse = await describeRecorderEvent(
      server,
      latestRecorderEventsBody(eventsResponse.body).events[0],
    );
    expect(describeResponse.body).toMatchObject({
      ok: true,
      event: {
        type: 'click',
        semantic: {
          source: 'aiDescribe',
          status: 'failed',
          error: 'Active agent does not support describeElementAtPoint.',
        },
      },
    });
  });

  test('recorder runs aiDescribe after preview interact without blocking dispatch', async () => {
    const callOrder: string[] = [];
    const inputPrimitives = makeInputPrimitiveStub({
      pointer: {
        tap: rs.fn(async () => {
          callOrder.push('tap');
        }),
        doubleClick: rs.fn(async () => {}),
        longPress: rs.fn(async () => {}),
        dragAndDrop: rs.fn(async () => {}),
      },
    });
    const describeElementAtPoint = mockDescribeElementAtPoint(
      () =>
        new Promise((resolve) => {
          callOrder.push('describe-start');
          setTimeout(
            () =>
              resolve({
                prompt: 'slow target',
                deepLocate: false,
                verifyResult: { pass: true },
              }),
            1000,
          );
        }),
    );
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'ios',
        actionSpace: () => [],
        inputPrimitives,
        screenshotBase64: async () => VALID_PNG_BASE64,
        size: async () => ({ width: 390, height: 844 }),
      },
    } as any);

    await server.launch(6124);
    const startRecorderHandler = getRouteHandler(
      server,
      'post',
      '/recorder/start',
    );
    await startRecorderHandler(
      { body: { sessionId: 'session-preview-slow-describe' } },
      createMockResponse(),
    );

    const interactHandler = getRouteHandler(server, 'post', '/interact');
    await interactHandler(
      { body: { actionType: 'Tap', x: 10, y: 20 } },
      createMockResponse(),
    );
    await server.waitForRecorderIdle();

    expect(callOrder[0]).toBe('tap');
    expect(callOrder).toEqual(['tap']);

    const eventsHandler = getRouteHandler(server, 'get', '/recorder/events');
    const eventsResponse = createMockResponse();
    await eventsHandler({ query: { since: '0' } }, eventsResponse);
    const describeResponse = await describeRecorderEvent(
      server,
      latestRecorderEventsBody(eventsResponse.body).events[0],
    );
    expect(callOrder).toEqual(['tap', 'describe-start']);
    expect(describeElementAtPoint).toHaveBeenCalledWith(
      [10, 20],
      expect.objectContaining({
        verifyPrompt: false,
        screenshotBase64: VALID_PNG_BASE64,
        coordinateSpace: 'logical',
        logicalSize: { width: 390, height: 844 },
        onProgress: expect.any(Function),
      }),
    );

    expect(describeResponse.body).toMatchObject({
      ok: true,
      event: {
        type: 'click',
        source: 'studio-preview',
        actionType: 'Tap',
        semantic: {
          source: 'aiDescribe',
          status: 'ready',
          elementDescription: 'slow target',
        },
      },
    });
  });

  test('recorder uses event before screenshot for aiDescribe when the live page changes after capture', async () => {
    const inputPrimitives = makeInputPrimitiveStub();
    const screenshotBase64 = rs
      .fn()
      .mockResolvedValueOnce(RECORDER_FRAME_FIXTURES[0])
      .mockResolvedValueOnce(RECORDER_FRAME_FIXTURES[1])
      .mockResolvedValueOnce(RECORDER_FRAME_FIXTURES[2]);
    const describeElementAtPoint = mockDescribeElementAtPoint(async () => ({
      prompt: 'login dialog target',
      deepLocate: false,
      verifyResult: { pass: true },
    }));
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'ios',
        actionSpace: () => [],
        inputPrimitives,
        screenshotBase64,
        size: async () => ({ width: 390, height: 844 }),
      },
    } as any);

    await server.launch(6127);
    const startRecorderHandler = getRouteHandler(
      server,
      'post',
      '/recorder/start',
    );
    await startRecorderHandler(
      { body: { sessionId: 'session-preview-stale-live-describe' } },
      createMockResponse(),
    );

    const interactHandler = getRouteHandler(server, 'post', '/interact');
    await interactHandler(
      { body: { actionType: 'Tap', x: 10, y: 20 } },
      createMockResponse(),
    );
    await server.waitForRecorderIdle();

    const eventsHandler = getRouteHandler(server, 'get', '/recorder/events');
    const eventsResponse = createMockResponse();
    await eventsHandler({ query: { since: '0' } }, eventsResponse);
    const describeResponse = await describeRecorderEvent(
      server,
      latestRecorderEventsBody(eventsResponse.body).events[0],
    );

    expect(describeElementAtPoint).toHaveBeenCalledWith(
      [10, 20],
      expect.objectContaining({
        verifyPrompt: false,
        screenshotBase64: RECORDER_FRAME_FIXTURES[1],
        coordinateSpace: 'logical',
        logicalSize: { width: 390, height: 844 },
        onProgress: expect.any(Function),
      }),
    );

    expect(describeResponse.body).toMatchObject({
      ok: true,
      event: {
        type: 'click',
        source: 'studio-preview',
        actionType: 'Tap',
        screenshotAsset: expect.objectContaining({
          id: expect.stringContaining('session-preview-stale-live-describe-'),
        }),
        semantic: {
          source: 'aiDescribe',
          status: 'ready',
          elementDescription: 'login dialog target',
        },
      },
    });
  });

  test('recorder keeps preview interactions independent from canonical aiDescribe', async () => {
    const tap = rs.fn(async () => {});
    const inputPrimitives = makeInputPrimitiveStub({
      pointer: {
        tap,
        doubleClick: rs.fn(async () => {}),
        longPress: rs.fn(async () => {}),
        dragAndDrop: rs.fn(async () => {}),
      },
    });
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'ios',
        actionSpace: () => [],
        inputPrimitives,
        screenshotBase64: async () => VALID_PNG_BASE64,
        size: async () => ({ width: 390, height: 844 }),
      },
    } as any);

    await server.launch(6125);
    const startRecorderHandler = getRouteHandler(
      server,
      'post',
      '/recorder/start',
    );
    await startRecorderHandler(
      { body: { sessionId: 'session-preview-describe-timeout' } },
      createMockResponse(),
    );

    rs.useFakeTimers();
    try {
      const interactHandler = getRouteHandler(server, 'post', '/interact');
      const response = createMockResponse();
      const interactPromise = interactHandler(
        { body: { actionType: 'Tap', x: 10, y: 20 } },
        response,
      );

      await rs.advanceTimersByTimeAsync(250);
      await interactPromise;
      await server.waitForRecorderIdle();

      expect(response.statusCode).toBe(200);
      expect(tap).toHaveBeenCalledWith(
        { x: 10, y: 20 },
        { duration: undefined },
      );
    } finally {
      rs.useRealTimers();
    }

    const eventsHandler = getRouteHandler(server, 'get', '/recorder/events');
    const eventsResponse = createMockResponse();
    await eventsHandler({ query: { since: '0' } }, eventsResponse);
    expect(latestRecorderEventsBody(eventsResponse.body)).toMatchObject({
      events: [
        {
          type: 'click',
          source: 'studio-preview',
          actionType: 'Tap',
          semantic: {
            source: 'aiDescribe',
            status: 'pending',
          },
        },
      ],
      nextIndex: 1,
    });
    expect(
      latestRecorderEventsBody(eventsResponse.body).events[0],
    ).not.toHaveProperty('descriptionSource');
  });

  test('recorder saves one navigation state when preview interaction changes web URL', async () => {
    let currentUrl = 'https://example.com/start';
    let currentScreenshot = VALID_PNG_BASE64;
    const inputPrimitives = makeInputPrimitiveStub({
      pointer: {
        tap: rs.fn(async () => {
          if (currentUrl.endsWith('/start')) {
            currentUrl = 'https://example.com/next';
            currentScreenshot = VALID_PNG_BASE64;
          }
        }),
        doubleClick: rs.fn(async () => {}),
        longPress: rs.fn(async () => {}),
        dragAndDrop: rs.fn(async () => {}),
      },
    });
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'web',
        actionSpace: () => [],
        inputPrimitives,
        screenshotBase64: async () => currentScreenshot,
        size: async () => ({ width: 1280, height: 720 }),
        url: async () => currentUrl,
        evaluateJavaScript: async () =>
          currentUrl.endsWith('/next') ? 'Next page' : 'Start page',
      },
    } as any);

    await server.launch(6119);
    const startRecorderHandler = getRouteHandler(
      server,
      'post',
      '/recorder/start',
    );
    await startRecorderHandler(
      { body: { sessionId: 'session-web-preview' } },
      createMockResponse(),
    );

    const interactHandler = getRouteHandler(server, 'post', '/interact');
    await interactHandler(
      { body: { actionType: 'Tap', x: 120, y: 314 } },
      createMockResponse(),
    );
    await interactHandler(
      { body: { actionType: 'Tap', x: 220, y: 414 } },
      createMockResponse(),
    );
    await server.waitForRecorderIdle();

    const eventsHandler = getRouteHandler(server, 'get', '/recorder/events');
    const eventsResponse = createMockResponse();
    await eventsHandler({ query: { since: '0' } }, eventsResponse);
    const rawNavigationEvents = (
      eventsResponse.body as { events: Array<Record<string, unknown>> }
    ).events.filter(
      (event) =>
        event.type === 'navigation' && event.url === 'https://example.com/next',
    );
    expect(rawNavigationEvents).toEqual([
      expect.objectContaining({
        actionType: 'Navigate',
        rawPayload: expect.objectContaining({
          triggerActionType: 'Tap',
          implicitNavigationState: true,
        }),
      }),
    ]);
    const recorderEvents = latestRecorderEventsBody(eventsResponse.body);
    expect(recorderEvents).toMatchObject({
      events: [
        {
          type: 'navigation',
          source: 'studio-preview',
          actionType: 'InitialNavigation',
          url: 'https://example.com/start',
          title: 'Start page',
          semantic: {
            source: 'heuristic',
            status: 'ready',
            replayInstruction: 'Navigate to `https://example.com/start`.',
          },
        },
        {
          type: 'click',
          source: 'studio-preview',
          url: 'https://example.com/start',
          title: 'Start page',
        },
        {
          type: 'navigation',
          source: 'studio-preview',
          actionType: 'Navigate',
          url: 'https://example.com/next',
          title: 'Next page',
          semantic: {
            source: 'heuristic',
            status: 'ready',
            replayInstruction: 'Navigate to `https://example.com/next`.',
          },
        },
        {
          type: 'click',
          source: 'studio-preview',
          url: 'https://example.com/next',
          title: 'Next page',
        },
      ],
      nextIndex: 4,
    });
    const [initialNavigation, firstClick, navigationState, secondClick] =
      recorderEvents.events as any[];
    expect(initialNavigation).not.toHaveProperty('screenshotAsset');
    expect(navigationState).not.toHaveProperty('screenshotAsset');
    expect(firstClick).toMatchObject({ screenshotAsset: expect.any(Object) });
    expect(secondClick).toMatchObject({ screenshotAsset: expect.any(Object) });
  });

  test('recorder binds a navigation notification raised during an action to that action', async () => {
    let currentUrl = 'https://example.com/start';
    const inputPrimitives = makeInputPrimitiveStub({
      pointer: {
        tap: vi.fn(async () => {
          currentUrl = 'https://example.com/next';
          (server as any).recordStudioPreviewNavigationState({
            url: currentUrl,
            timestamp: Date.now(),
          });
        }),
        doubleClick: vi.fn(async () => {}),
        longPress: vi.fn(async () => {}),
        dragAndDrop: vi.fn(async () => {}),
      },
    });
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'web',
        actionSpace: () => [],
        inputPrimitives,
        screenshotBase64: async () => VALID_PNG_BASE64,
        size: async () => ({ width: 1280, height: 720 }),
        url: async () => currentUrl,
        evaluateJavaScript: async () =>
          currentUrl.endsWith('/next') ? 'Next page' : 'Start page',
      },
    } as any);

    await server.launch(6141);
    const startRecorderHandler = getRouteHandler(
      server,
      'post',
      '/recorder/start',
    );
    await startRecorderHandler(
      { body: { sessionId: 'session-navigation-causal-binding' } },
      createMockResponse(),
    );
    const interactHandler = getRouteHandler(server, 'post', '/interact');
    await interactHandler(
      { body: { actionType: 'Tap', x: 120, y: 314 } },
      createMockResponse(),
    );
    await server.waitForRecorderIdle();

    const eventsHandler = getRouteHandler(server, 'get', '/recorder/events');
    const response = createMockResponse();
    await eventsHandler({ query: { since: '0' } }, response);
    const events = latestRecorderEventsBody(response.body).events as any[];
    const click = events.find((event) => event.type === 'click');
    const navigations = events.filter(
      (event) => event.actionType === 'Navigate',
    );
    expect(click).toMatchObject({
      sequence: 1,
      url: 'https://example.com/start',
    });
    expect(navigations).toEqual([
      expect.objectContaining({
        sequence: 1,
        parentEventId: click.eventId,
        url: 'https://example.com/next',
      }),
    ]);
  });

  test('recorder saves delayed navigation state after a click changes the page URL', async () => {
    let currentUrl = 'https://example.com/start';
    let tapCount = 0;
    const inputPrimitives = makeInputPrimitiveStub({
      pointer: {
        tap: rs.fn(async () => {
          tapCount++;
          if (tapCount === 1) {
            setTimeout(() => {
              currentUrl = 'https://example.com/next';
            }, 50);
          }
        }),
        doubleClick: rs.fn(async () => {}),
        longPress: rs.fn(async () => {}),
        dragAndDrop: rs.fn(async () => {}),
      },
    });
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'web',
        actionSpace: () => [],
        inputPrimitives,
        screenshotBase64: async () => VALID_PNG_BASE64,
        size: async () => ({ width: 1280, height: 720 }),
        url: async () => currentUrl,
        evaluateJavaScript: async () =>
          currentUrl.endsWith('/next') ? 'Next page' : 'Start page',
      },
    } as any);

    await server.launch(6129);
    const startRecorderHandler = getRouteHandler(
      server,
      'post',
      '/recorder/start',
    );
    await startRecorderHandler(
      { body: { sessionId: 'session-web-stale-navigation-snapshot' } },
      createMockResponse(),
    );

    const interactHandler = getRouteHandler(server, 'post', '/interact');
    await interactHandler(
      { body: { actionType: 'Tap', x: 120, y: 314 } },
      createMockResponse(),
    );
    await new Promise((resolve) => setTimeout(resolve, 60));
    (server as any).recordStudioPreviewNavigationState({
      url: currentUrl,
      timestamp: Date.now(),
    });
    await server.waitForRecorderIdle();

    const eventsHandler = getRouteHandler(server, 'get', '/recorder/events');
    const eventsResponse = createMockResponse();
    await eventsHandler({ query: { since: '0' } }, eventsResponse);
    const rawNavigationEvents = (
      eventsResponse.body as { events: Array<Record<string, unknown>> }
    ).events.filter(
      (event) =>
        event.type === 'navigation' && event.url === 'https://example.com/next',
    );

    expect(rawNavigationEvents).toEqual([
      expect.objectContaining({
        actionType: 'Navigate',
        rawPayload: expect.objectContaining({
          triggerActionType: 'Tap',
          implicitNavigationState: true,
        }),
      }),
    ]);
    expect(latestRecorderEventsBody(eventsResponse.body).events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ actionType: 'InitialNavigation' }),
        expect.objectContaining({
          type: 'click',
          actionType: 'Tap',
          sequence: 1,
        }),
        expect.objectContaining({
          type: 'navigation',
          actionType: 'Navigate',
          sequence: 1,
          parentEventId: expect.any(String),
        }),
      ]),
    );
  });

  test('POST /interact returns 400 for invalid manual params', async () => {
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'android',
        actionSpace: () => [{ name: 'Tap', description: 'tap', call: rs.fn() }],
      },
    } as any);

    await server.launch(6111);
    const interactHandler = getRouteHandler(server, 'post', '/interact');
    const response = createMockResponse();
    await interactHandler({ body: { actionType: 'Tap', y: 20 } }, response);

    expect(response.statusCode).toBe(400);
    expect(response.body).toMatchObject({
      error: 'x must be a number for this action',
    });
  });

  test('POST /interact returns 404 when the current device lacks the action', async () => {
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'android',
        actionSpace: () => [],
      },
    } as any);

    await server.launch(6112);
    const interactHandler = getRouteHandler(server, 'post', '/interact');
    const response = createMockResponse();
    await interactHandler(
      { body: { actionType: 'Tap', x: 10, y: 20 } },
      response,
    );

    expect(response.statusCode).toBe(404);
    expect(response.body).toMatchObject({
      error: 'Manual control is not supported on this device',
    });
  });

  test('POST /interact returns 404 when the requested primitive is not implemented', async () => {
    const inputPrimitives = makeInputPrimitiveStub({
      touch: {
        swipe: rs.fn(async () => {}),
      },
    });
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'harmony',
        actionSpace: () => [],
        inputPrimitives,
        size: async () => ({ width: 1080, height: 1920 }),
      },
    } as any);

    await server.launch(6112);
    const interactHandler = getRouteHandler(server, 'post', '/interact');
    const response = createMockResponse();
    await interactHandler(
      { body: { actionType: 'Pinch', x: 100, y: 200, direction: 'out' } },
      response,
    );

    expect(response.statusCode).toBe(404);
    expect((response.body as { error: string }).error).toBe(
      'Pinch is not supported on this device',
    );
  });

  test('POST /interact returns 404 for unknown pointer actionType', async () => {
    const inputPrimitives = makeInputPrimitiveStub();
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'android',
        actionSpace: () => [],
        inputPrimitives,
      },
    } as any);

    await server.launch(6112);
    const interactHandler = getRouteHandler(server, 'post', '/interact');
    const response = createMockResponse();
    await interactHandler(
      { body: { actionType: 'NotARealThing', x: 1, y: 2 } },
      response,
    );

    expect(response.statusCode).toBe(404);
    expect((response.body as { error: string }).error).toBe(
      'Unknown actionType "NotARealThing"',
    );
  });

  test('POST /interact runs web Stop through browser chrome instead of actionSpace', async () => {
    const stopLoading = rs.fn(async () => undefined);
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'web',
        actionSpace: () => [],
        stopLoading,
      },
    } as any);

    await server.launch(6115);
    const interactHandler = getRouteHandler(server, 'post', '/interact');
    const response = createMockResponse();
    await interactHandler({ body: { actionType: 'Stop' } }, response);

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({});
    expect(stopLoading).toHaveBeenCalledTimes(1);
  });

  test('POST /interact recreates a factory-backed agent without replaying the failed action', async () => {
    const firstDestroy = rs.fn();
    const firstTapCall = rs.fn(async () => {
      throw new Error(
        'Protocol error (Input.dispatchMouseEvent): Session closed. Most likely the page has been closed.',
      );
    });
    const secondTapCall = rs.fn();
    const agentFactory = rs
      .fn()
      .mockResolvedValueOnce({
        destroy: firstDestroy,
        interface: {
          interfaceType: 'web',
          actionSpace: () => [
            { name: 'Tap', description: 'tap', call: firstTapCall },
          ],
        },
      })
      .mockResolvedValueOnce({
        interface: {
          interfaceType: 'web',
          actionSpace: () => [
            { name: 'Tap', description: 'tap', call: secondTapCall },
          ],
        },
      });

    const server = new PlaygroundServer(agentFactory as any);
    await server.launch(6114);
    const interactHandler = getRouteHandler(server, 'post', '/interact');
    const response = createMockResponse();

    await interactHandler(
      { body: { actionType: 'Tap', x: 10, y: 20 } },
      response,
    );

    expect(response.statusCode).toBe(409);
    expect(response.body).toEqual({
      error:
        'The page session was closed and has been recreated. Please retry the action.',
    });
    expect(agentFactory).toHaveBeenCalledTimes(2);
    expect(firstDestroy).toHaveBeenCalledTimes(1);
    expect(firstTapCall).toHaveBeenCalledTimes(1);
    expect(secondTapCall).not.toHaveBeenCalled();
  });

  test('POST /interact responds before async recorder capture finishes', async () => {
    const screenshotBase64 = rs
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce(VALID_PNG_BASE64)
      .mockImplementation(
        async () =>
          new Promise<string>((resolve) => {
            setTimeout(() => resolve(VALID_PNG_BASE64), 25);
          }),
      );
    const inputPrimitives = makeInputPrimitiveStub({
      keyboard: {
        keyboardPress: rs.fn(async () => {}),
        typeText: rs.fn(async () => {}),
        clearInput: rs.fn(async () => {}),
      },
    });
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'web',
        actionSpace: () => [],
        inputPrimitives,
        screenshotBase64,
        size: async () => ({ width: 1280, height: 720 }),
      },
    } as any);

    await server.launch(6126);
    const startRecorderHandler = getRouteHandler(
      server,
      'post',
      '/recorder/start',
    );
    await startRecorderHandler(
      { body: { sessionId: 'session-preview-async-recorder' } },
      createMockResponse(),
    );

    const interactHandler = getRouteHandler(server, 'post', '/interact');
    const response = createMockResponse();
    await interactHandler(
      {
        body: {
          actionType: 'Input',
          value: '12343014883',
          mode: 'typeOnly',
        },
      },
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({});

    const eventsHandler = getRouteHandler(server, 'get', '/recorder/events');
    const beforeFlushResponse = createMockResponse();
    await eventsHandler({ query: { since: '0' } }, beforeFlushResponse);
    expect(beforeFlushResponse.body).toMatchObject({
      events: [
        {
          type: 'input',
          source: 'studio-preview',
          actionType: 'Input',
          value: '12343014883',
          captureStatus: 'pending',
          revisions: { capture: 0, semantic: 0 },
        },
      ],
      nextIndex: 1,
    });

    await server.waitForRecorderIdle();

    const afterFlushResponse = createMockResponse();
    await eventsHandler({ query: { since: '0' } }, afterFlushResponse);
    expect(latestRecorderEventsBody(afterFlushResponse.body)).toMatchObject({
      events: [
        {
          type: 'input',
          source: 'studio-preview',
          actionType: 'Input',
          value: '12343014883',
          captureStatus: 'ready',
          revisions: { capture: 1, semantic: 0 },
        },
      ],
      nextIndex: 1,
    });
  }, 10_000);

  test('POST /interact does not fail when sync recorder capture throws', async () => {
    const inputPrimitives = makeInputPrimitiveStub();
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'web',
        actionSpace: () => [],
        inputPrimitives,
        screenshotBase64: async () => VALID_PNG_BASE64,
        size: async () => ({ width: 1280, height: 720 }),
      },
    } as any);

    await server.launch(6127);
    const startRecorderHandler = getRouteHandler(
      server,
      'post',
      '/recorder/start',
    );
    await startRecorderHandler(
      { body: { sessionId: 'session-preview-recorder-failure' } },
      createMockResponse(),
    );

    (server as any).createRecorderScreenshotWithMarker = rs.fn(async () => {
      throw new Error('marker failed');
    });

    const interactHandler = getRouteHandler(server, 'post', '/interact');
    const response = createMockResponse();
    await interactHandler(
      { body: { actionType: 'Tap', x: 10, y: 20 } },
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({});
    expect(inputPrimitives.pointer?.tap).toHaveBeenCalledWith(
      { x: 10, y: 20 },
      { duration: undefined },
    );
  });

  test('POST /interact captures a before snapshot for deferred keyboard input without a shared frame', async () => {
    const inputPrimitives = makeInputPrimitiveStub();
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'web',
        actionSpace: () => [],
        inputPrimitives,
        screenshotBase64: async () => VALID_PNG_BASE64,
        size: async () => ({ width: 1280, height: 720 }),
      },
    } as any);

    await server.launch(6128);
    const startRecorderHandler = getRouteHandler(
      server,
      'post',
      '/recorder/start',
    );
    await startRecorderHandler(
      { body: { sessionId: 'session-preview-keyboard-preflight' } },
      createMockResponse(),
    );

    const captureRecorderSnapshotBeforeInteract = rs.spyOn(
      server as any,
      'captureRecorderSnapshotBeforeInteract',
    );

    const interactHandler = getRouteHandler(server, 'post', '/interact');
    const response = createMockResponse();
    await interactHandler(
      {
        body: {
          actionType: 'Input',
          value: '002937',
          mode: 'typeOnly',
        },
      },
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({});
    expect(captureRecorderSnapshotBeforeInteract).toHaveBeenCalledOnce();
  });

  test('GET /interface-info includes device size without fetching a screenshot', async () => {
    const screenshotBase64 = rs.fn(async () => VALID_PNG_BASE64);
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'ios',
        describe: () => 'iPhone',
        actionSpace: () => [],
        screenshotBase64,
        size: async () => ({ width: 390, height: 844 }),
      },
    } as any);

    await server.launch(6113);
    const interfaceInfoHandler = getRouteHandler(
      server,
      'get',
      '/interface-info',
    );
    const response = createMockResponse();
    await interfaceInfoHandler({}, response);

    expect(response.body).toMatchObject({
      type: 'ios',
      description: 'iPhone',
      size: { width: 390, height: 844 },
    });
    expect(screenshotBase64).not.toHaveBeenCalled();
  });

  test('GET /interface-info exposes the device actionSpace as actionTypes', async () => {
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'computer',
        describe: () => 'Desktop',
        actionSpace: () => [
          { name: 'Tap', description: '', call: rs.fn() },
          { name: 'DragAndDrop', description: '', call: rs.fn() },
          { name: 'KeyboardPress', description: '', call: rs.fn() },
          { name: 'Input', description: '', call: rs.fn() },
        ],
        screenshotBase64: async () => VALID_PNG_BASE64,
        size: async () => ({ width: 1920, height: 1080 }),
      },
    } as any);

    await server.launch(6114);
    const interfaceInfoHandler = getRouteHandler(
      server,
      'get',
      '/interface-info',
    );
    const response = createMockResponse();
    await interfaceInfoHandler({}, response);

    expect(response.body).toMatchObject({
      type: 'computer',
      actionTypes: ['Tap', 'DragAndDrop', 'KeyboardPress', 'Input'],
    });
  });
});
