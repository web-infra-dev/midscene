import { WorkflowError } from '../errors';

interface CleanupOwner {
  resources: Set<object>;
  signal?: AbortSignal;
}

interface ResourceScope {
  operations: Map<object, number>;
  resources?: Set<object>;
}

interface ResourceHandle {
  operations: Map<Promise<unknown>, AbortSignal>;
  retiring: Set<CleanupOwner>;
  cleanup?: Promise<unknown>;
}

interface ResourceState {
  resources: WeakMap<object, ResourceHandle>;
  scopes: WeakMap<AbortSignal, ResourceScope>;
  parents: WeakMap<AbortSignal, AbortSignal>;
  cleanupOwners: WeakMap<AbortSignal, CleanupOwner>;
}

// CJS and ESM hosts must agree about ownership of the same Agent instance.
const stateKey = Symbol.for('@midscene/core/resource-operations/v3');
const host = globalThis as typeof globalThis & { [stateKey]?: ResourceState };
host[stateKey] ??= {
  resources: new WeakMap(),
  scopes: new WeakMap(),
  parents: new WeakMap(),
  cleanupOwners: new WeakMap(),
};
const { resources, scopes, parents, cleanupOwners } = host[stateKey];
const resourceHandle = (resource: object): ResourceHandle => {
  let handle = resources.get(resource);
  if (!handle) {
    handle = { operations: new Map(), retiring: new Set() };
    resources.set(resource, handle);
  }
  return handle;
};

/** Actual teardown completion belongs to the owner, never to a thrown error. */
export const getResourceCleanupCompletion = (
  owner: object,
): Promise<unknown> | undefined => resources.get(owner)?.cleanup;

export const RESOURCE_CLEANUP_GRACE_MS = 1000;

/** Resource ancestry is independent of cancellation: cleanup can outlive abort. */
export function linkResourceSignal(signal: AbortSignal, parent?: AbortSignal) {
  if (parent && parent !== signal) parents.set(signal, parent);
}

function* ownerSignals(signal?: AbortSignal): Generator<AbortSignal> {
  const seen = new Set<AbortSignal>();
  for (
    let owner = signal;
    owner && !seen.has(owner);
    owner = parents.get(owner)
  ) {
    seen.add(owner);
    yield owner;
  }
}

/** Each Case/document owns its cleanup, even when cancellation is shared. */
export function createResourceScope(parent?: AbortSignal) {
  const controller = new AbortController();
  const scope: ResourceScope = { operations: new Map(), resources: new Set() };
  scopes.set(controller.signal, scope);
  linkResourceSignal(controller.signal, parent);
  const abort = () => controller.abort(parent?.reason);
  if (parent?.aborted) abort();
  else parent?.addEventListener('abort', abort, { once: true });
  return {
    signal: controller.signal,
    dispose() {
      parent?.removeEventListener('abort', abort);
      scope.resources = undefined;
      if (!scope.operations.size) scopes.delete(controller.signal);
    },
  };
}

export function assertResourceAvailable(
  resource: object,
  exclusive = false,
  signal?: AbortSignal,
): boolean {
  const retiringOwners = resources.get(resource)?.retiring;
  const isOwnerCleanup = [...ownerSignals(signal)].some((ownerSignal) => {
    const owner = cleanupOwners.get(ownerSignal);
    return owner !== undefined && retiringOwners?.has(owner);
  });
  if (retiringOwners?.size && !isOwnerCleanup)
    throw new WorkflowError(
      'A resource cannot execute overlapping Runner operations while its cleanup is pending.',
      { code: 'RESOURCE_CLEANUP_PENDING' },
    );
  const pending = resources.get(resource)?.operations;
  if (exclusive && pending?.size && !isOwnerCleanup)
    throw new WorkflowError(
      'The same Agent instance cannot execute overlapping Runner operations.',
      { code: 'RESOURCE_OPERATION_PENDING' },
    );
  if (
    pending &&
    !isOwnerCleanup &&
    [...pending.values()].some((signal) => signal.aborted)
  )
    throw new WorkflowError(
      'Cannot reuse an Agent while an aborted YAML action or Runner operation is still running.',
      { code: 'RESOURCE_OPERATION_PENDING' },
    );
  return isOwnerCleanup;
}

const retainForCleanup = (owner: CleanupOwner, resource: object) => {
  owner.resources.add(resource);
  resourceHandle(resource).retiring.add(owner);
};

/** Track actual completion, not the Runner timeout race. */
export function trackResourceOperation<T>(
  resource: object,
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  const active = resourceHandle(resource).operations;
  active.set(operation, signal);
  const ownerScopes: Array<[AbortSignal, ResourceScope]> = [];
  let retainedByScope = false;
  for (const ownerSignal of ownerSignals(signal)) {
    const scope: ResourceScope = scopes.get(ownerSignal) ?? {
      operations: new Map(),
    };
    scopes.set(ownerSignal, scope);
    scope.operations.set(resource, (scope.operations.get(resource) ?? 0) + 1);
    ownerScopes.push([ownerSignal, scope]);
    // Only the closest owner retains idle resources for its teardown. Parents
    // wait on active operations, not every Agent used by completed Cases.
    if (!retainedByScope && scope.resources) {
      scope.resources.add(resource);
      retainedByScope = true;
    }
    const cleanupOwner = cleanupOwners.get(ownerSignal);
    if (cleanupOwner) retainForCleanup(cleanupOwner, resource);
  }
  const finish = () => {
    active.delete(operation);
    for (const [ownerSignal, scope] of ownerScopes) {
      const count = scope.operations.get(resource)! - 1;
      if (count) scope.operations.set(resource, count);
      else scope.operations.delete(resource);
      if (!scope.operations.size && !scope.resources)
        scopes.delete(ownerSignal);
    }
  };
  void operation.then(finish, finish);
  return operation;
}

export async function waitForResourceIdle(resource: object): Promise<void> {
  while (resources.get(resource)?.operations?.size)
    await Promise.allSettled([...resources.get(resource)!.operations.keys()]);
}

export class ResourceCleanupDeferredError extends WorkflowError {
  constructor(graceMs: number, resourceCount: number) {
    super(
      'Resource cleanup was deferred because an operation did not stop after cancellation. The resource remains quarantined and cleanup will run when that operation settles.',
      {
        code: 'RESOURCE_CLEANUP_DEFERRED',
        details: { graceMs, resourceCount },
      },
    );
  }
}

interface CleanupOptions {
  /** Stable owner of this cleanup, distinct from borrowed resource identities. */
  owner?: object;
  /** Parent scope observes deferred completion without host-specific forwarding. */
  signal?: AbortSignal;
  graceMs?: number;
  onDeferredError(error: unknown): void;
}

/** Bound draining, but keep ownership until the actual cleanup has finished. */
async function runResourceCleanup<T>(
  resources: readonly object[],
  cleanup: () => Promise<T>,
  options: CleanupOptions,
  beforeCleanup?: {
    signal: AbortSignal;
    run(signal: AbortSignal): Promise<void>;
  },
): Promise<T> {
  const owner: CleanupOwner = {
    resources: new Set(),
    signal: beforeCleanup?.signal,
  };
  for (const resource of resources) retainForCleanup(owner, resource);
  if (owner.signal) cleanupOwners.set(owner.signal, owner);

  let defer!: () => void;
  const deferred = new Promise<{ deferred: true }>((resolve) => {
    defer = () => resolve({ deferred: true });
  });
  const graceMs = options.graceMs ?? RESOURCE_CLEANUP_GRACE_MS;
  const drain = async () => {
    const pending = [...owner.resources].filter(
      (resource) => resourceHandle(resource).operations.size,
    );
    if (!pending.length) return;
    const timer = setTimeout(defer, graceMs);
    try {
      await Promise.all(pending.map(waitForResourceIdle));
    } finally {
      clearTimeout(timer);
    }
  };
  const completion = (async () => {
    try {
      if (beforeCleanup) {
        // Authored lifecycle cleanup must be allowed to stop or reset a
        // resource whose timed-out operation is still settling. Its signal is
        // registered as the retiring owner's cleanup signal, so unrelated
        // scopes remain quarantined while this hook runs.
        await beforeCleanup.run(beforeCleanup.signal);
      }
      // Lifecycle hooks can themselves time out with an action still running.
      // Drain both the original work and any operation started by the hook
      // before disposing the resource.
      await drain();
      return await cleanup();
    } finally {
      if (owner.signal) cleanupOwners.delete(owner.signal);
      for (const resource of owner.resources) {
        const owners = resourceHandle(resource).retiring;
        owners.delete(owner);
      }
    }
  })();
  const ownerKey = options.owner ?? beforeCleanup?.signal ?? resources[0];
  if (ownerKey) resourceHandle(ownerKey).cleanup = completion;
  const outcome = await Promise.race([
    completion.then((value) => ({ value })),
    deferred,
  ]);
  if ('deferred' in outcome) {
    void completion.catch((error) => {
      try {
        options.onDeferredError(error);
      } catch {
        // The returned completion still carries the original cleanup failure.
      }
    });
    if (options.signal) trackResourceOperation({}, completion, options.signal);
    throw new ResourceCleanupDeferredError(graceMs, owner.resources.size);
  }
  return outcome.value;
}

export function cleanupResources<T>(
  resources: readonly object[],
  cleanup: () => Promise<T>,
  options: CleanupOptions,
): Promise<T> {
  return runResourceCleanup(resources, cleanup, options);
}

export async function cleanupScopeResources<T>(
  signal: AbortSignal,
  cleanup: () => Promise<T>,
  options: CleanupOptions & {
    beforeCleanup?(signal: AbortSignal): Promise<void>;
  },
): Promise<T> {
  const cleanupSignal = new AbortController().signal;
  linkResourceSignal(cleanupSignal, signal);
  const scope = scopes.get(signal);
  return runResourceCleanup(
    [...(scope?.resources ?? []), ...(scope?.operations.keys() ?? [])],
    cleanup,
    { ...options, owner: signal, signal },
    options.beforeCleanup
      ? { signal: cleanupSignal, run: options.beforeCleanup }
      : undefined,
  );
}
