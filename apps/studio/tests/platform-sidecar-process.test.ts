import { afterEach, describe, expect, it, vi } from 'vitest';

const { forkMock, children } = vi.hoisted(() => {
  const createdChildren: any[] = [];
  const createChild = () => {
    const listeners = new Map<string, Array<(...args: any[]) => void>>();
    const child = {
      kill: vi.fn(),
      postMessage: vi.fn(),
      on(event: string, listener: (...args: any[]) => void) {
        listeners.set(event, [...(listeners.get(event) || []), listener]);
        return child;
      },
      once(event: string, listener: (...args: any[]) => void) {
        const wrapped = (...args: any[]) => {
          listeners.set(
            event,
            (listeners.get(event) || []).filter((item) => item !== wrapped),
          );
          listener(...args);
        };
        return child.on(event, wrapped);
      },
      emit(event: string, ...args: any[]) {
        for (const listener of [...(listeners.get(event) || [])]) {
          listener(...args);
        }
      },
    };
    createdChildren.push(child);
    return child;
  };
  return {
    children: createdChildren,
    forkMock: vi.fn(createChild),
  };
});

vi.mock('electron', () => ({
  utilityProcess: { fork: forkMock },
}));

import { PlatformSidecarProcess } from '../src/main/playground/platform-sidecar-process';

type StartMessage = { type: 'start' };
type WorkerMessage = { type: 'ready' } | { type: 'error'; message: string };
type CommandMessage = { type: 'stop' };

function createSidecar(startTimeoutMs = 20_000) {
  return new PlatformSidecarProcess<
    StartMessage,
    WorkerMessage,
    CommandMessage
  >({
    serviceName: 'test-sidecar',
    workerPath: '/tmp/test-worker.cjs',
    startTimeoutMs,
    stopMessage: { type: 'stop' },
    isReadyMessage: (message) => message.type === 'ready',
    getErrorMessage: (message) =>
      message.type === 'error' ? message.message : undefined,
  });
}

afterEach(() => {
  vi.useRealTimers();
  children.length = 0;
  forkMock.mockClear();
});

describe('PlatformSidecarProcess', () => {
  it('kills a worker that reports a startup error', async () => {
    const sidecar = createSidecar();
    const startPromise = sidecar.start({ type: 'start' });
    const child = children[0];

    child.emit('message', { type: 'error', message: 'bind failed' });

    await expect(startPromise).rejects.toThrow('bind failed');
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it('kills a worker when startup times out', async () => {
    vi.useFakeTimers();
    const sidecar = createSidecar(50);
    const startPromise = sidecar.start({ type: 'start' });
    const rejection =
      expect(startPromise).rejects.toThrow('Timed out starting');
    const child = children[0];

    await vi.advanceTimersByTimeAsync(50);

    await rejection;
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it('waits for the worker to exit during stop', async () => {
    const sidecar = createSidecar();
    const startPromise = sidecar.start({ type: 'start' });
    const child = children[0];
    child.emit('message', { type: 'ready' });
    await startPromise;

    let stopped = false;
    const stopPromise = sidecar.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    expect(child.postMessage).toHaveBeenCalledWith({ type: 'stop' });

    child.emit('exit', 0);
    await stopPromise;
    expect(stopped).toBe(true);
  });

  it('restarts a worker that exits after becoming ready', async () => {
    vi.useFakeTimers();
    const sidecar = createSidecar();
    const startPromise = sidecar.start({ type: 'start' });
    const firstChild = children[0];
    firstChild.emit('message', { type: 'ready' });
    await startPromise;

    firstChild.emit('exit', 1);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(forkMock).toHaveBeenCalledTimes(2);
    const restartedChild = children[1];
    expect(restartedChild.postMessage).toHaveBeenCalledWith({ type: 'start' });
    restartedChild.emit('message', { type: 'ready' });

    const stopPromise = sidecar.stop();
    restartedChild.emit('exit', 0);
    await stopPromise;
  });
});
