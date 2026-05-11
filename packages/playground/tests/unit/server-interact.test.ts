import type { DeviceInputPrimitives } from '@midscene/core/device';
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

function getRouteHandler(
  server: PlaygroundServer,
  method: 'get' | 'post',
  route: string,
) {
  const calls = (server.app[method] as any).mock.calls as Array<[string, any]>;
  return calls.find(([registeredRoute]) => registeredRoute === route)?.[1];
}

function makeInputPrimitiveStub(
  overrides: Partial<DeviceInputPrimitives> = {},
): DeviceInputPrimitives {
  return {
    tap: vi.fn(async () => {}),
    doubleClick: vi.fn(async () => {}),
    longPress: vi.fn(async () => {}),
    swipe: vi.fn(async () => {}),
    dragAndDrop: vi.fn(async () => {}),
    keyboardPress: vi.fn(async () => {}),
    typeText: vi.fn(async () => {}),
    clearInput: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('PlaygroundServer manual interaction APIs', () => {
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
    expect(inputPrimitives.tap).toHaveBeenCalledWith(
      { x: 10, y: 20 },
      { duration: undefined },
    );
    expect(actionCall).not.toHaveBeenCalled();
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
    expect(inputPrimitives.swipe).toHaveBeenCalledWith(
      { x: 10, y: 20 },
      { x: 110, y: 220 },
      { duration: 500, repeat: 2 },
    );
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
    expect(inputPrimitives.tap).not.toHaveBeenCalled();
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
    const inputPrimitives = makeInputPrimitiveStub({ pinch: undefined });
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
});
