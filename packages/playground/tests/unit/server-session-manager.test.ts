import { overrideAIConfig } from '@midscene/shared/env';
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
  method: 'get' | 'post' | 'delete',
  route: string,
) {
  const calls = (server.app[method] as any).mock.calls as Array<[string, any]>;
  return calls.find(([registeredRoute]) => registeredRoute === route)?.[1];
}

describe('PlaygroundServer session manager APIs', () => {
  test('supports creating and destroying a session without an initial agent', async () => {
    const agentFactory = vi.fn(async () => ({
      interface: {
        interfaceType: 'android',
        describe: () => 'Mock Android device',
        actionSpace: () => [{ name: 'Tap', description: 'tap', call: vi.fn() }],
      },
      destroy: vi.fn(),
    })) as any;
    const sidecar = {
      id: 'session-sidecar',
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
    };

    const server = new PlaygroundServer();
    server.setPreparedPlatform({
      platformId: 'android',
      title: 'Midscene Android Playground',
      description: 'Android playground platform descriptor',
      metadata: {
        setupState: 'required',
      },
      sessionManager: {
        async getSetupSchema(input) {
          return {
            fields: [
              {
                key: 'platformId',
                label: 'Platform',
                type: 'select',
                defaultValue: input?.platformId || 'android',
              },
              {
                key: 'deviceId',
                label: 'ADB device',
                type: 'select',
                required: true,
                options: [{ label: 'SERIAL123', value: 'SERIAL123' }],
                defaultValue: 'SERIAL123',
              },
            ],
          };
        },
        async listTargets() {
          return [{ id: 'SERIAL123', label: 'SERIAL123', isDefault: true }];
        },
        async createSession(input) {
          return {
            agent: await agentFactory(),
            agentFactory,
            displayName: String(input?.deviceId || 'SERIAL123'),
            platformId: 'computer',
            title: 'Midscene Computer Playground',
            platformDescription: 'Computer playground platform descriptor',
            preview: {
              kind: 'screenshot',
              title: 'Desktop preview',
              screenshotPath: '/screenshot',
              capabilities: [],
            },
            metadata: {
              deviceId: String(input?.deviceId || 'SERIAL123'),
            },
            sidecars: [sidecar],
          };
        },
      },
    });

    await server.launch(6101);
    expect(server.getRuntimeInfo().metadata).toMatchObject({
      sessionConnected: false,
      setupState: 'required',
    });

    const createSessionHandler = getRouteHandler(server, 'post', '/session');
    const deleteSessionHandler = getRouteHandler(server, 'delete', '/session');

    expect(createSessionHandler).toBeTypeOf('function');
    expect(deleteSessionHandler).toBeTypeOf('function');

    const createResponse = createMockResponse();
    await createSessionHandler(
      { body: { deviceId: 'SERIAL123' } },
      createResponse,
    );

    expect(createResponse.body).toMatchObject({
      session: {
        connected: true,
        displayName: 'SERIAL123',
      },
      runtimeInfo: {
        metadata: {
          sessionConnected: true,
          deviceId: 'SERIAL123',
        },
      },
    });
    expect(sidecar.start).toHaveBeenCalledTimes(1);

    const actionSpaceHandler = getRouteHandler(server, 'post', '/action-space');
    const actionSpaceResponse = createMockResponse();
    await actionSpaceHandler({ body: {} }, actionSpaceResponse);
    expect(actionSpaceResponse.body).toHaveLength(1);
    expect(agentFactory).toHaveBeenCalledTimes(1);
    expect(server.getRuntimeInfo()).toMatchObject({
      platformId: 'computer',
      title: 'Midscene Computer Playground',
      platformDescription: 'Computer playground platform descriptor',
      preview: {
        kind: 'screenshot',
        title: 'Desktop preview',
      },
    });

    const deleteResponse = createMockResponse();
    await deleteSessionHandler({}, deleteResponse);
    expect(deleteResponse.body).toMatchObject({
      session: {
        connected: false,
        setupState: 'required',
      },
    });
    expect(server.getRuntimeInfo()).toMatchObject({
      platformId: 'android',
      title: 'Midscene Android Playground',
      preview: {
        kind: 'none',
      },
    });
    expect(sidecar.stop).toHaveBeenCalledTimes(1);
  });

  test('returns 409 without logging an error when screenshot is requested without a session', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const server = new PlaygroundServer();
    server.setPreparedPlatform({
      platformId: 'computer',
      title: 'Midscene Computer Playground',
      description: 'Computer playground platform descriptor',
      preview: {
        kind: 'screenshot',
        title: 'Desktop preview',
        screenshotPath: '/screenshot',
        capabilities: [],
      },
      metadata: {
        sessionConnected: false,
        setupState: 'required',
      },
      sessionManager: {
        async createSession() {
          throw new Error('not needed');
        },
      },
    });

    await server.launch(6105);
    const screenshotHandler = getRouteHandler(server, 'get', '/screenshot');
    expect(screenshotHandler).toBeTypeOf('function');

    const response = createMockResponse();
    await screenshotHandler({}, response);

    expect(response.statusCode).toBe(409);
    expect(response.body).toMatchObject({
      error: 'Failed to take screenshot: No active session',
    });
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  test('stops started sidecars and restores base runtime when session creation fails after apply', async () => {
    const sidecar = {
      id: 'session-sidecar',
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
    };
    const server = new PlaygroundServer();
    const recreateError = new Error('agent recreate failed');

    server.setPreparedPlatform({
      platformId: 'android',
      title: 'Midscene Android Playground',
      description: 'Android playground platform descriptor',
      preview: {
        kind: 'none',
        title: 'No preview',
        capabilities: [],
      },
      metadata: {
        setupState: 'required',
      },
      sessionManager: {
        async createSession() {
          return {
            agentFactory: vi.fn(async () => ({
              interface: {
                interfaceType: 'android',
                describe: () => 'Mock Android device',
              },
            })),
            displayName: 'SERIAL123',
            platformId: 'computer',
            title: 'Midscene Computer Playground',
            platformDescription: 'Computer playground platform descriptor',
            metadata: {
              deviceId: 'SERIAL123',
            },
            sidecars: [sidecar],
          };
        },
      },
    });

    await server.launch(6102);
    (server as any)._configDirty = true;
    vi.spyOn(server as any, 'recreateAgent').mockRejectedValue(recreateError);

    const createSessionHandler = getRouteHandler(server, 'post', '/session');
    expect(createSessionHandler).toBeTypeOf('function');

    const createResponse = createMockResponse();
    await createSessionHandler(
      { body: { deviceId: 'SERIAL123' } },
      createResponse,
    );

    expect(createResponse.statusCode).toBe(400);
    expect(createResponse.body).toMatchObject({
      error: 'agent recreate failed',
    });
    expect(sidecar.start).toHaveBeenCalledTimes(1);
    expect(sidecar.stop).toHaveBeenCalledTimes(1);
    expect(server.getSessionInfo()).toMatchObject({
      connected: false,
      setupState: 'required',
    });
    expect(server.getRuntimeInfo()).toMatchObject({
      platformId: 'android',
      title: 'Midscene Android Playground',
      preview: {
        kind: 'none',
      },
      metadata: {
        sessionConnected: false,
        setupState: 'required',
      },
    });
  });

  test('returns the original session creation error when sidecar cleanup fails', async () => {
    const sidecar = {
      id: 'session-sidecar',
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {
        throw new Error('sidecar stop failed');
      }),
    };
    const server = new PlaygroundServer();

    server.setPreparedPlatform({
      platformId: 'android',
      title: 'Midscene Android Playground',
      description: 'Android playground platform descriptor',
      metadata: {
        setupState: 'required',
      },
      sessionManager: {
        async createSession() {
          return {
            agentFactory: vi.fn(async () => ({
              interface: {
                interfaceType: 'android',
                describe: () => 'Mock Android device',
              },
            })),
            displayName: 'SERIAL123',
            metadata: {
              deviceId: 'SERIAL123',
            },
            sidecars: [sidecar],
          };
        },
      },
    });

    await server.launch(6103);
    (server as any)._configDirty = true;
    vi.spyOn(server as any, 'recreateAgent').mockRejectedValue(
      new Error('agent recreate failed'),
    );

    const createSessionHandler = getRouteHandler(server, 'post', '/session');
    expect(createSessionHandler).toBeTypeOf('function');

    const createResponse = createMockResponse();
    await createSessionHandler(
      { body: { deviceId: 'SERIAL123' } },
      createResponse,
    );

    expect(createResponse.statusCode).toBe(400);
    expect(createResponse.body).toMatchObject({
      error: 'agent recreate failed',
    });
    expect(sidecar.start).toHaveBeenCalledTimes(1);
    expect(sidecar.stop).toHaveBeenCalledTimes(1);
    expect(server.getSessionInfo().connected).toBe(false);
  });

  test('applies config without marking it dirty when no active agent exists', async () => {
    const server = new PlaygroundServer();

    await server.launch(6106);
    const configHandler = getRouteHandler(server, 'post', '/config');
    expect(configHandler).toBeTypeOf('function');

    const response = createMockResponse();
    await configHandler(
      {
        body: {
          aiConfig: {
            MIDSCENE_MODEL_NAME: 'gpt-4o-mini',
          },
        },
      },
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      message: 'AI config updated. New sessions will use it immediately.',
    });
    expect(vi.mocked(overrideAIConfig)).toHaveBeenCalledWith({
      MIDSCENE_MODEL_NAME: 'gpt-4o-mini',
    });
    expect((server as any)._configDirty).toBe(false);
  });

  test('skips dirty recreation for identical config payloads', async () => {
    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'android',
        describe: () => 'Mock Android device',
      },
      destroy: vi.fn(async () => {}),
    } as any);

    await server.launch(6107);
    const configHandler = getRouteHandler(server, 'post', '/config');
    expect(configHandler).toBeTypeOf('function');

    const firstResponse = createMockResponse();
    await configHandler(
      {
        body: {
          aiConfig: {
            MIDSCENE_MODEL_NAME: 'gpt-4o-mini',
          },
        },
      },
      firstResponse,
    );
    expect(firstResponse.statusCode).toBe(200);
    expect((server as any)._configDirty).toBe(true);

    (server as any)._configDirty = false;

    const secondResponse = createMockResponse();
    await configHandler(
      {
        body: {
          aiConfig: {
            MIDSCENE_MODEL_NAME: 'gpt-4o-mini',
          },
        },
      },
      secondResponse,
    );

    expect(secondResponse.statusCode).toBe(200);
    expect(secondResponse.body).toMatchObject({
      status: 'ok',
      message: 'AI config not changed because it is identical to current',
    });
    expect(vi.mocked(overrideAIConfig)).toHaveBeenCalledTimes(1);
    expect((server as any)._configDirty).toBe(false);
  });
});
