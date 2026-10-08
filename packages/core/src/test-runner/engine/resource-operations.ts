import { getDebug } from '@midscene/shared/logger';
import { uuid } from '@midscene/shared/utils';
import type { TestRunReportOperationEvent } from '../../test-run-report';
import { WorkflowError } from '../errors';
import { sanitizeReportError } from '../reporting/sanitize';

interface OperationIdentity {
  scopeId: string;
  stepId?: string;
  node?: string;
}
interface ResourceOperation {
  signal: AbortSignal;
  operationId: string;
  identity?: OperationIdentity;
}
type OperationListener = (event: Readonly<TestRunReportOperationEvent>) => void;

interface CleanupOwner {
  resources: Set<object>;
  signal?: AbortSignal;
  blockers: Set<ResourceOperation>;
}

interface ResourceScope {
  operations: Map<object, number>;
  resources?: Set<object>;
  cleanupOwner?: CleanupOwner;
}

interface ResourceHandle {
  operations: Map<Promise<unknown>, ResourceOperation>;
  retiring: Set<CleanupOwner>;
  cleanup?: Promise<unknown>;
  interrupted: WeakMap<AbortSignal, ResourceOperation[]>;
}

interface ResourceState {
  resources: WeakMap<object, ResourceHandle>;
  scopes: WeakMap<AbortSignal, ResourceScope>;
  parents: WeakMap<AbortSignal, AbortSignal>;
  cleanupOwners: WeakMap<AbortSignal, CleanupOwner>;
  identities: WeakMap<AbortSignal, OperationIdentity>;
  listeners: WeakMap<AbortSignal, Set<OperationListener>>;
}

// CJS and ESM hosts must agree about ownership of the same Agent instance.
const admissionErrorKey = Symbol.for('@midscene/core/resource-admission-error');
const stateKey = Symbol.for('@midscene/core/resource-operations/v4');
const host = globalThis as typeof globalThis & { [stateKey]?: ResourceState };
host[stateKey] ??= {
  resources: new WeakMap(),
  scopes: new WeakMap(),
  parents: new WeakMap(),
  cleanupOwners: new WeakMap(),
  identities: new WeakMap(),
  listeners: new WeakMap(),
};
const { resources, scopes, parents, cleanupOwners, identities, listeners } =
  host[stateKey];
const resourceHandle = (resource: object): ResourceHandle => {
  let handle = resources.get(resource);
  if (!handle) {
    handle = {
      operations: new Map(),
      retiring: new Set(),
      interrupted: new WeakMap(),
    };
    resources.set(resource, handle);
  }
  return handle;
};

/** Actual teardown completion belongs to the owner, never to a thrown error. */
export const getResourceCleanupCompletion = (
  owner: object,
): Promise<unknown> | undefined => resources.get(owner)?.cleanup;

export const RESOURCE_CLEANUP_GRACE_MS = 1000;
export const RESOURCE_RECOVERY_GRACE_MS = 30_000;

/** Snapshotting must not wait for a timed-out operation to release its resource. */
export const hasPendingResourceOperation = (resource: object): boolean =>
  (resources.get(resource)?.operations.size ?? 0) > 0;

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
    [...pending.values()].some((operation) => operation.signal.aborted)
  )
    throw new WorkflowError(
      'Cannot reuse an Agent while an aborted YAML action or Runner operation is still running.',
      { code: 'RESOURCE_OPERATION_PENDING' },
    );
  return isOwnerCleanup;
}

/** Capture subscribers at registration: late settlement stays with its original run. */
export function observeResourceOperations(
  signal: AbortSignal,
  listener: OperationListener,
) {
  const subscribers = listeners.get(signal) ?? new Set<OperationListener>();
  listeners.set(signal, subscribers);
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
    if (!subscribers.size) listeners.delete(signal);
  };
}

export function setResourceOperationIdentity(
  signal: AbortSignal,
  identity: OperationIdentity,
) {
  identities.set(signal, Object.freeze({ ...identity }));
}

function freezeEvent<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeEvent(child);
    Object.freeze(value);
  }
  return value;
}

export function recordOperation(
  operation: Promise<unknown>,
  signal: AbortSignal,
  operationKind: TestRunReportOperationEvent['operationKind'],
) {
  const owners = [...ownerSignals(signal)];
  const identity = owners.map((owner) => identities.get(owner)).find(Boolean);
  const record: ResourceOperation = { signal, operationId: uuid(), identity };
  const subscribers = new Set(
    owners.flatMap((owner) => [...(listeners.get(owner) ?? [])]),
  );
  let settled = false;
  const emit = (
    event: Omit<
      TestRunReportOperationEvent,
      'operationId' | 'operationKind' | 'at'
    >,
  ) => {
    const frozen = freezeEvent({
      ...identity,
      operationId: record.operationId,
      operationKind,
      at: new Date().toISOString(),
      ...event,
    });
    for (const subscriber of subscribers) {
      try {
        subscriber(frozen);
      } catch (error) {
        getDebug('runner:operations', { console: true })(
          `Operation observer failed: ${String(error)}`,
        );
      }
    }
  };
  const abort = () =>
    emit({
      kind: 'cancel-requested',
      error: sanitizeReportError(signal.reason),
    });
  emit({ kind: 'started' });
  if (signal.aborted) abort();
  else signal.addEventListener('abort', abort, { once: true });
  const finish = (
    status: 'success' | 'failed' | 'not-run',
    error?: unknown,
  ) => {
    settled = true;
    signal.removeEventListener('abort', abort);
    emit({
      kind: 'settled',
      status,
      ...(status !== 'success' ? { error: sanitizeReportError(error) } : {}),
    });
  };
  void operation.then(
    () => finish('success'),
    (error) =>
      finish(isResourceAdmissionError(error) ? 'not-run' : 'failed', error),
  );
  return {
    record,
    runnerReturned(status: 'success' | 'failed' | 'not-run') {
      emit({ kind: 'runner-returned', status, pending: !settled });
    },
  };
}

/** A scheduling decision, distinct from an action that ran and failed. */
export class ResourceAdmissionError extends WorkflowError {
  readonly blockedBy?: string;
  readonly [admissionErrorKey] = true;
  constructor(code: string, blockers: readonly ResourceOperation[]) {
    const reason =
      code === 'RESOURCE_RECOVERY_REQUIRED'
        ? 'The previous Agent operation was cancelled. This scope requires explicit recovery or cleanup before further Agent actions.'
        : 'The Agent is occupied by an unfinished operation or pending cleanup; this action was not started.';
    super(reason, {
      code,
      details: {
        blockingOperations: blockers.map(({ operationId, identity }) => ({
          operationId,
          ...identity,
        })),
      },
    });
    this.blockedBy = blockers.find(
      (blocker) => blocker.identity?.stepId,
    )?.identity?.stepId;
  }
}

export function isResourceAdmissionError(
  error: unknown,
): error is ResourceAdmissionError {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as ResourceAdmissionError)[admissionErrorKey] === true
  );
}

export function admitResourceOperation(
  resource: object,
  signal: AbortSignal,
  exclusive = true,
): boolean {
  let isCleanupOwner: boolean;
  try {
    isCleanupOwner = assertResourceAvailable(resource, exclusive, signal);
  } catch (error) {
    if (
      error instanceof WorkflowError &&
      ['RESOURCE_OPERATION_PENDING', 'RESOURCE_CLEANUP_PENDING'].includes(
        error.code,
      )
    )
      throw new ResourceAdmissionError(error.code, [
        ...(resources.get(resource)?.operations.values() ?? []),
        ...[...(resources.get(resource)?.retiring ?? [])].flatMap((owner) => [
          ...owner.blockers,
        ]),
      ]);
    throw error;
  }
  if (!isCleanupOwner) {
    for (const owner of ownerSignals(signal)) {
      const interrupted = resources.get(resource)?.interrupted.get(owner);
      if (interrupted?.length)
        throw new ResourceAdmissionError(
          'RESOURCE_RECOVERY_REQUIRED',
          interrupted,
        );
    }
  }
  return isCleanupOwner;
}

const retainForCleanup = (owner: CleanupOwner, resource: object) => {
  owner.resources.add(resource);
  const handle = resourceHandle(resource);
  for (const operation of handle.operations.values())
    owner.blockers.add(operation);
  handle.retiring.add(owner);
};

/** Acquisition establishes cleanup ownership even if action admission is rejected. */
export function retainResourceForScope(resource: object, signal: AbortSignal) {
  let retained = false;
  for (const ownerSignal of ownerSignals(signal)) {
    const scope = scopes.get(ownerSignal);
    if (!retained && scope?.resources) {
      scope.resources.add(resource);
      retained = true;
    }
    if (scope?.cleanupOwner) retainForCleanup(scope.cleanupOwner, resource);
  }
}

/** Track actual completion, not the Runner timeout race. */
export function trackResourceOperation<T>(
  resource: object,
  operation: Promise<T>,
  signal: AbortSignal,
  kind: TestRunReportOperationEvent['operationKind'] = 'resource',
  existingObservation?: ReturnType<typeof recordOperation>,
): Promise<T> {
  const observation =
    existingObservation ?? recordOperation(operation, signal, kind);
  const active = resourceHandle(resource).operations;
  active.set(operation, observation.record);
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
    if (cleanupOwner) {
      cleanupOwner.blockers.add(observation.record);
      retainForCleanup(cleanupOwner, resource);
    }
  }
  const markInterrupted = () => {
    // Cancellation leaves business state uncertain even after the resource idles.
    const owner = ownerScopes.find(([, scope]) => scope.resources)?.[0];
    if (owner && (kind === 'resource' || kind === 'readiness')) {
      const handle = resourceHandle(resource);
      handle.interrupted.set(owner, [
        ...(handle.interrupted.get(owner) ?? []),
        observation.record,
      ]);
    }
  };
  if (signal.aborted) markInterrupted();
  else signal.addEventListener('abort', markInterrupted, { once: true });
  const finish = () => {
    signal.removeEventListener('abort', markInterrupted);
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

/** Wait for this scope's cancelled work before scheduling its next Step. */
export async function recoverCancelledScopeResources(
  signal: AbortSignal,
  graceMs = RESOURCE_RECOVERY_GRACE_MS,
): Promise<void> {
  signal.throwIfAborted();
  const pendingOperations = () => {
    const pending: Array<{
      operation: Promise<unknown>;
      signal: AbortSignal;
      resource: object;
    }> = [];
    for (const resource of scopes.get(signal)?.operations.keys() ?? []) {
      for (const [operation, tracked] of resources.get(resource)
        ?.operations ?? []) {
        const ownerSignal = tracked.signal;
        if (
          ownerSignal.aborted &&
          [...ownerSignals(ownerSignal)].includes(signal)
        )
          pending.push({ operation, signal: ownerSignal, resource });
      }
    }
    return pending;
  };
  let pending = pendingOperations();
  if (!pending.length) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort!: () => void;
  const stopped = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(
      () =>
        reject(
          new WorkflowError(
            `Cancelled operations did not finish within ${graceMs}ms; execution cannot continue safely.`,
            {
              code: 'RESOURCE_RECOVERY_TIMEOUT',
              details: {
                graceMs,
                resourceCount: new Set(pending.map(({ resource }) => resource))
                  .size,
              },
              cause: pending[0]?.signal.reason,
            },
          ),
        ),
      graceMs,
    );
  });
  try {
    while (pending.length) {
      await Promise.race([
        Promise.allSettled(pending.map(({ operation }) => operation)),
        stopped,
      ]);
      signal.throwIfAborted();
      pending = pendingOperations();
    }
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }
}

export class ResourceCleanupDeferredError extends WorkflowError {
  constructor(
    graceMs: number,
    resourceCount: number,
    blockers: readonly ResourceOperation[] = [],
  ) {
    super(
      'Resource cleanup was deferred because an operation did not stop after cancellation. The resource remains quarantined and cleanup will run when that operation settles.',
      {
        code: 'RESOURCE_CLEANUP_DEFERRED',
        details: {
          graceMs,
          resourceCount,
          blockingOperations: blockers.map(({ operationId, identity }) => ({
            operationId,
            ...identity,
          })),
        },
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
    blockers: new Set(),
    signal: beforeCleanup?.signal,
  };
  for (const resource of resources) retainForCleanup(owner, resource);
  if (owner.signal) cleanupOwners.set(owner.signal, owner);
  const ownerScope = options.signal ? scopes.get(options.signal) : undefined;
  if (ownerScope) ownerScope.cleanupOwner = owner;

  let defer!: () => void;
  const deferred = new Promise<{ deferred: true }>((resolve) => {
    defer = () => resolve({ deferred: true });
  });
  const graceMs = options.graceMs ?? RESOURCE_CLEANUP_GRACE_MS;
  const drain = async () => {
    const timer = setTimeout(defer, graceMs);
    try {
      // An acquisition may finish late and add another shared resource to its
      // owner. Keep draining that resource before calling any disposer.
      while (true) {
        const pending = [...owner.resources].filter(
          (resource) => resourceHandle(resource).operations.size,
        );
        if (!pending.length) return;
        await Promise.all(pending.map(waitForResourceIdle));
      }
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
      if (ownerScope?.cleanupOwner === owner)
        ownerScope.cleanupOwner = undefined;
      for (const resource of owner.resources) {
        const owners = resourceHandle(resource).retiring;
        owners.delete(owner);
      }
    }
  })();
  const cleanupObservation = options.signal
    ? recordOperation(completion, options.signal, 'cleanup')
    : undefined;
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
    if (options.signal)
      trackResourceOperation(
        {},
        completion,
        options.signal,
        'cleanup',
        cleanupObservation,
      );
    throw new ResourceCleanupDeferredError(graceMs, owner.resources.size, [
      ...owner.blockers,
    ]);
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
