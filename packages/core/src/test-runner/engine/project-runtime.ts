import { getDebug } from '@midscene/shared/logger';
import {
  ProjectSetupError,
  ProjectTeardownError,
  WorkflowLifecycleError,
} from '../errors';
import {
  ResourceCleanupDeferredError,
  cleanupScopeResources,
  linkResourceSignal,
} from './resource-operations';
import type {
  ProjectRuntime,
  ProjectRuntimeOptions,
  ProjectRuntimeResult,
} from './types';

export const createProjectRuntime = <TProjectContext = unknown>(
  options: ProjectRuntimeOptions<TProjectContext>,
): ProjectRuntime<TProjectContext> => {
  const startedAt = new Date();
  const controller = new AbortController();
  const parentSignal = options.signal;
  linkResourceSignal(controller.signal, parentSignal);
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener('abort', abortFromParent, { once: true });

  const teardownStack: Array<{
    registrationIndex: number;
    teardown: Parameters<
      Parameters<NonNullable<typeof options.setup>['setup']>[0]['onTeardown']
    >[0];
  }> = [];
  let context: TProjectContext | undefined;
  let setupError: ProjectSetupError | undefined;
  let started = false;
  let acceptingTeardowns = options.setup !== undefined;
  let finishedResult: ProjectRuntimeResult<TProjectContext> | undefined;
  let finishPromise: Promise<ProjectRuntimeResult<TProjectContext>> | undefined;

  const createResult = (
    requestedStatus: 'success' | 'failed',
    teardownErrors: readonly ProjectTeardownError[] = [],
  ): ProjectRuntimeResult<TProjectContext> => {
    const endedAt = new Date();
    return {
      projectName: options.project.name,
      status:
        requestedStatus === 'failed' || setupError || teardownErrors.length > 0
          ? 'failed'
          : 'success',
      ...(setupError ? { setupError } : {}),
      ...(teardownErrors.length > 0
        ? { teardownErrors: [...teardownErrors] }
        : {}),
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationMs: Math.max(0, endedAt.getTime() - startedAt.getTime()),
    };
  };

  const onTeardown = (
    teardown: (typeof teardownStack)[number]['teardown'],
  ): void => {
    if (!acceptingTeardowns) {
      throw new WorkflowLifecycleError(
        'onTeardown() can only be called while Project setup is running.',
        { projectName: options.project.name },
      );
    }
    if (typeof teardown !== 'function') {
      throw new WorkflowLifecycleError(
        'Project onTeardown() requires a teardown function.',
        { projectName: options.project.name },
      );
    }
    teardownStack.push({
      registrationIndex: teardownStack.length,
      teardown,
    });
  };

  return {
    get context() {
      return context;
    },
    get signal() {
      return controller.signal;
    },
    get canRun() {
      return started && !setupError && !controller.signal.aborted;
    },
    async start() {
      if (started) {
        throw new WorkflowLifecycleError(
          'Project runtime has already started.',
          {
            projectName: options.project.name,
          },
        );
      }
      started = true;
      if (controller.signal.aborted) {
        acceptingTeardowns = false;
        return createResult('failed');
      }
      if (options.setup) {
        try {
          context = await options.setup.setup({
            project: options.project,
            env: Object.freeze({ ...process.env }),
            signal: controller.signal,
            onTeardown,
          });
        } catch (error) {
          setupError = new ProjectSetupError(error, {
            projectName: options.project.name,
          });
        } finally {
          acceptingTeardowns = false;
        }
      }
      return createResult(setupError ? 'failed' : 'success');
    },
    async finish(requestedStatus = 'success') {
      if (finishPromise) return finishPromise;
      if (!started) {
        throw new WorkflowLifecycleError(
          'Project runtime must start before it can finish.',
          { projectName: options.project.name },
        );
      }
      finishPromise = (async () => {
        const statusBeforeTeardown = createResult(requestedStatus).status;
        const teardownErrors: ProjectTeardownError[] = [];
        let deferredCleanup = false;
        const cleanup = async () => {
          const priorErrors = teardownErrors.length;
          for (const {
            registrationIndex,
            teardown,
          } of teardownStack.reverse()) {
            try {
              await teardown({
                project: options.project,
                context,
                status: statusBeforeTeardown,
                ...(setupError ? { setupError } : {}),
              });
            } catch (error) {
              teardownErrors.push(
                new ProjectTeardownError(error, {
                  projectName: options.project.name,
                  registrationIndex,
                }),
              );
            }
          }
          if (deferredCleanup && teardownErrors.length > priorErrors)
            throw new AggregateError(
              teardownErrors.slice(priorErrors),
              'Deferred Project cleanup failed',
            );
        };
        try {
          if (teardownStack.length)
            await cleanupScopeResources(controller.signal, cleanup, {
              onDeferredError: (error) =>
                getDebug('runner:cleanup', { console: true })(
                  `Deferred Project cleanup failed: ${String(error)}`,
                ),
            });
        } catch (error) {
          deferredCleanup = error instanceof ResourceCleanupDeferredError;
          teardownErrors.push(
            new ProjectTeardownError(error, {
              projectName: options.project.name,
              registrationIndex: -1,
            }),
          );
        }
        parentSignal?.removeEventListener('abort', abortFromParent);
        finishedResult = createResult(requestedStatus, teardownErrors);
        return finishedResult;
      })();
      return finishPromise;
    },
    abort(reason) {
      controller.abort(reason);
    },
  };
};
