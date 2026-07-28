import { createReadStream, existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type ReportActionDump,
  describeElementAtPoint as coreDescribeElementAtPoint,
} from '@midscene/core';
import type { InputPrimitives } from '@midscene/core/device';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { PlaygroundServer } from '../../src/server';

vi.mock('@midscene/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@midscene/core')>();
  return {
    ...actual,
    describeElementAtPoint: vi.fn(),
  };
});

const VALID_PNG_BASE64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAKklEQVR4nO3MIQEAAAzDsPo3/ePhDi4CwpWxUMMXaaFH4QgLPQpHWHg6fOdROhs7ULsmAAAAAElFTkSuQmCC';
const VALID_WEBP_BASE64 =
  'data:image/webp;base64,UklGRjQAAABXRUJQVlA4ICgAAACQAQCdASoCAAMAAMASJQBOl0AAjNAA/v4icv1difCfoP7mxzi2QwAA';

function createMockResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    contentType: undefined as string | undefined,
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
    type(contentType: string) {
      this.contentType = contentType;
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
      tap: vi.fn(async () => {}),
      doubleClick: vi.fn(async () => {}),
      longPress: vi.fn(async () => {}),
      dragAndDrop: vi.fn(async () => {}),
    },
    keyboard: {
      keyboardPress: vi.fn(async () => {}),
      typeText: vi.fn(async () => {}),
      clearInput: vi.fn(async () => {}),
    },
    touch: {
      swipe: vi.fn(async () => {}),
      pinch: vi.fn(async () => {}),
    },
    scroll: {
      scroll: vi.fn(async () => {}),
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
  const describeElementAtPoint = vi.fn(implementation);
  vi.mocked(coreDescribeElementAtPoint).mockImplementation(((
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
    vi.mocked(existsSync).mockImplementation(() => true);
    vi.mocked(coreDescribeElementAtPoint).mockReset();
    vi.mocked(coreDescribeElementAtPoint).mockRejectedValue(
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
      resetDump: vi.fn(() => {
        dump.executions = [];
      }),
      callActionInActionSpace: vi.fn(async () => {
        appendExecution({ id: 'login', logTime: 300, name: 'Act - login' });
        return { ok: true };
      }),
      dumpDataString: vi.fn(() => JSON.stringify(dump)),
      reportHTMLString: vi.fn(() => '<html></html>'),
      writeOutActionDumps: vi.fn(),
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
      resetDump: vi.fn(),
      aiAct: vi.fn(async (_prompt: string, options: any) => {
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
      dumpDataString: vi.fn(() => JSON.stringify(dump)),
      reportHTMLString: vi.fn(() => '<html></html>'),
      writeOutActionDumps: vi.fn(),
    };
    const server = new PlaygroundServer(agent as any);

    try {
      await server.launch(6140);
      vi.spyOn(server as any, 'recreateAgent').mockResolvedValue(undefined);
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
                  mimeType: 'image/webp',
                  storage: 'inline',
                },
              },
            },
          ],
        },
      ],
    };
    const reportHTML = `<html></html>\n<script type="midscene-image" data-id="shot-1">${VALID_WEBP_BASE64}</script>\n<script type="midscene_web_dump">${JSON.stringify(dump)}</script>`;
    vi.mocked(createReadStream).mockImplementation(
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
      resetDump: vi.fn(),
      callActionInActionSpace: vi.fn(async () => ({ ok: true })),
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
          params: { reportId: report.id, assetName: 'shot-1.webp' },
        },
        screenshotResponse,
      );
      expect(Buffer.isBuffer(screenshotResponse.body)).toBe(true);
      expect((screenshotResponse.body as Buffer).length).toBeGreaterThan(0);
      expect(screenshotResponse.contentType).toBe('image/webp');
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
      resetDump: vi.fn(),
      callActionInActionSpace: vi.fn(async () => ({ ok: true })),
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
    const actionCall = vi.fn();
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'android',
        describe: () => 'Android device',
        actionSpace: () => [
          { name: 'Tap', description: 'tap', call: actionCall },
        ],
        inputPrimitives,
        screenshotBase64: async () => 'base64-image',
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
    const tapCall = vi.fn();
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'android',
        describe: () => 'Android device',
        actionSpace: () => [{ name: 'Tap', description: 'tap', call: tapCall }],
        screenshotBase64: async () => 'base64-image',
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
        screenshotBase64: async () => VALID_WEBP_BASE64,
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
        mimeType: 'image/webp',
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
    vi.mocked(existsSync).mockImplementation((filePath) =>
      String(filePath).endsWith('.webp'),
    );
    await assetHandler(
      { params: { assetId: rawEvents[0].screenshotAsset.id } },
      assetResponse,
    );
    vi.mocked(existsSync).mockImplementation(() => true);
    expect(assetResponse.statusCode).toBe(200);
    expect(assetResponse.contentType).toBe('image/webp');

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
        screenshotBase64: expect.stringMatching(/^data:image\/webp;base64,/),
        coordinateSpace: 'logical',
        logicalSize: { width: 390, height: 844 },
        onProgress: expect.any(Function),
      }),
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
          error: expect.stringContaining('screenshot was not retained'),
        },
      },
    ]);
  });

  test('recorder dispatches preview interactions before taking the after screenshot', async () => {
    const callOrder: string[] = [];
    const tap = vi.fn(async () => {
      callOrder.push('tap');
    });
    const inputPrimitives = makeInputPrimitiveStub({
      pointer: {
        tap,
        doubleClick: vi.fn(async () => {}),
        longPress: vi.fn(async () => {}),
        dragAndDrop: vi.fn(async () => {}),
      },
    });
    const screenshotBase64 = vi.fn(async () => {
      callOrder.push('screenshot');
      return 'base64-image';
    });
    const size = vi.fn(async () => {
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
    expect(callOrder[0]).toBe('tap');
    expect(callOrder).toEqual(['tap', 'screenshot', 'size']);
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

    vi.useFakeTimers();
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
      await vi.advanceTimersByTimeAsync(30_000);

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
      vi.useRealTimers();
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
        screenshotBase64: async () => 'base64-image',
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

  test('coalesces typeOnly input before persisting its final screenshot', async () => {
    const inputPrimitives = makeInputPrimitiveStub();
    const describeElementAtPoint = mockDescribeElementAtPoint(async () => ({
      prompt: 'phone number input',
      deepLocate: false,
      verifyResult: { pass: true },
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
      events: [],
      nextIndex: 0,
    });

    const eventsResponse = createMockResponse();
    await eventsHandler({ query: { since: '0' } }, eventsResponse);
    const events = latestRecorderEventsBody(eventsResponse.body).events;
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event).toMatchObject({
      value: 'he',
      mergedHashIds: expect.any(Array),
      screenshotAsset: expect.any(Object),
    });

    const describeResponse = await describeRecorderEvent(server, event);

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
    expect(describeResponse.statusCode).toBe(200);
    expect(describeResponse.body).toMatchObject({
      ok: true,
      trace: {
        status: 'ready',
        eventType: 'input',
        actionType: 'Input',
        point: [10, 20],
        eventSummary: {
          rawPayloadSummary: {
            mode: 'typeOnly',
            valueLength: 2,
          },
        },
      },
      event: {
        type: 'input',
        actionType: 'Input',
        value: 'he',
        semantic: {
          source: 'aiDescribe',
          status: 'ready',
          elementDescription: 'phone number input',
        },
      },
    });
  });

  test('recorder leaves clicks eligible for recorderAI fallback when aiDescribe is unavailable', async () => {
    const inputPrimitives = makeInputPrimitiveStub();
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'ios',
        actionSpace: () => [],
        inputPrimitives,
        screenshotBase64: async () => 'base64-image',
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
        screenshotBase64: async () => 'base64-image',
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
        tap: vi.fn(async () => {
          callOrder.push('tap');
        }),
        doubleClick: vi.fn(async () => {}),
        longPress: vi.fn(async () => {}),
        dragAndDrop: vi.fn(async () => {}),
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
        screenshotBase64: async () => 'base64-image',
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
        screenshotBase64: 'base64-image',
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
    const screenshotBase64 = vi
      .fn()
      .mockResolvedValueOnce('initial-screenshot')
      .mockResolvedValueOnce('event-screenshot')
      .mockResolvedValueOnce('stale-live-screenshot');
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
        screenshotBase64: 'initial-screenshot',
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
        screenshotAfter: 'event-screenshot',
        semantic: {
          source: 'aiDescribe',
          status: 'ready',
          elementDescription: 'login dialog target',
        },
      },
    });
  });

  test('recorder keeps preview interactions independent from canonical aiDescribe', async () => {
    const tap = vi.fn(async () => {});
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
        interfaceType: 'ios',
        actionSpace: () => [],
        inputPrimitives,
        screenshotBase64: async () => 'base64-image',
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

    vi.useFakeTimers();
    try {
      const interactHandler = getRouteHandler(server, 'post', '/interact');
      const response = createMockResponse();
      const interactPromise = interactHandler(
        { body: { actionType: 'Tap', x: 10, y: 20 } },
        response,
      );

      await vi.advanceTimersByTimeAsync(250);
      await interactPromise;
      await server.waitForRecorderIdle();

      expect(response.statusCode).toBe(200);
      expect(tap).toHaveBeenCalledWith(
        { x: 10, y: 20 },
        { duration: undefined },
      );
    } finally {
      vi.useRealTimers();
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
        tap: vi.fn(async () => {
          if (currentUrl.endsWith('/start')) {
            currentUrl = 'https://example.com/next';
            currentScreenshot = VALID_PNG_BASE64;
          }
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

  test('recorder saves delayed navigation state after a click changes the page URL', async () => {
    let currentUrl = 'https://example.com/start';
    let tapCount = 0;
    const inputPrimitives = makeInputPrimitiveStub({
      pointer: {
        tap: vi.fn(async () => {
          tapCount++;
          if (tapCount === 1) {
            setTimeout(() => {
              currentUrl = 'https://example.com/next';
            }, 50);
          }
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
    await interactHandler(
      { body: { actionType: 'Tap', x: 220, y: 414 } },
      createMockResponse(),
    );
    await new Promise((resolve) => setTimeout(resolve, 60));
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
        expect.objectContaining({ type: 'click', actionType: 'Tap' }),
      ]),
    );
  });

  test('POST /interact returns 400 for invalid manual params', async () => {
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'android',
        actionSpace: () => [{ name: 'Tap', description: 'tap', call: vi.fn() }],
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
        swipe: vi.fn(async () => {}),
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
    const stopLoading = vi.fn(async () => undefined);
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
    const firstDestroy = vi.fn();
    const firstTapCall = vi.fn(async () => {
      throw new Error(
        'Protocol error (Input.dispatchMouseEvent): Session closed. Most likely the page has been closed.',
      );
    });
    const secondTapCall = vi.fn();
    const agentFactory = vi
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
    const screenshotBase64 = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('base64-image')
      .mockImplementation(
        async () =>
          new Promise<string>((resolve) => {
            setTimeout(() => resolve('base64-image'), 25);
          }),
      );
    const inputPrimitives = makeInputPrimitiveStub({
      keyboard: {
        keyboardPress: vi.fn(async () => {}),
        typeText: vi.fn(async () => {}),
        clearInput: vi.fn(async () => {}),
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
      events: [],
      nextIndex: 0,
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
        screenshotBase64: async () => 'base64-image',
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

    (server as any).createRecorderScreenshotWithMarker = vi.fn(async () => {
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

  test('POST /interact skips recorder snapshot preflight for deferred keyboard input', async () => {
    const inputPrimitives = makeInputPrimitiveStub();
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'web',
        actionSpace: () => [],
        inputPrimitives,
        screenshotBase64: async () => 'base64-image',
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

    const captureRecorderSnapshotBeforeInteract = vi.spyOn(
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
    expect(captureRecorderSnapshotBeforeInteract).not.toHaveBeenCalled();
  });

  test('GET /interface-info includes device size without fetching a screenshot', async () => {
    const screenshotBase64 = vi.fn(async () => 'base64-image');
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
          { name: 'Tap', description: '', call: vi.fn() },
          { name: 'DragAndDrop', description: '', call: vi.fn() },
          { name: 'KeyboardPress', description: '', call: vi.fn() },
          { name: 'Input', description: '', call: vi.fn() },
        ],
        screenshotBase64: async () => 'base64-image',
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
