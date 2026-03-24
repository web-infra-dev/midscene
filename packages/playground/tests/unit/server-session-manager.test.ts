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

    const server = new PlaygroundServer();
    server.setPreparedPlatform({
      platformId: 'android',
      title: 'Midscene Android Playground',
      description: 'Android playground platform descriptor',
      metadata: {
        setupState: 'required',
      },
      sessionManager: {
        async getSetupSchema() {
          return {
            fields: [
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
            metadata: {
              deviceId: String(input?.deviceId || 'SERIAL123'),
            },
          };
        },
      },
    });

    await server.launch(6101);
    expect(server.getRuntimeInfo().metadata).toMatchObject({
      sessionConnected: false,
      setupState: 'required',
    });

    const postCalls = (server.app.post as any).mock.calls as Array<
      [string, any]
    >;
    const deleteCalls = (server.app.delete as any).mock.calls as Array<
      [string, any]
    >;
    const createSessionHandler = postCalls.find(
      ([route]) => route === '/session',
    )?.[1];
    const deleteSessionHandler = deleteCalls.find(
      ([route]) => route === '/session',
    )?.[1];

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

    const actionSpaceHandler = postCalls.find(
      ([route]) => route === '/action-space',
    )?.[1];
    const actionSpaceResponse = createMockResponse();
    await actionSpaceHandler({ body: {} }, actionSpaceResponse);
    expect(actionSpaceResponse.body).toHaveLength(1);
    expect(agentFactory).toHaveBeenCalledTimes(1);

    const deleteResponse = createMockResponse();
    await deleteSessionHandler({}, deleteResponse);
    expect(deleteResponse.body).toMatchObject({
      session: {
        connected: false,
        setupState: 'required',
      },
    });
  });
});
