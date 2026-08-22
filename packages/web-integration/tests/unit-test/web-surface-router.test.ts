import { WebSurfaceRouter } from '@/common/web-surface-router';
import { describe, expect, it, vi } from 'vitest';

type TestSurface = {
  id: string;
};

function createDeferred<Value>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('WebSurfaceRouter', () => {
  it('routes operations to the active surface', async () => {
    const router = new WebSurfaceRouter<TestSurface>();
    const virtualSurface = { id: 'alert' };

    await expect(
      router.routeObservation({
        real: () => 'real screenshot',
        virtual: (surface) => `${surface.id} screenshot`,
      }),
    ).resolves.toBe('real screenshot');

    const virtualLease = router.activateVirtualSurface(virtualSurface);
    await expect(
      router.routeObservation({
        real: () => 'real screenshot',
        virtual: (surface) => `${surface.id} screenshot`,
      }),
    ).resolves.toBe('alert screenshot');

    const resumingLease = router.beginResuming(virtualLease);
    await expect(
      router.routeAction({
        real: () => 'real action',
        virtual: () => 'virtual action',
      }),
    ).resolves.toBe('virtual action');
    await expect(
      router.routeAction({
        real: () => 'real action',
        virtual: () => 'virtual action',
        resuming: () => 'resuming action',
      }),
    ).resolves.toBe('resuming action');

    router.finishResuming(resumingLease);
    expect(router.getState().mode).toBe('real');
  });

  it('keeps a lease bound to the surface where the operation started', async () => {
    const router = new WebSurfaceRouter<TestSurface>();
    const virtualLease = router.activateVirtualSurface({ id: 'alert' });
    router.beginResuming(virtualLease);

    await expect(
      router.routeAction(
        {
          real: () => 'real',
          virtual: (surface) => surface.id,
          resuming: () => 'resuming',
        },
        virtualLease,
      ),
    ).resolves.toBe('alert');
    expect(router.isCurrentLease(virtualLease)).toBe(false);
  });

  it('waits for virtual surface activation', async () => {
    const router = new WebSurfaceRouter<TestSurface>();
    const waiting = router.waitForVirtualActivation();

    const activatedLease = router.activateVirtualSurface({ id: 'alert' });

    await expect(waiting).resolves.toEqual(activatedLease);
    await expect(router.waitForVirtualActivation()).resolves.toEqual(
      activatedLease,
    );
  });

  it('interrupts a pending real operation when a virtual surface activates', async () => {
    const router = new WebSurfaceRouter<TestSurface>();
    const operation = createDeferred<string>();
    const operationStarted = vi.fn();

    const running = router.runInterruptibleRealOperation(async () => {
      operationStarted();
      return await operation.promise;
    });
    await vi.waitFor(() => expect(operationStarted).toHaveBeenCalledOnce());

    const virtualLease = router.activateVirtualSurface({ id: 'alert' });
    await expect(running).resolves.toEqual({
      status: 'interrupted',
      lease: virtualLease,
    });
    expect(router.interruptedRealOperationCount).toBe(1);

    const resumingLease = router.beginResuming(virtualLease);
    expect(() => router.finishResuming(resumingLease)).toThrow(
      'before interrupted real operations have settled',
    );

    operation.resolve('clicked');
    await router.waitForInterruptedRealOperations();
    expect(router.interruptedRealOperationCount).toBe(0);

    router.finishResuming(resumingLease);
    expect(router.getState().mode).toBe('real');
  });

  it('returns the result of a real operation that completes normally', async () => {
    const router = new WebSurfaceRouter<TestSurface>();

    await expect(
      router.runInterruptibleRealOperation(async () => 'clicked'),
    ).resolves.toEqual({
      status: 'completed',
      value: 'clicked',
      lease: {
        mode: 'real',
        epoch: 0,
      },
    });

    router.activateVirtualSurface({ id: 'later-alert' });
    expect(router.interruptedRealOperationCount).toBe(0);
  });

  it('propagates failures from interrupted real operations', async () => {
    const router = new WebSurfaceRouter<TestSurface>();
    const operation = createDeferred<void>();
    const operationStarted = vi.fn();

    const running = router.runInterruptibleRealOperation(async () => {
      operationStarted();
      return await operation.promise;
    });
    await vi.waitFor(() => expect(operationStarted).toHaveBeenCalledOnce());

    const virtualLease = router.activateVirtualSurface({ id: 'alert' });
    await expect(running).resolves.toMatchObject({ status: 'interrupted' });
    router.beginResuming(virtualLease);

    operation.reject(new Error('real click failed'));
    await expect(router.waitForInterruptedRealOperations()).rejects.toThrow(
      'Interrupted real web operation failed',
    );
    expect(router.interruptedRealOperationCount).toBe(0);
  });

  it('rejects stale transitions', () => {
    const router = new WebSurfaceRouter<TestSurface>();
    const virtualLease = router.activateVirtualSurface({ id: 'alert' });
    const resumingLease = router.beginResuming(virtualLease);

    expect(() => router.finishResuming(virtualLease)).toThrow(
      'Stale web surface transition',
    );

    router.finishResuming(resumingLease);
  });

  it('allows a new virtual surface to replace the resuming surface', () => {
    const router = new WebSurfaceRouter<TestSurface>();
    const firstLease = router.activateVirtualSurface({ id: 'first-alert' });
    router.beginResuming(firstLease);

    const secondLease = router.activateVirtualSurface({ id: 'second-alert' });

    expect(secondLease).toMatchObject({
      mode: 'virtual',
      virtualSurface: { id: 'second-alert' },
    });
    expect(() => router.activateVirtualSurface({ id: 'third-alert' })).toThrow(
      'another virtual surface is active',
    );
  });

  it('does not start real operations while virtual routing is active', async () => {
    const router = new WebSurfaceRouter<TestSurface>();
    router.activateVirtualSurface({ id: 'alert' });

    await expect(
      router.runInterruptibleRealOperation(async () => 'clicked'),
    ).rejects.toThrow('while the virtual surface is active');
  });
});
