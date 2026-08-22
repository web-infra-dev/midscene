export type WebSurfaceMode = 'real' | 'virtual' | 'resuming';

export type WebSurfaceLease<VirtualSurface> = Readonly<{
  mode: WebSurfaceMode;
  epoch: number;
  virtualSurface?: VirtualSurface;
}>;

export type WebSurfaceState<VirtualSurface> =
  | Readonly<{
      mode: 'real';
      epoch: number;
    }>
  | Readonly<{
      mode: 'virtual' | 'resuming';
      epoch: number;
      virtualSurface: VirtualSurface;
    }>;

export type WebSurfaceRoute<VirtualSurface, Result> = {
  real: (lease: WebSurfaceLease<VirtualSurface>) => Result | Promise<Result>;
  virtual: (
    surface: VirtualSurface,
    lease: WebSurfaceLease<VirtualSurface>,
  ) => Result | Promise<Result>;
  resuming?: (
    surface: VirtualSurface,
    lease: WebSurfaceLease<VirtualSurface>,
  ) => Result | Promise<Result>;
};

export type InterruptibleWebOperationResult<VirtualSurface, Result> =
  | {
      status: 'completed';
      value: Result;
      lease: WebSurfaceLease<VirtualSurface>;
    }
  | {
      status: 'interrupted';
      lease: WebSurfaceLease<VirtualSurface>;
    };

type VirtualActivationWaiter<VirtualSurface> = {
  afterEpoch: number;
  resolve: (lease: WebSurfaceLease<VirtualSurface>) => void;
};

/**
 * Routes web observations and actions between the real page and a temporary
 * virtual surface. Transitions are synchronous and versioned so callers can
 * retain an immutable lease for the lifetime of one operation.
 */
export class WebSurfaceRouter<VirtualSurface> {
  private epoch = 0;

  private state: WebSurfaceState<VirtualSurface> = {
    mode: 'real',
    epoch: this.epoch,
  };

  private readonly virtualActivationWaiters = new Set<
    VirtualActivationWaiter<VirtualSurface>
  >();

  private readonly interruptedRealOperations = new Set<Promise<unknown>>();

  getState(): WebSurfaceState<VirtualSurface> {
    return this.state;
  }

  acquireLease(): WebSurfaceLease<VirtualSurface> {
    return this.state;
  }

  isVirtualOrResuming(): boolean {
    return this.state.mode !== 'real';
  }

  isCurrentLease(lease: WebSurfaceLease<VirtualSurface>): boolean {
    return lease.epoch === this.state.epoch && lease.mode === this.state.mode;
  }

  get interruptedRealOperationCount(): number {
    return this.interruptedRealOperations.size;
  }

  activateVirtualSurface(
    virtualSurface: VirtualSurface,
  ): WebSurfaceLease<VirtualSurface> {
    if (this.state.mode === 'virtual') {
      throw new Error(
        '[midscene] Cannot activate a virtual web surface while another virtual surface is active.',
      );
    }

    this.state = {
      mode: 'virtual',
      epoch: this.nextEpoch(),
      virtualSurface,
    };

    const lease = this.acquireLease();
    this.resolveVirtualActivationWaiters(lease);
    return lease;
  }

  beginResuming(
    expectedLease?: WebSurfaceLease<VirtualSurface>,
  ): WebSurfaceLease<VirtualSurface> {
    this.assertState('virtual', expectedLease);
    if (this.state.mode !== 'virtual') {
      throw new Error(
        `[midscene] Expected web surface state "virtual", but current state is "${this.state.mode}".`,
      );
    }
    const virtualSurface = this.state.virtualSurface;
    this.state = {
      mode: 'resuming',
      epoch: this.nextEpoch(),
      virtualSurface,
    };
    return this.acquireLease();
  }

  finishResuming(
    expectedLease?: WebSurfaceLease<VirtualSurface>,
  ): WebSurfaceLease<VirtualSurface> {
    this.assertState('resuming', expectedLease);
    if (this.interruptedRealOperations.size > 0) {
      throw new Error(
        '[midscene] Cannot finish resuming the real web surface before interrupted real operations have settled.',
      );
    }

    this.state = {
      mode: 'real',
      epoch: this.nextEpoch(),
    };
    return this.acquireLease();
  }

  resetToReal(
    expectedLease?: WebSurfaceLease<VirtualSurface>,
  ): WebSurfaceLease<VirtualSurface> {
    if (expectedLease && !this.isCurrentLease(expectedLease)) {
      throw this.staleTransitionError(expectedLease);
    }

    if (this.interruptedRealOperations.size > 0) {
      throw new Error(
        '[midscene] Cannot reset to the real web surface before interrupted real operations have settled.',
      );
    }
    this.state = {
      mode: 'real',
      epoch: this.nextEpoch(),
    };
    return this.acquireLease();
  }

  route<Result>(
    handlers: WebSurfaceRoute<VirtualSurface, Result>,
    lease: WebSurfaceLease<VirtualSurface> = this.acquireLease(),
  ): Promise<Result> {
    if (lease.mode === 'real') {
      return Promise.resolve().then(() => handlers.real(lease));
    }

    if (!lease.virtualSurface) {
      throw new Error(
        `[midscene] Missing virtual web surface for ${lease.mode} lease at epoch ${lease.epoch}.`,
      );
    }
    const virtualSurface = lease.virtualSurface;

    if (lease.mode === 'resuming' && handlers.resuming) {
      return Promise.resolve().then(() =>
        handlers.resuming!(virtualSurface, lease),
      );
    }

    return Promise.resolve().then(() =>
      handlers.virtual(virtualSurface, lease),
    );
  }

  routeObservation<Result>(
    handlers: WebSurfaceRoute<VirtualSurface, Result>,
    lease?: WebSurfaceLease<VirtualSurface>,
  ): Promise<Result> {
    return this.route(handlers, lease);
  }

  routeAction<Result>(
    handlers: WebSurfaceRoute<VirtualSurface, Result>,
    lease?: WebSurfaceLease<VirtualSurface>,
  ): Promise<Result> {
    return this.route(handlers, lease);
  }

  waitForVirtualActivation(
    afterEpoch?: number,
  ): Promise<WebSurfaceLease<VirtualSurface>> {
    const threshold =
      afterEpoch ??
      (this.state.mode === 'virtual' ? this.state.epoch - 1 : this.state.epoch);
    const waiter = this.createVirtualActivationWaiter(threshold);
    return waiter.promise;
  }

  async runInterruptibleRealOperation<Result>(
    operation: () => Result | Promise<Result>,
    startLease: WebSurfaceLease<VirtualSurface> = this.acquireLease(),
  ): Promise<InterruptibleWebOperationResult<VirtualSurface, Result>> {
    if (startLease.mode !== 'real') {
      throw new Error(
        `[midscene] Cannot start a real web operation while the ${startLease.mode} surface is active.`,
      );
    }

    if (!this.isCurrentLease(startLease)) {
      return {
        status: 'interrupted',
        lease: this.acquireLease(),
      };
    }

    const activationWaiter = this.createVirtualActivationWaiter(
      startLease.epoch,
    );
    const operationPromise = Promise.resolve().then(operation);

    try {
      const result = await Promise.race([
        operationPromise.then((value) => ({
          status: 'completed' as const,
          value,
        })),
        activationWaiter.promise.then((lease) => ({
          status: 'interrupted' as const,
          lease,
        })),
      ]);

      if (result.status === 'interrupted') {
        this.interruptedRealOperations.add(operationPromise);
        return result;
      }

      // Prefer the surface transition if the operation and activation settle
      // in the same turn and the operation promise wins the race by a microtask.
      if (!this.isCurrentLease(startLease) && this.state.mode === 'virtual') {
        this.interruptedRealOperations.add(operationPromise);
        return {
          status: 'interrupted',
          lease: this.acquireLease(),
        };
      }

      return {
        status: 'completed',
        value: result.value,
        lease: startLease,
      };
    } finally {
      activationWaiter.cancel();
    }
  }

  async waitForInterruptedRealOperations(): Promise<void> {
    const operations = [...this.interruptedRealOperations];
    if (operations.length === 0) return;

    const results = await Promise.allSettled(operations);
    for (const operation of operations) {
      this.interruptedRealOperations.delete(operation);
    }

    const errors = results.flatMap((result) =>
      result.status === 'rejected' ? [result.reason] : [],
    );
    if (errors.length > 0) {
      throw new AggregateError(
        errors,
        '[midscene] Interrupted real web operation failed while the virtual surface was active.',
      );
    }
  }

  private nextEpoch(): number {
    this.epoch += 1;
    return this.epoch;
  }

  private assertState(
    expectedMode: 'virtual' | 'resuming',
    expectedLease?: WebSurfaceLease<VirtualSurface>,
  ): void {
    if (expectedLease && !this.isCurrentLease(expectedLease)) {
      throw this.staleTransitionError(expectedLease);
    }
    if (this.state.mode !== expectedMode) {
      throw new Error(
        `[midscene] Expected web surface state "${expectedMode}", but current state is "${this.state.mode}".`,
      );
    }
  }

  private staleTransitionError(lease: WebSurfaceLease<VirtualSurface>): Error {
    return new Error(
      `[midscene] Stale web surface transition from ${lease.mode} epoch ${lease.epoch}; current state is ${this.state.mode} epoch ${this.state.epoch}.`,
    );
  }

  private createVirtualActivationWaiter(afterEpoch: number): {
    promise: Promise<WebSurfaceLease<VirtualSurface>>;
    cancel: () => void;
  } {
    if (this.state.mode === 'virtual' && this.state.epoch > afterEpoch) {
      return {
        promise: Promise.resolve(this.acquireLease()),
        cancel: () => {},
      };
    }

    let waiter: VirtualActivationWaiter<VirtualSurface>;
    const promise = new Promise<WebSurfaceLease<VirtualSurface>>((resolve) => {
      waiter = { afterEpoch, resolve };
      this.virtualActivationWaiters.add(waiter);
    });

    return {
      promise,
      cancel: () => {
        this.virtualActivationWaiters.delete(waiter);
      },
    };
  }

  private resolveVirtualActivationWaiters(
    lease: WebSurfaceLease<VirtualSurface>,
  ): void {
    for (const waiter of this.virtualActivationWaiters) {
      if (lease.epoch <= waiter.afterEpoch) continue;
      this.virtualActivationWaiters.delete(waiter);
      waiter.resolve(lease);
    }
  }
}
