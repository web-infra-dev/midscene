import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from '@rstest/core';
import {
  loadDefinition,
  parseDeviceOptions,
  parseFlags,
} from '../../src/cli-utils';
import {
  ConnectClient,
  RemoteDevice,
  agentOverConnectProtocol,
} from '../../src/client';
import { serveDevice } from '../../src/server';

const fixture = resolve(__dirname, '../fixtures/mock-device.mjs');
const calls = () => (globalThis as any).__mockDeviceCalls as unknown[][];

describe('serve + remote device', () => {
  let served: Awaited<ReturnType<typeof serveDevice>>;
  let device: RemoteDevice;

  beforeAll(async () => {
    const definition = await loadDefinition(fixture);
    served = await serveDevice(definition, {
      port: 0,
      options: parseDeviceOptions(
        definition,
        parseFlags(['--width', '640', '--height=480']).flags,
      ),
    });
    device = await RemoteDevice.connect({ url: served.url });
  });
  afterAll(async () => {
    await served?.close();
  });

  it('rebuilds the action space from primitives and custom actions', () => {
    const names = device.actionSpace().map((a) => a.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'Tap',
        'LongPress',
        'Input',
        'KeyboardPress',
        'Swipe',
        'HomeButton',
        'wakeVoiceAssistant',
      ]),
    );
    expect(names).not.toContain('DoubleClick');
  });

  it('reports screen size from the screenshot', async () => {
    expect(await device.size()).toEqual({ width: 640, height: 480 });
    expect(await device.screenshotBase64()).toMatch(/^data:image\/png;base64,/);
  });

  it('forwards built-in actions to device primitives', async () => {
    const action = (name: string) =>
      device.actionSpace().find((a) => a.name === name)!;
    const locate = {
      description: 'btn',
      center: [100, 50] as [number, number],
      rect: { left: 90, top: 40, width: 20, height: 20 },
    };
    await action('Tap').call({ locate });
    await action('HomeButton').call(undefined);
    await device.inputPrimitives.keyboard!.typeText('hello', {
      replace: true,
      target: {},
    });
    expect(calls()).toEqual(
      expect.arrayContaining([
        ['tap', { x: 100, y: 50 }, {}],
        ['homeButton'],
        ['typeText', 'hello', { replace: true }],
      ]),
    );
  });

  it('calls custom actions with wire params and returns results', async () => {
    const action = device
      .actionSpace()
      .find((a) => a.name === 'wakeVoiceAssistant')!;
    const result = await action.call({
      phrase: 'hi',
      target: {
        description: 'mic',
        center: [1, 2],
        rect: { left: 0, top: 0, width: 2, height: 4 },
        extra: true,
      },
    });
    expect(result).toEqual({ heard: 'hi' });
    expect(calls().at(-1)).toEqual([
      'wakeVoiceAssistant',
      {
        phrase: 'hi',
        target: {
          description: 'mic',
          center: [1, 2],
          rect: { left: 0, top: 0, width: 2, height: 4 },
        },
      },
    ]);
  });

  it('rejects invalid bodies with 400', async () => {
    const client = new ConnectClient({ url: served.url });
    await expect(
      client.request('POST', '/primitives/tap', { point: { x: 1 } }),
    ).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_REQUEST',
    });
    await expect(
      client.request('POST', '/primitives/pinch', {}),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('serves OpenAPI for primitives and custom actions', async () => {
    const res = await fetch(`${served.url}/api/openapi.json`);
    const spec = await res.json();
    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining([
        '/api/info',
        '/api/primitives/tap',
        '/api/actions/wakeVoiceAssistant',
      ]),
    );
    expect((await fetch(`${served.url}/api/docs/`)).status).toBe(200);
  });

  it('injects the device description into the agent aiAct context', async () => {
    const agent = await agentOverConnectProtocol({ url: served.url });
    expect((agent as any).opts.aiContexts.aiAct).toBe(
      'A fake touchscreen used for testing',
    );
    await agent.destroy();
  });
});

describe('serve options', () => {
  it('rejects unknown and invalid device options', async () => {
    const definition = await loadDefinition(fixture);
    expect(() => parseDeviceOptions(definition, { color: 'red' })).toThrow(
      /Unknown option --color/,
    );
    await expect(
      serveDevice(definition, { port: 0, options: { width: 0 } }),
    ).rejects.toThrow(/>= 1/);
  });

  it('requires a token when exposed beyond loopback', async () => {
    const definition = await loadDefinition(fixture);
    const served = await serveDevice(definition, { port: 0, host: '0.0.0.0' });
    try {
      expect(served.token).toBeTruthy();
      const url = served.url.replace('0.0.0.0', '127.0.0.1');
      await expect(new ConnectClient({ url }).info()).rejects.toMatchObject({
        status: 401,
      });
      expect(
        (await new ConnectClient({ url, token: served.token }).info()).name,
      ).toBe('Mock Screen');
    } finally {
      await served.close();
    }
  });
});
