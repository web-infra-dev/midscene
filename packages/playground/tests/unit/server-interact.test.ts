import { ReportActionDump } from '@midscene/core';
import type { InputPrimitives } from '@midscene/core/device';
import { describe, expect, test, vi } from 'vitest';
import { PlaygroundServer } from '../../src/server';

function createMockResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
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

describe('PlaygroundServer manual interaction APIs', () => {
  test('POST /execute resets stale preview dumps before replay execution', async () => {
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
    const body = response.body as { dump: ReportActionDump };
    expect(agent.resetDump).toHaveBeenCalledBefore(
      agent.callActionInActionSpace,
    );
    expect(body.dump).toBeInstanceOf(ReportActionDump);
    expect(body.dump.executions.map((execution) => execution.id)).toEqual([
      'logout',
      'login',
    ]);
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
    const describeElementAtPoint = vi.fn(async () => ({
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
        screenshotBase64: async () => 'base64-image',
        size: async () => ({ width: 390, height: 844 }),
      },
      describeElementAtPoint,
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
        {
          type: 'click',
          semantic: {
            source: 'aiDescribe',
            status: 'ready',
          },
        },
      ],
      nextIndex: 2,
    });
    const rawEvents = (eventsResponse.body as any).events;
    expect(rawEvents[0].hashId).toBe(rawEvents[1].hashId);

    expect(latestRecorderEventsBody(eventsResponse.body)).toMatchObject({
      events: [
        {
          type: 'click',
          source: 'studio-preview',
          actionType: 'Tap',
          elementRect: { x: 10, y: 20 },
          pageInfo: { width: 390, height: 844 },
          semantic: {
            source: 'aiDescribe',
            status: 'ready',
            elementDescription: 'login button',
            replayInstruction:
              'Tap on the element described as "login button".',
            actionSummary: 'Tap login button',
            confidence: 'high',
            aiDescribe: {
              verifyPrompt: true,
              verifyPassed: true,
              deepLocate: false,
              centerDistance: 0,
              expectedCenter: [10, 20],
              actualCenter: [10, 20],
            },
          },
        },
      ],
      nextIndex: 1,
    });
    expect(describeElementAtPoint).toHaveBeenCalledWith([10, 20], {
      verifyPrompt: true,
      screenshotBase64: 'base64-image',
      coordinateSpace: 'logical',
      logicalSize: { width: 390, height: 844 },
    });
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

  test('recorder marks input aiDescribe failed when no describe capability is available', async () => {
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
            status: 'failed',
          },
        },
      ],
      nextIndex: 1,
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
            status: 'failed',
          },
        },
      ],
      nextIndex: 1,
    });
    expect(
      latestRecorderEventsBody(eventsResponse.body).events[0],
    ).not.toHaveProperty('descriptionSource');
  });

  test('recorder continues recording clicks when background aiDescribe fails', async () => {
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
            status: 'failed',
          },
        },
      ],
      nextIndex: 1,
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
    const describeElementAtPoint = vi.fn(
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
      describeElementAtPoint,
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
    expect(callOrder).toEqual(['tap', 'describe-start']);
    expect(describeElementAtPoint).toHaveBeenCalledWith([10, 20], {
      verifyPrompt: true,
      screenshotBase64: 'base64-image',
      coordinateSpace: 'logical',
      logicalSize: { width: 390, height: 844 },
    });

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
            status: 'ready',
            elementDescription: 'slow target',
          },
        },
      ],
      nextIndex: 1,
    });
  });

  test('recorder uses event before screenshot for aiDescribe when the live page changes after capture', async () => {
    const inputPrimitives = makeInputPrimitiveStub();
    const screenshotBase64 = vi
      .fn()
      .mockResolvedValueOnce('initial-screenshot')
      .mockResolvedValueOnce('event-screenshot')
      .mockResolvedValueOnce('stale-live-screenshot');
    const describeElementAtPoint = vi.fn(async () => ({
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
      describeElementAtPoint,
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

    expect(describeElementAtPoint).toHaveBeenCalledWith([10, 20], {
      verifyPrompt: true,
      screenshotBase64: 'initial-screenshot',
      coordinateSpace: 'logical',
      logicalSize: { width: 390, height: 844 },
    });

    const eventsHandler = getRouteHandler(server, 'get', '/recorder/events');
    const eventsResponse = createMockResponse();
    await eventsHandler({ query: { since: '0' } }, eventsResponse);
    expect(latestRecorderEventsBody(eventsResponse.body)).toMatchObject({
      events: [
        {
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
      ],
      nextIndex: 1,
    });
  });

  test('recorder appends aiDescribe failed metadata after unavailable background describe', async () => {
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
            status: 'failed',
          },
        },
      ],
      nextIndex: 1,
    });
    expect(
      latestRecorderEventsBody(eventsResponse.body).events[0],
    ).not.toHaveProperty('descriptionSource');
  });

  test('recorder appends navigation event when preview interact changes web url', async () => {
    let currentUrl = 'https://example.com/start';
    let currentScreenshot = 'start-screenshot';
    const inputPrimitives = makeInputPrimitiveStub({
      pointer: {
        tap: vi.fn(async () => {
          if (currentUrl.endsWith('/start')) {
            currentUrl = 'https://example.com/next';
            currentScreenshot = 'next-screenshot';
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
    expect(latestRecorderEventsBody(eventsResponse.body)).toMatchObject({
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
          screenshotBefore: 'start-screenshot',
        },
        {
          type: 'navigation',
          source: 'studio-preview',
          actionType: 'NavigationChanged',
          url: 'https://example.com/next',
          title: 'Next page',
          semantic: {
            source: 'heuristic',
            status: 'ready',
            replayInstruction:
              'Wait for navigation to complete at `https://example.com/next`.',
          },
        },
        {
          type: 'click',
          source: 'studio-preview',
          url: 'https://example.com/next',
          title: 'Next page',
          screenshotBefore: 'next-screenshot',
        },
      ],
      nextIndex: 4,
    });
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
