import { once } from 'node:events';
import type { ComputerInputPrimitives } from '@midscene/core/device';
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';
import WebSocket from 'ws';
import { RemoteComputerDevice } from '../../src/remote/device';
import {
  type ComputerBridgeServer,
  createComputerBridgeServer,
} from '../../src/remote/server';

const token = 'bridge-integration-test-secret';
const image =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
const createDevice = () => ({
  connect: rs.fn(async () => {}),
  destroy: rs.fn(async () => {}),
  size: rs.fn(async () => ({ width: 1280, height: 800, dpr: 2 })),
  screenshotBase64: rs.fn(async () => image),
  inputPrimitives: {
    pointer: {
      tap: rs.fn<ComputerInputPrimitives['pointer']['tap']>(async () => {}),
      doubleClick: rs.fn(async () => {}),
      rightClick: rs.fn(async () => {}),
      hover: rs.fn(async () => {}),
      dragAndDrop: rs.fn(async () => {}),
      swipe: rs.fn(async () => {}),
    },
    keyboard: {
      typeText: rs.fn(async () => {}),
      keyboardPress: rs.fn(async () => {}),
      clearInput: rs.fn(async () => {}),
    },
    scroll: { scroll: rs.fn(async () => {}) },
  },
});

describe('computer bridge over real WebSocket transport', () => {
  let device: ReturnType<typeof createDevice>;
  let server: ComputerBridgeServer;
  let factory: ReturnType<typeof rs.fn>;
  let clients: RemoteComputerDevice[];
  beforeEach(async () => {
    device = createDevice();
    clients = [];
    factory = rs.fn(() => device);
    server = await createComputerBridgeServer(
      { token, port: 0, targetId: 'leased-mac' },
      factory,
    );
  });
  afterEach(async () => {
    await Promise.all(clients.map((client) => client.destroy()));
    await server.close();
  });
  const client = (options = {}) => {
    const result = new RemoteComputerDevice({
      url: server.url,
      token,
      ...options,
    });
    clients.push(result);
    return result;
  };

  it('binds the target, forwards screenshots/geometry and all input primitives', async () => {
    const remote = client({ displayId: '2', inputStrategy: 'sequential' });
    await remote.connect();
    expect(factory).toHaveBeenCalledWith({
      displayId: '2',
      inputStrategy: 'sequential',
    });
    expect(remote.connectionInfo).toMatchObject({
      targetId: 'leased-mac',
      displayId: '2',
      protocolVersion: 1,
    });
    expect(await remote.size()).toEqual({ width: 1280, height: 800, dpr: 2 });
    expect(await remote.screenshotBase64()).toBe(image);
    await remote.inputPrimitives.pointer.tap({ x: 25, y: 40 });
    await remote.inputPrimitives.pointer.doubleClick({ x: 1, y: 2 });
    await remote.inputPrimitives.pointer.rightClick({ x: 3, y: 4 });
    await remote.inputPrimitives.pointer.hover({ x: 5, y: 6 });
    await remote.inputPrimitives.pointer.dragAndDrop(
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    );
    await remote.inputPrimitives.pointer.swipe!({ x: 2, y: 3 }, { x: 4, y: 5 });
    await remote.inputPrimitives.keyboard.typeText('中文🙂', {
      replace: false,
    });
    await remote.inputPrimitives.keyboard.keyboardPress('Meta+A');
    await remote.inputPrimitives.keyboard.clearInput();
    await remote.inputPrimitives.scroll.scroll({
      direction: 'down',
      distance: 120,
      scrollType: 'singleAction',
    });
    expect(device.inputPrimitives.pointer.tap).toHaveBeenCalledWith(
      { x: 25, y: 40 },
      {},
    );
    expect(device.inputPrimitives.keyboard.typeText).toHaveBeenCalledWith(
      '中文🙂',
      { replace: false },
    );
    expect(device.inputPrimitives.keyboard.keyboardPress).toHaveBeenCalledWith(
      'Meta+A',
      {},
    );
    expect(remote.actionSpace().some((action) => action.name === 'Input')).toBe(
      true,
    );
    await remote.destroy();
    await remote.destroy();
    expect(device.destroy).toHaveBeenCalledTimes(1);
  });

  it('does not serialize connection credentials or propagate model configuration', async () => {
    const remote = client();
    await remote.connect();
    expect(JSON.stringify(remote)).not.toContain(token);
    expect(remote.describe()).not.toContain(token);
    expect(remote.uri).not.toContain(token);
    expect(Object.keys(factory.mock.calls[0][0])).toEqual([]);
  });

  it('rejects authentication before constructing any native Device', async () => {
    const remote = client({ token: 'wrong-bridge-secret' });
    await expect(remote.connect()).rejects.toThrow('authentication failed');
    expect(factory).not.toHaveBeenCalled();
  });

  it('cleans half-initialized Devices when connect fails', async () => {
    device.connect.mockRejectedValueOnce(
      new Error('screen permission unavailable'),
    );
    await expect(client().connect()).rejects.toThrow(
      'screen permission unavailable',
    );
    await server.close();
    expect(device.destroy).toHaveBeenCalledTimes(1);
  });

  it('checks the actual target OS, then cleans up on mismatch', async () => {
    const wrongOS = process.platform === 'darwin' ? 'linux' : 'macos';
    await expect(client({ expectedOS: wrongOS }).connect()).rejects.toThrow(
      'Expected',
    );
    expect(device.destroy).toHaveBeenCalledTimes(1);
  });

  it('serializes concurrent input requests in transport order', async () => {
    const remote = client();
    await remote.connect();
    const order: number[] = [];
    device.inputPrimitives.pointer.tap.mockImplementation(
      async (point: { x: number }) => {
        await new Promise((resolve) =>
          setTimeout(resolve, point.x === 1 ? 20 : 0),
        );
        order.push(point.x);
      },
    );
    await Promise.all(
      [1, 2, 3].map((x) => remote.inputPrimitives.pointer.tap({ x, y: 0 })),
    );
    expect(order).toEqual([1, 2, 3]);
  });

  it('cancels active native work and drains it before disconnect acknowledgement', async () => {
    const remote = client();
    await remote.connect();
    let started!: () => void;
    let cancel!: (error: Error) => void;
    const running = new Promise<void>((resolve) => {
      started = resolve;
    });
    device.inputPrimitives.pointer.tap.mockImplementation(
      () =>
        new Promise<void>((_, reject) => {
          cancel = reject;
          started();
        }),
    );
    device.destroy.mockImplementation(async () => {
      cancel(new Error('native input cancelled'));
    });
    const action = remote.inputPrimitives.pointer.tap({ x: 1, y: 2 });
    const rejected = expect(action).rejects.toThrow('native input cancelled');
    await running;
    await remote.destroy();
    await rejected;
    expect(device.destroy).toHaveBeenCalledTimes(1);
    await expect(
      remote.inputPrimitives.pointer.tap({ x: 1, y: 2 }),
    ).rejects.toThrow('not connected');
  });

  it('rejects invalid input before it reaches the native driver', async () => {
    const remote = client();
    await remote.connect();
    await expect(
      remote.inputPrimitives.pointer.tap({ x: Number.NaN, y: 0 }),
    ).rejects.toThrow();
    expect(device.inputPrimitives.pointer.tap).not.toHaveBeenCalled();
    // Invalid requests do not poison the active connection.
    expect(await remote.size()).toMatchObject({ width: 1280 });
  });

  it('forwards only coordinates from target objects, including cyclic UI metadata', async () => {
    const remote = client();
    await remote.connect();
    const target: Record<string, unknown> = { center: [15, 25] };
    target.node = target;
    await remote.inputPrimitives.keyboard.keyboardPress('Enter', { target });
    expect(device.inputPrimitives.keyboard.keyboardPress).toHaveBeenCalledWith(
      'Enter',
      { target: { center: [15, 25] } },
    );
  });

  it('times out once, closes the session and does not replay an operation', async () => {
    const remote = client({ timeoutMs: 200 });
    await remote.connect();
    let complete!: () => void;
    device.screenshotBase64.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          complete = () => resolve(image);
        }),
    );
    device.destroy.mockImplementation(async () => complete());
    await expect(remote.screenshotBase64()).rejects.toThrow('timed out');
    await server.close();
    expect(device.screenshotBase64).toHaveBeenCalledTimes(1);
    expect(device.destroy).toHaveBeenCalledTimes(1);
  });

  it('does not replay completed request IDs', async () => {
    const socket = new WebSocket(server.url);
    await once(socket, 'open');
    socket.send(
      JSON.stringify({
        version: 1,
        id: '1',
        method: 'hello',
        params: { token, options: {} },
      }),
    );
    await once(socket, 'message');
    const request = JSON.stringify({
      version: 1,
      id: '2',
      method: 'input',
      params: { action: 'tap', point: { x: 1, y: 2 } },
    });
    socket.send(request);
    await once(socket, 'message');
    socket.send(request);
    await once(socket, 'close');
    expect(device.inputPrimitives.pointer.tap).toHaveBeenCalledTimes(1);
  });

  it('rejects unknown protocol versions without allocating a Device', async () => {
    const socket = new WebSocket(server.url);
    await once(socket, 'open');
    socket.send(
      JSON.stringify({
        version: 999,
        id: '1',
        method: 'hello',
        params: { token, options: {} },
      }),
    );
    const [code] = await once(socket, 'close');
    expect(code).toBe(1008);
    expect(factory).not.toHaveBeenCalled();
  });
});
