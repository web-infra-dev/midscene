import { z } from '@midscene/core';
import { describe, expect, test, vi } from 'vitest';
import { PlaygroundServer } from '../../src/server';

// Lightweight DeviceAction stand-ins. We build the minimal `manualInput`
// descriptor inline so server tests don't depend on the @midscene/core build
// state — the real translation is exercised by core's manual-input tests.
function tapActionStub(call = vi.fn()) {
  return {
    name: 'Tap',
    description: 'tap',
    call,
    manualInput: {
      schema: z.object({ x: z.number(), y: z.number() }),
      toParam: ({ x, y }: { x: number; y: number }) => ({
        locate: {
          center: [x, y] as [number, number],
          rect: { left: x - 4, top: y - 4, width: 8, height: 8 },
          description: 'manual Tap',
        },
      }),
    },
  };
}

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

describe('PlaygroundServer manual interaction APIs', () => {
  test('POST /interact invokes the selected action with manual params', async () => {
    const tapCall = vi.fn();
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'android',
        describe: () => 'Android device',
        actionSpace: () => [tapActionStub(tapCall)],
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
        actionSpace: () => [tapActionStub()],
      },
    } as any);

    await server.launch(6111);
    const interactHandler = getRouteHandler(server, 'post', '/interact');
    const response = createMockResponse();
    await interactHandler({ body: { actionType: 'Tap', y: 20 } }, response);

    expect(response.statusCode).toBe(400);
    // Zod surfaces the missing field path; exact wording differs across zod
    // versions, so just assert the path is mentioned.
    expect((response.body as { error: string }).error).toMatch(/^x[:.]/);
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
      error: 'Action "Tap" is not available on the current device',
    });
  });

  test('POST /interact returns 404 when the action lacks manualInput support', async () => {
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'android',
        // Real "Scroll" action shape, but without a manualInput descriptor.
        actionSpace: () => [
          { name: 'Scroll', description: 'scroll', call: vi.fn() },
        ],
      },
    } as any);

    await server.launch(6114);
    const interactHandler = getRouteHandler(server, 'post', '/interact');
    const response = createMockResponse();
    await interactHandler({ body: { actionType: 'Scroll' } }, response);

    expect(response.statusCode).toBe(404);
    expect(response.body).toMatchObject({
      error: 'Action "Scroll" does not support manual input',
    });
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
