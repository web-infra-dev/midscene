import type {
  ProjectRuntime,
  WorkflowDocumentRunResult,
} from '@midscene/core/internal/test-runner';
import {
  WorkflowError,
  getPendingScopeOperations,
  getResourceCleanupCompletion,
  trackResourceOperation,
  waitForScopeOperations,
} from '@midscene/core/internal/test-runner';
import { runWithConsoleLogScope } from '@midscene/shared/logger';
import { createProjectRuntime } from '../engine/project-runtime';
import {
  executeDocumentInvocation,
  isSharedResourceFailure,
} from './document-invocation';
import type { PreparedExecutionProject } from './execution-plan';
import type { TestReporterEvent } from './reporter-events';
import type {
  TestExecutionProjectRunResult,
  TestProjectCaseRunResult,
} from './types';

interface FileProjectState {
  prepared: PreparedExecutionProject;
  cases: TestProjectCaseRunResult[];
  documents: WorkflowDocumentRunResult[];
  runtime?: ProjectRuntime;
  lifecycle?: TestExecutionProjectRunResult['lifecycle'];
  cursor: number;
  active: number;
  initializing: boolean;
  finished: boolean;
  fatal: boolean;
  setupFailed: boolean;
}

interface FileSchedulerOptions {
  projects: readonly PreparedExecutionProject[];
  maxConcurrentFiles: number;
  maxConcurrentProjects: number;
  setupTimeoutMs: number;
  teardownTimeoutMs(): number;
  signal: AbortSignal;
  runDir: string;
  preflightFailed: boolean;
  shouldBail(): boolean;
  addFailedCases(count: number): void;
  announceProject(project: PreparedExecutionProject, index: number): void;
  onProgress(project: PreparedExecutionProject, message: string): void;
  onInfrastructureError(error: unknown): void;
  onEvent?(event: TestReporterEvent): void;
}

/** Round-robin files within global file and live Project limits. */
export async function runPreparedFiles(
  options: FileSchedulerOptions,
): Promise<FileProjectState[]> {
  const states: FileProjectState[] = options.projects.map((prepared) => ({
    prepared,
    cases: [],
    documents: [],
    cursor: 0,
    active: 0,
    initializing: false,
    finished: false,
    fatal: false,
    setupFailed: false,
  }));
  let nextProject = 0;
  let resourcesUnresolved = false;
  let occupied = 0;
  let occupiedProjects = 0;
  const cleanupQueue: Array<() => void> = [];
  const release = () => {
    occupied--;
    while (occupied < options.maxConcurrentFiles && cleanupQueue.length) {
      occupied++;
      cleanupQueue.shift()!();
    }
    wake?.();
  };
  let wake: (() => void) | undefined;
  const running = new Set<Promise<void>>();
  const stopped = (state: FileProjectState) =>
    options.signal.aborted || options.shouldBail() || state.fatal;
  const invalid = (state: FileProjectState) =>
    options.preflightFailed || state.prepared.collectionErrors.length > 0;
  const unresolved = () => {
    if (resourcesUnresolved) return;
    resourcesUnresolved = true;
    options.onInfrastructureError(
      new WorkflowError(
        'Resources are still running or cleanup is pending. No new test files will start.',
        { code: 'UNRESOLVED_FILE_RESOURCES' },
      ),
    );
  };
  const finishProject = async (state: FileProjectState) => {
    if (!state.runtime || state.finished) return;
    state.finished = true;
    const failed =
      state.fatal ||
      options.signal.aborted ||
      state.cases.some((item) => item.status !== 'success') ||
      state.documents.some((item) => item.status !== 'success');
    state.lifecycle = await runWithConsoleLogScope(
      { projectName: state.prepared.project.name, phase: 'teardown' },
      () => state.runtime!.finish(failed ? 'failed' : 'success'),
    );
    const releaseProject = () => {
      occupiedProjects--;
      wake?.();
    };
    if (
      state.lifecycle.cleanup?.status === 'pending' ||
      state.lifecycle.pendingOperations?.length
    ) {
      unresolved();
      // A result snapshot can precede actual resource release.
      void Promise.all([
        waitForScopeOperations(state.runtime.signal),
        getResourceCleanupCompletion(state.runtime.signal),
      ]).then(releaseProject, (error) => {
        options.onInfrastructureError(error);
        releaseProject();
      });
    } else releaseProject();
  };

  const admit = () => {
    for (let offset = 0; offset < states.length; offset++) {
      const index = (nextProject + offset) % states.length;
      const state = states[index];
      if (invalid(state) || state.finished || state.initializing) continue;
      if (!state.runtime && occupiedProjects >= options.maxConcurrentProjects)
        continue;
      const cleanupOnly =
        !!state.runtime &&
        state.active === 0 &&
        (stopped(state) || state.cursor === state.prepared.invocations.length);
      if (
        !cleanupOnly &&
        (stopped(state) ||
          state.cursor >= state.prepared.invocations.length ||
          state.active >=
            (state.prepared.project.maxConcurrentFiles ??
              options.maxConcurrentFiles))
      )
        continue;
      nextProject = (index + 1) % states.length;
      occupied++;
      state.active++;
      if (!state.runtime && !cleanupOnly) {
        // Claim both budgets before setup so idle Projects are not pre-created.
        occupiedProjects++;
        state.initializing = true;
      }
      const invocationIndex = cleanupOnly ? -1 : state.cursor++;
      return { state, index, invocationIndex };
    }
  };

  const run = async ({
    state,
    index,
    invocationIndex,
  }: NonNullable<ReturnType<typeof admit>>) => {
    const { prepared } = state;
    const { project } = prepared;
    let fileResourcesPending = false;
    try {
      if (invocationIndex < 0) {
        await finishProject(state);
        return;
      }
      if (!state.runtime) {
        state.runtime = createProjectRuntime({
          project,
          setup: project.setup,
          signal: options.signal,
          setupTimeoutMs: options.setupTimeoutMs,
          teardownTimeoutMs: options.teardownTimeoutMs,
        });
        setMaxListeners(
          Math.max(
            10,
            Math.min(
              prepared.invocations.length,
              project.maxConcurrentFiles ?? options.maxConcurrentFiles,
            ) + 1,
          ),
          state.runtime.signal,
        );
        options.announceProject(prepared, index);
        await runWithConsoleLogScope(
          { projectName: project.name, phase: 'setup' },
          () => state.runtime!.start(),
        );
        state.initializing = false;
        if (!state.runtime.canRun) {
          state.fatal = true;
          state.setupFailed = true;
        }
        wake?.();
      }
      if (stopped(state)) return;
      const invocation = prepared.invocations[invocationIndex];
      options.onProgress(
        prepared,
        `  [document ${invocationIndex + 1}/${prepared.invocations.length}] ${invocation.document.sourcePath}`,
      );
      await executeDocumentInvocation({
        invocation,
        project,
        projectContext: state.runtime.context,
        runDir: options.runDir,
        signal: state.runtime.signal,
        rootSignal: options.signal,
        shouldBail: options.shouldBail,
        isProjectFatal: () => state.fatal,
        markProjectFatal: () => {
          if (state.fatal) return;
          state.fatal = true;
          state.runtime?.abort(
            new WorkflowError(
              `Project "${project.name}" shared execution environment is unavailable.`,
              { code: 'PROJECT_RESOURCE_ERROR' },
            ),
          );
        },
        addFailedCases: options.addFailedCases,
        onProgress: (message) =>
          options.onProgress(
            prepared,
            options.maxConcurrentFiles > 1
              ? ` [${invocation.document.sourcePath}]${message}`
              : message,
          ),
        sinks: state,
        onEvent: options.onEvent,
        isolatedContext: project.fileSetup !== undefined,
        isProjectResourceFailure: isSharedResourceFailure,
        setupTimeoutMs: options.setupTimeoutMs,
        teardownTimeoutMs: options.teardownTimeoutMs,
        onUnresolvedResources: () => {
          fileResourcesPending = true;
          unresolved();
        },
      });
    } catch (error) {
      state.fatal = true;
      fileResourcesPending =
        !!state.runtime &&
        getPendingScopeOperations(state.runtime.signal).length > 0;
      options.onInfrastructureError(error);
    } finally {
      state.initializing = false;
      try {
        // The last file retains its global/local admission through shared cleanup.
        if (
          state.active === 1 &&
          (stopped(state) || state.cursor === prepared.invocations.length)
        )
          await finishProject(state);
      } catch (error) {
        options.onInfrastructureError(error);
      }
      state.active--;
      if (
        state.runtime &&
        (fileResourcesPending || state.lifecycle?.cleanup?.status === 'pending')
      ) {
        // A returned pending snapshot does not release the actual admission.
        // At shutdown this may conservatively wait for siblings in the Project.
        void waitForScopeOperations(state.runtime.signal).then(
          release,
          (error) => {
            options.onInfrastructureError(error);
            release();
          },
        );
      } else release();
      wake?.();
    }
  };

  while (true) {
    const changed = new Promise<void>((resolve) => {
      wake = resolve;
    });
    while (occupied < options.maxConcurrentFiles) {
      const job = admit();
      if (!job) break;
      const task = run(job);
      running.add(task);
      const settled = () => {
        running.delete(task);
        wake?.();
      };
      void task.then(settled, (error) => {
        options.onInfrastructureError(error);
        settled();
      });
    }
    if (!running.size) break;
    await changed;
  }
  wake = undefined;

  // Pending acquisitions/disposers retain their admissions after the result
  // deadline. Idle initialized Projects queue actual cleanup behind those
  // admissions; their snapshots still return within the shared shutdown limit.
  await Promise.all(
    states.map(async (state) => {
      if (!state.runtime || state.finished) return;
      const admission = new Promise<void>((resolve) => {
        cleanupQueue.push(resolve);
      });
      trackResourceOperation({}, admission, state.runtime.signal);
      while (occupied < options.maxConcurrentFiles && cleanupQueue.length) {
        occupied++;
        cleanupQueue.shift()!();
      }
      try {
        await finishProject(state);
      } catch (error) {
        options.onInfrastructureError(error);
      } finally {
        void Promise.all([
          admission,
          getResourceCleanupCompletion(state.runtime.signal),
        ]).then(release, (error) => {
          options.onInfrastructureError(error);
          release();
        });
      }
    }),
  );

  for (const state of states) {
    const { prepared } = state;
    if (!state.runtime)
      options.announceProject(prepared, states.indexOf(state));
    const completed = new Set(state.cases.map((item) => item.caseId));
    const reason = invalid(state)
      ? 'project-preflight-failed'
      : state.setupFailed
        ? 'project-setup-failed'
        : options.signal.aborted
          ? 'interrupted'
          : state.fatal
            ? 'fatal-error'
            : 'bail';
    for (const document of prepared.documents) {
      for (const item of document.cases) {
        if (completed.has(item.caseId)) continue;
        state.cases.push({
          documentId: document.documentId,
          caseId: item.caseId,
          projectName: prepared.project.name,
          name: item.definition.name,
          sourcePath: item.sourcePath,
          caseIndex: item.caseIndex,
          status: 'not-run',
          notRunReason: reason,
        });
      }
    }
    const order = new Map(
      prepared.documents.map((document, i) => [document.documentId, i]),
    );
    const position = (id: string) => order.get(id) ?? Number.MAX_SAFE_INTEGER;
    state.cases.sort(
      (a, b) =>
        position(a.documentId) - position(b.documentId) ||
        a.caseIndex - b.caseIndex,
    );
    state.documents.sort(
      (a, b) => position(a.documentId) - position(b.documentId),
    );
  }
  return states;
}
import { setMaxListeners } from 'node:events';
