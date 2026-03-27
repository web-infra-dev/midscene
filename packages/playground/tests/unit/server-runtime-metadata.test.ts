import { describe, expect, test } from 'vitest';
import { PlaygroundServer } from '../../src/server';

describe('PlaygroundServer runtime metadata APIs', () => {
  const createServer = () => {
    const agent = {
      interface: {
        interfaceType: 'android',
        describe: () => 'Mock Android device',
        screenshotBase64: async () => 'base64-image',
      },
    } as any;

    const server = new PlaygroundServer(agent);
    server.setPreparedPlatform({
      platformId: 'android',
      title: 'Midscene Android Playground',
      description: 'Android playground platform descriptor',
      preview: {
        kind: 'scrcpy',
        title: 'Android device preview',
        screenshotPath: '/screenshot',
        capabilities: [
          {
            kind: 'scrcpy',
            label: 'scrcpy streaming',
            live: true,
          },
        ],
        custom: {
          scrcpyPort: 6501,
        },
      },
      metadata: {
        deviceId: 'SERIAL123',
        executionUxHints: ['countdown-before-run'],
      },
    });
    return server;
  };

  test('returns runtime-info with preview and execution UX metadata', () => {
    const data = createServer().getRuntimeInfo();
    expect(data).toMatchObject({
      platformId: 'android',
      title: 'Midscene Android Playground',
      platformDescription: 'Android playground platform descriptor',
      interface: {
        type: 'android',
        description: 'Mock Android device',
      },
      preview: {
        kind: 'scrcpy',
        title: 'Android device preview',
      },
      executionUxHints: ['countdown-before-run'],
      metadata: {
        deviceId: 'SERIAL123',
      },
    });
  });

  test('keeps preview capabilities inside runtime info', () => {
    const runtimeInfo = createServer().getRuntimeInfo();
    expect(runtimeInfo.preview).toMatchObject({
      kind: 'scrcpy',
      custom: {
        scrcpyPort: 6501,
      },
    });

    expect(runtimeInfo.preview.capabilities).toMatchObject([
      {
        kind: 'scrcpy',
        live: true,
      },
    ]);
    expect(runtimeInfo.executionUxHints).toEqual(['countdown-before-run']);
    expect(runtimeInfo.interface).toMatchObject({
      type: 'android',
    });
  });

  test('updates preview and metadata when no session is active', () => {
    const server = createServer();

    server.setPreviewDescriptor({
      kind: 'screenshot',
      title: 'Desktop preview',
      screenshotPath: '/updated-screenshot',
      capabilities: [],
    });
    server.setRuntimeMetadata({
      deviceId: 'SERIAL456',
      executionUxHints: ['live-preview'],
    });

    expect(server.getRuntimeInfo()).toMatchObject({
      preview: {
        kind: 'screenshot',
        title: 'Desktop preview',
      },
      metadata: {
        deviceId: 'SERIAL456',
        sessionConnected: true,
      },
      executionUxHints: ['live-preview'],
    });
  });

  test('throws when updating prepared state while a session is active', () => {
    const server = createServer();
    (server as any)._activeConnection.session = {
      connected: true,
      displayName: 'SERIAL123',
      metadata: {
        deviceId: 'SERIAL123',
      },
    };

    expect(() =>
      server.setPreviewDescriptor({
        kind: 'none',
        title: 'No preview',
        capabilities: [],
      }),
    ).toThrowError(
      'setPreviewDescriptor cannot update prepared state while a session is active',
    );
    expect(() =>
      server.setRuntimeMetadata({
        deviceId: 'SERIAL456',
      }),
    ).toThrowError(
      'setRuntimeMetadata cannot update prepared state while a session is active',
    );
    expect(() =>
      server.setPreparedPlatform({
        platformId: 'computer',
        title: 'Midscene Computer Playground',
        description: 'Computer playground platform descriptor',
      }),
    ).toThrowError(
      'setPreparedPlatform cannot update prepared state while a session is active',
    );
  });
});
