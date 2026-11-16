import { beforeEach, describe, expect, it, rs } from '@rstest/core';

const { forkMock, child } = rs.hoisted(() => {
  const listeners = new Map<string, Array<(...args: any[]) => void>>();
  const childProcess = {
    kill: rs.fn(),
    postMessage: rs.fn(),
    on(event: string, listener: (...args: any[]) => void) {
      listeners.set(event, [...(listeners.get(event) || []), listener]);
      return this;
    },
    once(event: string, listener: (...args: any[]) => void) {
      const wrapped = (...args: any[]) => {
        listeners.set(
          event,
          (listeners.get(event) || []).filter((item) => item !== wrapped),
        );
        listener(...args);
      };
      return this.on(event, wrapped);
    },
    emit(event: string, ...args: any[]) {
      for (const listener of listeners.get(event) || []) listener(...args);
    },
  };
  return {
    child: childProcess,
    forkMock: rs.fn(() => childProcess),
  };
});

rs.mock('electron', () => ({
  utilityProcess: { fork: forkMock },
}));

import { StudioScrcpySidecarProcess } from '../src/main/playground/scrcpy-sidecar-process';

describe('StudioScrcpySidecarProcess', () => {
  beforeEach(() => {
    forkMock.mockClear();
    child.kill.mockClear();
    child.postMessage.mockReset();
    child.postMessage.mockImplementation((message: any) => {
      if (message.type === 'start') {
        queueMicrotask(() =>
          child.emit('message', { type: 'ready', port: 7002 }),
        );
      } else if (message.type === 'stop') {
        queueMicrotask(() => child.emit('exit', 0));
      }
    });
  });

  it('starts scrcpy in a utility process and forwards device state', async () => {
    const unsubscribe = rs.fn();
    const source = {
      getDevices: rs.fn(async () => [
        { id: 'device-1', name: 'Pixel', status: 'device' },
      ]),
      subscribe: rs.fn(() => unsubscribe),
    };
    const sidecar = new StudioScrcpySidecarProcess(source);
    sidecar.currentDeviceId = 'device-1';

    await sidecar.launch(7002);

    expect(forkMock).toHaveBeenCalledOnce();
    expect(child.postMessage).toHaveBeenCalledWith({
      type: 'start',
      port: 7002,
      deviceId: 'device-1',
    });
    expect(child.postMessage).toHaveBeenCalledWith({
      type: 'devices-update',
      devices: [{ id: 'device-1', name: 'Pixel', status: 'device' }],
    });

    await sidecar.close();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(child.postMessage).toHaveBeenCalledWith({ type: 'stop' });
  });
});
