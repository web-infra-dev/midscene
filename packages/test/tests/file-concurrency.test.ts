import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkflowExecutionFailure } from '@midscene/core/internal/test-runner';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runTestProject } from '../src/cli/test-project-runner';
import type { TestProjectRunResult } from '../src/cli/types';
import { FatalDeviceError, WorkflowError } from '../src/errors';

const roots: string[] = [];
const releases: Array<() => void> = [];
const gate = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  releases.push(resolve);
  return { promise, resolve };
};
interface FileContext {
  key: string;
  serial: number;
}
interface State {
  events: string[];
  contexts: Map<string, unknown[]>;
  setup?(project: string): Promise<void>;
  fileSetup?(key: string, signal: AbortSignal): Promise<void>;
  fileCleanup?(key: string): Promise<void>;
  projectCleanup?(project: string): Promise<void>;
  node?(
    phase: string,
    context: FileContext,
    signal: AbortSignal,
    attempt: number,
  ): Promise<void>;
}
const fixture = (
  options: {
    projects?: string[];
    files?: number;
    global?: number | null;
    projectLimit?: number | null;
    local?: number;
    retry?: number;
    bail?: number;
    fileSetup?: boolean;
    setupTimeout?: number;
    teardownTimeout?: number;
  } = {},
) => {
  const root = mkdtempSync(join(tmpdir(), 'midscene-file-concurrency-'));
  roots.push(root);
  const state: State = { events: [], contexts: new Map() };
  (globalThis as Record<string, unknown>).__midsceneFileConcurrencyState =
    state;
  const names = options.projects ?? ['web'];
  for (const name of names) {
    mkdirSync(join(root, name));
    for (let i = 1; i <= (options.files ?? 2); i++)
      writeFileSync(
        join(root, name, `${i}.yaml`),
        `
beforeAll:
  - before: {}
beforeEach:
  - eachBefore: {}
cases:
  - name: one
    steps:
      - step: {}
afterEach:
  - eachAfter: {}
afterAll:
  - after: {}
`,
      );
  }
  writeFileSync(
    join(root, 'midscene.config.ts'),
    `
    const s = globalThis.__midsceneFileConcurrencyState;
    let serial = 0;
    const setup = {
      name: 'shared',
      async setup({ project, onTeardown }) {
        s.events.push('setup:' + project.name);
        onTeardown(async () => {
          s.events.push('project-cleanup:' + project.name);
          await s.projectCleanup?.(project.name);
          s.events.push('project-end:' + project.name);
        });
        await s.setup?.(project.name);
        return { shared: project.name, key: project.name, serial: 0 };
      },
    };
    const fileSetup = {
      name: 'independent',
      async setup({ project, projectContext, file, signal, onTeardown }) {
        if (projectContext.shared !== project.name) throw new Error('incorrect shared context');
        const key = file.sourcePath;
        s.events.push('file:' + key);
        onTeardown(async () => {
          s.events.push('file-cleanup:' + key);
          await s.fileCleanup?.(key);
          s.events.push('file-end:' + key);
        });
        await s.fileSetup?.(key, signal);
        return { key, serial: ++serial };
      },
    };
    export default {
      projects: ${JSON.stringify(names)}.map((name) => ({
        name, setup,
        ${options.fileSetup === false ? '' : 'fileSetup,'}
        ${options.local === undefined ? '' : `maxConcurrentFiles: ${options.local},`}
        files: { include: [name + '/*.yaml'] }, retry: ${options.retry ?? 0},
      })),
      nodes: ['before', 'eachBefore', 'step', 'eachAfter', 'after'].map((phase) => ({
        name: phase,
        async execute({ context, signal, case: testCase }) {
          s.events.push(phase + ':' + context.key);
          const contexts = s.contexts.get(context.key) ?? [];
          contexts.push(context);
          s.contexts.set(context.key, contexts);
          await s.node?.(phase, context, signal, testCase?.attemptIndex ?? 0);
        },
      })),
      test: ${JSON.stringify({
        maxConcurrentFiles: 'global' in options ? options.global : 2,
        maxConcurrentProjects:
          'projectLimit' in options ? options.projectLimit : null,
        bail: options.bail ?? 0,
        setupTimeout: options.setupTimeout ?? 1000,
        teardownTimeout: options.teardownTimeout ?? 1000,
      })},
    };
  `,
  );
  return { root, state, run: () => runTestProject({ projectRoot: root }) };
};

afterEach(() => {
  releases.splice(0).forEach((resolve) => resolve());
  (globalThis as Record<string, unknown>).__midsceneFileConcurrencyState =
    undefined;
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
const waitFor = (predicate: () => boolean) =>
  vi.waitFor(() => expect(predicate()).toBe(true), {
    timeout: 3000,
    interval: 5,
  });

describe('native file concurrency', () => {
  it('runs whole Projects and their files serially when both limits are omitted', async () => {
    const { state, run } = fixture({
      projects: ['web', 'android'],
      files: 3,
      global: undefined,
      projectLimit: undefined,
      fileSetup: false,
    });
    const cleanup = gate();
    state.projectCleanup = async (project) => {
      if (project === 'web') await cleanup.promise;
    };
    const resultPromise = run();
    await waitFor(() => state.events.includes('project-cleanup:web'));
    expect(state.events).not.toContain('setup:android');
    expect(state.events.filter((e) => e.startsWith('step:'))).toEqual([
      'step:web',
      'step:web',
      'step:web',
    ]);
    cleanup.resolve();
    expect((await resultPromise).status).toBe('success');
    expect(state.events.indexOf('project-end:web')).toBeLessThan(
      state.events.indexOf('setup:android'),
    );
  });

  it('runs unlimited files in one Project at a time when the Project limit is omitted', async () => {
    const { state, run } = fixture({
      projects: ['web', 'android'],
      files: 3,
      global: null,
      projectLimit: undefined,
    });
    const steps = gate();
    state.node = async (phase) => {
      if (phase === 'step') await steps.promise;
    };
    const resultPromise = run();
    await waitFor(() => state.events.includes('step:web/3.yaml'));
    expect(state.events).not.toContain('setup:android');
    steps.resolve();
    expect((await resultPromise).status).toBe('success');
    expect(state.events.indexOf('project-end:web')).toBeLessThan(
      state.events.indexOf('setup:android'),
    );
  });

  it('counts Project setup and cleanup against the Project limit even with free file slots', async () => {
    const { state, run } = fixture({
      projects: ['alpha', 'beta', 'gamma'],
      files: 2,
      global: 3,
      local: 1,
      projectLimit: 2,
    });
    const setup = gate();
    const cleanup = gate();
    const beta = gate();
    let live = 0;
    let peak = 0;
    state.setup = async (project) => {
      peak = Math.max(peak, ++live);
      if (project === 'alpha') await setup.promise;
    };
    state.projectCleanup = async (project) => {
      if (project === 'alpha') await cleanup.promise;
      live--;
    };
    state.node = async (phase, context) => {
      if (phase === 'step' && context.key.startsWith('beta/'))
        await beta.promise;
    };
    const resultPromise = run();
    await waitFor(() => state.events.includes('step:beta/1.yaml'));
    expect(state.events).not.toContain('setup:gamma');
    setup.resolve();
    await waitFor(() => state.events.includes('project-cleanup:alpha'));
    expect(state.events).not.toContain('setup:gamma');
    cleanup.resolve();
    await waitFor(() => state.events.includes('setup:gamma'));
    beta.resolve();
    expect((await resultPromise).status).toBe('success');
    expect(peak).toBe(2);
    expect(live).toBe(0);
    expect(state.events.indexOf('project-end:alpha')).toBeLessThan(
      state.events.indexOf('setup:gamma'),
    );
  });

  it('retains idle Project resources between files under the Project limit', async () => {
    const { state, run } = fixture({
      projects: ['alpha', 'beta', 'gamma'],
      files: 2,
      global: 1,
      projectLimit: 2,
    });
    const result = await run();
    expect(result.status).toBe('success');
    expect(
      state.events.filter((e) => e.startsWith('step:')).slice(0, 3),
    ).toEqual(['step:alpha/1.yaml', 'step:beta/1.yaml', 'step:alpha/2.yaml']);
    expect(state.events.indexOf('project-end:alpha')).toBeLessThan(
      state.events.indexOf('setup:gamma'),
    );
  });

  it('keeps the default global file limit at one when only Project concurrency is raised', async () => {
    const { state, run } = fixture({
      projects: ['web', 'android'],
      files: 2,
      global: undefined,
      projectLimit: 2,
    });
    let active = 0;
    let peak = 0;
    state.fileSetup = async () => {
      peak = Math.max(peak, ++active);
    };
    state.fileCleanup = async () => {
      active--;
    };
    expect((await run()).status).toBe('success');
    expect(peak).toBe(1);
    expect(state.events.indexOf('setup:android')).toBeLessThan(
      state.events.indexOf('project-end:web'),
    );
  });

  it.each([undefined, 1])(
    'removes both global limits while retaining a local limit of %s',
    async (local) => {
      const { state, run } = fixture({
        projects: ['web', 'android'],
        files: 3,
        global: null,
        projectLimit: null,
        local,
      });
      const steps = gate();
      state.node = async (phase) => {
        if (phase === 'step') await steps.promise;
      };
      const resultPromise = run();
      const expected = local === 1 ? 2 : 6;
      await waitFor(
        () =>
          state.events.filter((e) => e.startsWith('step:')).length === expected,
      );
      expect(state.events.filter((e) => e.startsWith('file:'))).toHaveLength(
        expected,
      );
      steps.resolve();
      expect((await resultPromise).status).toBe('success');
    },
  );

  it('shares three global admissions across two Projects with three files each, through cleanup', async () => {
    const { state, run } = fixture({
      projects: ['web', 'android'],
      files: 3,
      global: 3,
      local: 2,
    });
    const steps = new Map<string, ReturnType<typeof gate>>();
    for (const project of ['web', 'android'])
      for (let i = 1; i <= 3; i++) steps.set(`${project}/${i}.yaml`, gate());
    const cleanup = gate();
    let active = 0;
    let peak = 0;
    const local = new Map<string, number>();
    const peaks = new Map<string, number>();
    state.fileSetup = async (key) => {
      peak = Math.max(peak, ++active);
      const project = key.split('/')[0];
      local.set(project, (local.get(project) ?? 0) + 1);
      peaks.set(
        project,
        Math.max(peaks.get(project) ?? 0, local.get(project)!),
      );
    };
    state.fileCleanup = async (key) => {
      if (key === 'web/1.yaml') await cleanup.promise;
      active--;
      const project = key.split('/')[0];
      local.set(project, local.get(project)! - 1);
    };
    state.node = async (phase, context) => {
      if (phase === 'step') await steps.get(context.key)!.promise;
      expect('shared' in context).toBe(false);
    };
    const resultPromise = run();
    await waitFor(
      () =>
        state.events.filter((event) => event.startsWith('step:')).length === 3,
    );
    expect(state.events).toContain('step:web/2.yaml');
    expect(state.events).not.toContain('file:android/2.yaml');
    steps.get('web/1.yaml')!.resolve();
    await waitFor(() => state.events.includes('file-cleanup:web/1.yaml'));
    expect(state.events).not.toContain('file:android/2.yaml');
    cleanup.resolve();
    await waitFor(() => state.events.includes('step:android/2.yaml'));
    steps.get('android/1.yaml')!.resolve();
    await waitFor(() => state.events.includes('step:web/3.yaml'));
    steps.get('web/2.yaml')!.resolve();
    await waitFor(() => state.events.includes('step:android/3.yaml'));
    for (const step of steps.values()) step.resolve();
    const result = await resultPromise;
    expect(result.status).toBe('success');
    expect(result.cases).toHaveLength(6);
    expect(result.cases.map((item) => item.sourcePath)).toEqual([
      'web/1.yaml',
      'web/2.yaml',
      'web/3.yaml',
      'android/1.yaml',
      'android/2.yaml',
      'android/3.yaml',
    ]);
    expect(peak).toBe(3);
    expect([...peaks.values()]).toEqual([2, 2]);
    expect(
      state.events.filter((event) => event.startsWith('setup:')),
    ).toHaveLength(2);
    for (const phase of ['file:', 'before:', 'after:', 'file-end:'])
      expect(
        state.events.filter((event) => event.startsWith(phase)),
      ).toHaveLength(6);
    for (const contexts of state.contexts.values())
      expect(new Set(contexts).size).toBe(1);
    expect(
      new Set([...state.contexts.values()].map(([context]) => context)).size,
    ).toBe(6);
  });

  it('starts siblings when Project setup finishes, and skips an initializing Project', async () => {
    const { state, run } = fixture({
      projects: ['web', 'android'],
      files: 2,
      global: 3,
      local: 2,
    });
    const setup = gate();
    const steps = gate();
    state.setup = async (project) => {
      if (project === 'web') await setup.promise;
    };
    state.node = async (phase) => {
      if (phase === 'step') await steps.promise;
    };
    const resultPromise = run();
    await waitFor(() => state.events.includes('step:android/2.yaml'));
    expect(state.events).not.toContain('file:web/1.yaml');
    expect(state.events).not.toContain('file:web/2.yaml');
    setup.resolve();
    await waitFor(() => state.events.includes('step:web/1.yaml'));
    expect(state.events).not.toContain('file:web/2.yaml');
    steps.resolve();
    expect((await resultPromise).status).toBe('success');
  });

  it('round-robins at one admission and retains the last admission for Project cleanup', async () => {
    const { state, run } = fixture({
      projects: ['web', 'android'],
      files: 2,
      global: 1,
      fileSetup: false,
    });
    const cleanup = gate();
    state.projectCleanup = async (project) => {
      if (project === 'web') await cleanup.promise;
    };
    const resultPromise = run();
    await waitFor(() => state.events.includes('project-cleanup:web'));
    expect(state.events.filter((event) => event.startsWith('step:'))).toEqual([
      'step:web',
      'step:android',
      'step:web',
    ]);
    cleanup.resolve();
    expect((await resultPromise).status).toBe('success');
    expect(
      state.events.filter((event) => event.startsWith('setup:')),
    ).toHaveLength(2);
    expect(
      state.events.filter((event) => event.startsWith('file:')),
    ).toHaveLength(0);
  });

  it('keeps the same file environment and hooks across Case retries', async () => {
    const { state, run } = fixture({ global: 1, retry: 1 });
    state.node = async (phase, _context, _signal, attempt) => {
      if (phase === 'step' && attempt === 0) throw new Error('retry this Case');
    };
    const result = await run();
    expect(result.collectionErrors).toEqual([]);
    expect(result.status).toBe('success');
    expect(result.summary.passedAfterRetry).toBe(2);
    for (const key of ['web/1.yaml', 'web/2.yaml']) {
      expect(
        state.events.filter((event) => event === `before:${key}`),
      ).toHaveLength(1);
      expect(
        state.events.filter((event) => event === `eachBefore:${key}`),
      ).toHaveLength(2);
      expect(new Set(state.contexts.get(key)).size).toBe(1);
    }
  });

  it('cleans partial file setup failures and continues with independent files', async () => {
    const { state, run } = fixture({ global: 1 });
    state.fileSetup = async (key) => {
      if (key === 'web/1.yaml') throw new Error('device unavailable');
    };
    const result = await run();
    expect(result.status).toBe('failed');
    expect(state.events).toContain('file-end:web/1.yaml');
    expect(state.events).not.toContain('before:web/1.yaml');
    expect(state.events).not.toContain('after:web/1.yaml');
    expect(state.events).toContain('step:web/2.yaml');
  });

  it.each([
    new Error('Browser has been closed', {
      cause: new WorkflowError('Shared Browser disconnected', {
        code: 'PROJECT_RESOURCE_ERROR',
      }),
    }),
    new WorkflowError('Shared device allocation service failed', {
      code: 'PROJECT_RESOURCE_ERROR',
    }),
  ])(
    'stops only the Project whose shared resource failed: %s',
    async (error) => {
      const { state, run } = fixture({
        projects: ['web', 'android'],
        global: 1,
        retry: 2,
      });
      state.node = async (phase, context) => {
        if (phase === 'step' && context.key === 'web/1.yaml') throw error;
      };
      const result = await run();
      expect(result.status).toBe('failed');
      expect(state.events).not.toContain('file:web/2.yaml');
      expect(state.events).toContain('step:android/2.yaml');
      expect(result.cases[0].attempts).toHaveLength(1);
    },
  );

  it.each([1, 2, null])(
    'releases a failed setup under a Project limit of %s without stopping peers',
    async (projectLimit) => {
      const { state, run } = fixture({
        projects: ['web', 'android'],
        global: 2,
        projectLimit,
      });
      state.setup = async (project) => {
        if (project === 'web') throw new Error('launch failed');
      };
      const result = await run();
      expect(result.status).toBe('failed');
      expect(state.events).toContain('project-end:web');
      expect(state.events).not.toContain('file:web/1.yaml');
      expect(state.events).toContain('step:android/2.yaml');
      expect(
        result.projects[0].cases.every(
          (item) => item.notRunReason === 'project-setup-failed',
        ),
      ).toBe(true);
    },
  );

  it('requests cancellation of sibling files when their shared environment fails', async () => {
    const { state, run } = fixture({ files: 3, global: 2 });
    const both = gate();
    let started = 0;
    let cancelled = false;
    state.node = async (phase, context, signal) => {
      if (phase !== 'step') return;
      if (++started === 2) both.resolve();
      await both.promise;
      if (context.key === 'web/1.yaml')
        throw new WorkflowError('Browser disconnected', {
          code: 'PROJECT_RESOURCE_ERROR',
        });
      await new Promise<void>((resolve) => {
        if (signal.aborted) resolve();
        else signal.addEventListener('abort', () => resolve(), { once: true });
      });
      cancelled = signal.aborted;
      signal.throwIfAborted();
    };
    const result = await run();
    expect(result.status).toBe('failed');
    expect(cancelled).toBe(true);
    expect(state.events).not.toContain('file:web/3.yaml');
    expect(state.events).toContain('project-end:web');
  });

  it.each(['fileSetup', 'beforeAll'])(
    'stops Project admissions as soon as %s confirms shared resource failure',
    async (phase) => {
      const { state, run } = fixture({
        projects: ['web', 'android'],
        global: 2,
        local: 1,
      });
      const cleanup = gate();
      const fail = () => {
        throw new WorkflowError('Shared Browser disconnected', {
          code: 'PROJECT_RESOURCE_ERROR',
        });
      };
      state.fileSetup = async (key) => {
        if (phase === 'fileSetup' && key === 'web/1.yaml') fail();
      };
      state.node = async (node, context) => {
        if (
          phase === 'beforeAll' &&
          node === 'before' &&
          context.key === 'web/1.yaml'
        )
          fail();
      };
      state.fileCleanup = async (key) => {
        if (key === 'web/1.yaml') await cleanup.promise;
      };
      const resultPromise = run();
      await waitFor(() => state.events.includes('step:android/2.yaml'));
      expect(state.events).not.toContain('file:web/2.yaml');
      cleanup.resolve();
      expect((await resultPromise).status).toBe('failed');
    },
  );

  it('handles arbitrary nested error data as a file failure', async () => {
    const { state, run } = fixture({ global: 1 });
    state.node = async (phase, context) => {
      if (phase === 'step' && context.key === 'web/1.yaml')
        throw new Error('file failed', { cause: { message: 42 } });
    };
    expect((await run()).status).toBe('failed');
    expect(state.events).toContain('step:web/2.yaml');
  });

  it.each([
    'Browser has been closed',
    'browser.newContext: Target page, context or browser has been closed',
    'BrowserContext has been closed',
    'page.click: Target page, context or browser has been closed',
  ])(
    'does not mistake a file-local page/context error for a disconnected shared Browser: %s',
    async (message) => {
      const { state, run } = fixture({ global: 1 });
      state.node = async (phase, context) => {
        if (phase === 'step' && context.key === 'web/1.yaml')
          throw new Error(message);
      };
      const result = await run();
      expect(result.status).toBe('failed');
      expect(state.events).toContain('step:web/2.yaml');
    },
  );

  it.each(['fileSetup', 'cleanup'])(
    'does not stop sibling files for an unclassified Browser closure in %s',
    async (phase) => {
      const { state, run } = fixture({ global: 1 });
      const fail = async (key: string) => {
        if (key === 'web/1.yaml') throw new Error('Browser has been closed');
      };
      if (phase === 'fileSetup') state.fileSetup = fail;
      else state.fileCleanup = fail;
      const result = await run();
      expect(result.status).toBe('failed');
      expect(state.events).toContain('step:web/2.yaml');
      expect(state.events).toContain('project-end:web');
    },
  );

  it('continues independent files after a file device goes offline or its cleanup throws', async () => {
    const { state, run } = fixture({
      projects: ['android'],
      files: 3,
      global: 1,
      retry: 2,
    });
    state.node = async (phase, context) => {
      if (phase === 'step' && context.key === 'android/1.yaml')
        throw new FatalDeviceError('device offline');
    };
    state.fileCleanup = async (key) => {
      if (key === 'android/2.yaml') throw new Error('file cleanup failed');
    };
    const result = await run();
    expect(result.status).toBe('failed');
    expect(state.events).toContain('step:android/3.yaml');
    expect(state.events).toContain('project-end:android');
    expect(result.cases[0].attempts).toHaveLength(1);
    expect(result.documents[1].cleanup?.status).toBe('failed');
  });

  it('runs afterAll and cleanup after beforeAll fails, without rerunning file setup', async () => {
    const { state, run } = fixture({ global: 1, retry: 2 });
    state.node = async (phase, context) => {
      if (phase === 'before' && context.key === 'web/1.yaml')
        throw new Error('precondition failed');
    };
    const result = await run();
    expect(result.status).toBe('failed');
    expect(state.events).not.toContain('step:web/1.yaml');
    expect(state.events).toContain('after:web/1.yaml');
    expect(state.events).toContain('file-end:web/1.yaml');
    expect(
      state.events.filter((event) => event === 'file:web/1.yaml'),
    ).toHaveLength(1);
    expect(state.events).toContain('step:web/2.yaml');
  });

  it('cancels active work, skips queued files and cleans initialized Projects', async () => {
    const { state, run } = fixture({
      projects: ['web', 'android'],
      files: 3,
      global: 1,
    });
    const started = gate();
    const running = gate();
    const listenersBefore = new Set(process.listeners('SIGINT'));
    state.node = async (phase, context, signal) => {
      if (phase !== 'step' || context.key !== 'android/1.yaml') return;
      started.resolve();
      await running.promise;
      signal.throwIfAborted();
    };
    const resultPromise = run();
    await started.promise;
    const interrupt = process
      .listeners('SIGINT')
      .find((listener) => !listenersBefore.has(listener));
    expect(interrupt).toBeTypeOf('function');
    interrupt!.call(process, 'SIGINT');
    running.resolve();
    const result = await resultPromise;
    expect(result.status).toBe('failed');
    expect(
      state.events.filter((event) => event.startsWith('file:')),
    ).toHaveLength(2);
    expect(state.events).toContain('project-end:web');
    expect(state.events).toContain('project-end:android');
    expect(
      result.cases.filter((item) => item.notRunReason === 'interrupted'),
    ).toHaveLength(4);
    expect(process.listeners('SIGINT')).toEqual([...listenersBefore]);
  });

  it('does not admit another file while a timed-out setup or its cleanup is unresolved', async () => {
    const { state, run } = fixture({
      global: 1,
      setupTimeout: 10,
      teardownTimeout: 20,
    });
    const setup = gate();
    state.fileSetup = async () => setup.promise;
    const result = await run().catch((error: unknown) => {
      expect(error).toBeInstanceOf(WorkflowExecutionFailure);
      return (error as WorkflowExecutionFailure<TestProjectRunResult>).result;
    });
    expect(result.status).toBe('failed');
    expect(result.documents[0].hostErrors?.[0].error).toMatchObject({
      code: 'SETUP_TIMEOUT',
    });
    expect(result.documents[0].cleanup?.status).toBe('pending');
    expect(state.events).not.toContain('file:web/2.yaml');
    expect(state.events).not.toContain('file-cleanup:web/1.yaml');
    setup.resolve();
    await waitFor(() => state.events.includes('file-end:web/1.yaml'));
    await waitFor(() => state.events.includes('project-end:web'));
    // Late operation events retain this run's journal until actual settlement.
    await new Promise<void>((resolve) => setImmediate(resolve));
  });

  it('stops new admissions on bail and cleans idle initialized Projects', async () => {
    const { state, run } = fixture({
      projects: ['web', 'android'],
      files: 3,
      global: 1,
      bail: 1,
    });
    state.node = async (phase, context) => {
      if (phase === 'step' && context.key === 'android/1.yaml')
        throw new Error('bail');
    };
    const result = await run();
    expect(result.status).toBe('failed');
    expect(state.events.filter((event) => event.startsWith('file:'))).toEqual([
      'file:web/1.yaml',
      'file:android/1.yaml',
    ]);
    expect(state.events).toContain('project-end:web');
    expect(state.events).toContain('project-end:android');
    expect(
      result.cases.filter((item) => item.status === 'not-run'),
    ).toHaveLength(4);
  });

  it('retains the global admission after cleanup times out, including queued idle Project cleanup', async () => {
    const { state, run } = fixture({
      projects: ['web', 'android'],
      files: 3,
      global: 1,
      bail: 1,
      teardownTimeout: 20,
    });
    const fileCleanup = gate();
    const projectCleanup = gate();
    state.node = async (phase, context) => {
      if (phase === 'step' && context.key === 'android/1.yaml')
        throw new Error('bail');
    };
    state.fileCleanup = async (key) => {
      if (key === 'android/1.yaml') await fileCleanup.promise;
    };
    state.projectCleanup = async (project) => {
      if (project === 'android') await projectCleanup.promise;
    };
    const result = await run().catch((error: unknown) => {
      expect(error).toBeInstanceOf(WorkflowExecutionFailure);
      return (error as WorkflowExecutionFailure<TestProjectRunResult>).result;
    });
    expect(result.status).toBe('failed');
    expect(
      result.projects.every(
        (project) => project.lifecycle?.cleanup?.status === 'pending',
      ),
    ).toBe(true);
    expect(state.events).not.toContain('project-cleanup:web');
    expect(state.events).not.toContain('project-cleanup:android');
    fileCleanup.resolve();
    await waitFor(() => state.events.includes('project-cleanup:android'));
    expect(state.events).not.toContain('project-cleanup:web');
    projectCleanup.resolve();
    await waitFor(() => state.events.includes('project-end:web'));
    await new Promise<void>((resolve) => setImmediate(resolve));
  });
});
