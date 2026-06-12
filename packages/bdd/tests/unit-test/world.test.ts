/**
 * Unit tests for MidsceneWorld + the per-worker runtime singleton. No
 * cucumber run, no browser: both agent modules are mocked.
 */
import type { IWorldOptions } from '@cucumber/cucumber';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createUiAgent } from '../../src/agents/ui-agent';
import { ERROR_PREFIX } from '../../src/types';
import type { ResolvedBddConfig, UiAgent } from '../../src/types';
import {
  type BddRuntime,
  MidsceneWorld,
  cleanupError,
  destroyWorkerUiAgent,
  getRuntime,
  resetRuntime,
  setRuntime,
} from '../../src/world';

const { generalDisposeSpy, generalCtorSpy, codexCtorSpy } = vi.hoisted(() => ({
  generalDisposeSpy: vi.fn(async () => {}),
  generalCtorSpy: vi.fn(),
  codexCtorSpy: vi.fn(),
}));

vi.mock('../../src/agents/ui-agent', () => ({
  createUiAgent: vi.fn(),
}));

vi.mock('../../src/agents/opencode-agent', () => ({
  OpencodeGeneralAgent: class {
    run = vi.fn();
    dispose = generalDisposeSpy;
    constructor(...args: unknown[]) {
      generalCtorSpy(...args);
    }
  },
}));

vi.mock('../../src/agents/codex-agent', () => ({
  CodexGeneralAgent: class {
    run = vi.fn();
    dispose = generalDisposeSpy;
    constructor(...args: unknown[]) {
      codexCtorSpy(...args);
    }
  },
}));

const mockedCreateUiAgent = vi.mocked(createUiAgent);

function makeWorld(): MidsceneWorld {
  const options = {
    attach: vi.fn(),
    log: vi.fn(),
    link: vi.fn(),
    parameters: {},
  } as unknown as IWorldOptions;
  return new MidsceneWorld(options);
}

function makeConfig(): ResolvedBddConfig {
  return {
    uiAgent: { type: 'web', url: 'http://localhost' },
    generalAgent: { model: 'test-model' },
    paths: { features: ['features/**/*.feature'], skills: 'features/skills' },
    baseDir: '/tmp/project',
  };
}

function makeRuntime(): BddRuntime {
  return {
    config: makeConfig(),
    flows: {
      matchStep: () => undefined,
      getByName: () => undefined,
      list: () => [],
    },
    skills: new Map(),
  };
}

function makeFakeAgent(over: Partial<UiAgent> = {}): UiAgent {
  return {
    aiAct: vi.fn(),
    aiAssert: vi.fn(),
    reportFile: '/tmp/midscene-report.html',
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  setRuntime(makeRuntime());
});

afterEach(() => {
  resetRuntime();
});

describe('runtime singleton', () => {
  it('set/get roundtrips', () => {
    const rt = makeRuntime();
    setRuntime(rt);
    expect(getRuntime()).toBe(rt);
  });

  it('getRuntime throws a pointed error when uninitialized', () => {
    resetRuntime();
    expect(() => getRuntime()).toThrow(
      `${ERROR_PREFIX} Runtime not initialized — is @midscene/bdd/register imported by cucumber?`,
    );
  });
});

describe('MidsceneWorld.getUiAgent', () => {
  it('creates the agent once for concurrent calls', async () => {
    const agent = makeFakeAgent();
    let release: (() => void) | undefined;
    mockedCreateUiAgent.mockImplementation(
      () =>
        new Promise((resolveCreate) => {
          release = () => resolveCreate({ agent });
        }),
    );

    const world = makeWorld();
    const first = world.getUiAgent();
    const second = world.getUiAgent();
    release?.();

    expect(await first).toBe(agent);
    expect(await second).toBe(agent);
    expect(mockedCreateUiAgent).toHaveBeenCalledTimes(1);
    expect(mockedCreateUiAgent).toHaveBeenCalledWith(getRuntime().config);
  });

  it('peekUiAgent is undefined before creation and the agent after', async () => {
    const agent = makeFakeAgent();
    mockedCreateUiAgent.mockResolvedValue({ agent });

    const world = makeWorld();
    expect(world.peekUiAgent()).toBeUndefined();
    await world.getUiAgent();
    expect(world.peekUiAgent()).toBe(agent);
  });

  it('a failed creation clears the slot so a later call retries', async () => {
    const agent = makeFakeAgent();
    mockedCreateUiAgent
      .mockRejectedValueOnce(new Error('browser launch failed'))
      .mockResolvedValueOnce({ agent });

    const world = makeWorld();
    await expect(world.getUiAgent()).rejects.toThrow('browser launch failed');
    expect(world.peekUiAgent()).toBeUndefined();
    expect(await world.getUiAgent()).toBe(agent);
    expect(mockedCreateUiAgent).toHaveBeenCalledTimes(2);
  });
});

describe('MidsceneWorld.getGeneralAgent', () => {
  it('lazily constructs one opencode agent (default type) and caches it', async () => {
    const world = makeWorld();
    const first = await world.getGeneralAgent();
    const second = await world.getGeneralAgent();

    expect(second).toBe(first);
    expect(generalCtorSpy).toHaveBeenCalledTimes(1);
    expect(generalCtorSpy).toHaveBeenCalledWith(
      getRuntime().config.generalAgent,
      getRuntime().config.baseDir,
    );
    expect(codexCtorSpy).not.toHaveBeenCalled();
  });

  it("constructs the codex agent for type: 'codex'", async () => {
    setRuntime({
      ...getRuntime(),
      config: {
        ...getRuntime().config,
        generalAgent: { type: 'codex' },
      },
    });
    const world = makeWorld();
    await world.getGeneralAgent();
    expect(codexCtorSpy).toHaveBeenCalledTimes(1);
    expect(codexCtorSpy).toHaveBeenCalledWith(
      { type: 'codex' },
      getRuntime().config.baseDir,
    );
    expect(generalCtorSpy).not.toHaveBeenCalled();
  });

  it('uses config.generalAgent.factory when provided, bypassing the CLI adapters', async () => {
    const fake = { run: vi.fn() };
    const factory = vi.fn(async () => fake);
    setRuntime({
      ...getRuntime(),
      config: {
        ...getRuntime().config,
        generalAgent: { factory },
      },
    });
    const world = makeWorld();
    const first = await world.getGeneralAgent();
    const second = await world.getGeneralAgent();
    expect(first).toBe(fake);
    expect(second).toBe(fake);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(generalCtorSpy).not.toHaveBeenCalled();
  });
});

describe('MidsceneWorld.destroyAgents', () => {
  it('captures reportFile before cleanup and runs cleanup + dispose', async () => {
    const agent = makeFakeAgent();
    const cleanup = vi.fn(async () => {
      // Simulate teardown invalidating the report path.
      agent.reportFile = null;
    });
    mockedCreateUiAgent.mockResolvedValue({ agent, cleanup });

    const world = makeWorld();
    await world.getUiAgent();
    await world.getGeneralAgent();

    const { reportFile } = await world.destroyAgents();
    expect(reportFile).toBe('/tmp/midscene-report.html');
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(generalDisposeSpy).toHaveBeenCalledTimes(1);
    expect(world.peekUiAgent()).toBeUndefined();
  });

  it('falls back to agent.destroy when the factory gave no cleanup', async () => {
    const destroy = vi.fn(async () => {});
    const agent = makeFakeAgent({ destroy });
    mockedCreateUiAgent.mockResolvedValue({ agent });

    const world = makeWorld();
    await world.getUiAgent();
    await world.destroyAgents();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('aggregates cleanup errors and still attempts every teardown', async () => {
    const agent = makeFakeAgent();
    const cleanup = vi.fn(async () => {
      throw new Error('browser close failed');
    });
    generalDisposeSpy.mockRejectedValueOnce(new Error('dispose failed'));
    mockedCreateUiAgent.mockResolvedValue({ agent, cleanup });

    const world = makeWorld();
    await world.getUiAgent();
    await world.getGeneralAgent();

    // destroyAgents never throws — errors are RETURNED so the caller (the
    // After hook) can attach the report path before surfacing them.
    const { errors } = await world.destroyAgents();
    expect(errors.map((e) => e.message)).toEqual([
      'browser close failed',
      'dispose failed',
    ]);
    expect(cleanupError(errors).message).toBe(
      `${ERROR_PREFIX} Agent cleanup failed (2 error(s)): browser close failed; dispose failed`,
    );
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(generalDisposeSpy).toHaveBeenCalledTimes(1);
    // State is cleared even when cleanup fails.
    expect(world.peekUiAgent()).toBeUndefined();
  });

  it('still returns the report path when cleanup fails', async () => {
    const agent = makeFakeAgent();
    agent.reportFile = '/tmp/report.html';
    mockedCreateUiAgent.mockResolvedValue({
      agent,
      cleanup: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    const world = makeWorld();
    await world.getUiAgent();
    const { reportFile, errors } = await world.destroyAgents();
    expect(reportFile).toBe('/tmp/report.html');
    expect(errors).toHaveLength(1);
  });

  it('is a no-op (and returns no reportFile) when nothing was created', async () => {
    const world = makeWorld();
    await expect(world.destroyAgents()).resolves.toEqual({
      reportFile: undefined,
      errors: [],
    });
  });

  it('waits for an in-flight creation so the browser does not leak', async () => {
    const agent = makeFakeAgent();
    const cleanup = vi.fn(async () => {});
    let release: (() => void) | undefined;
    mockedCreateUiAgent.mockImplementation(
      () =>
        new Promise((resolveCreate) => {
          release = () => resolveCreate({ agent, cleanup });
        }),
    );

    const world = makeWorld();
    const pending = world.getUiAgent();
    const destroying = world.destroyAgents();
    release?.();

    await pending;
    const { reportFile } = await destroying;
    expect(reportFile).toBe('/tmp/midscene-report.html');
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});

describe("uiAgent scope: 'worker'", () => {
  function setWorkerScopedRuntime(): void {
    const runtime = makeRuntime();
    runtime.config.uiAgent = {
      type: 'web',
      url: 'http://localhost',
      scope: 'worker',
    };
    setRuntime(runtime);
  }

  it('creates one agent shared across Worlds (scenarios)', async () => {
    setWorkerScopedRuntime();
    const agent = makeFakeAgent();
    const cleanup = vi.fn(async () => {});
    mockedCreateUiAgent.mockResolvedValue({ agent, cleanup });

    const worldA = makeWorld();
    const worldB = makeWorld();
    expect(await worldA.getUiAgent()).toBe(agent);
    expect(await worldB.getUiAgent()).toBe(agent);
    expect(mockedCreateUiAgent).toHaveBeenCalledTimes(1);
    expect(worldB.peekUiAgent()).toBe(agent);
  });

  it('destroyAgents keeps the worker agent alive but still reports its reportFile', async () => {
    setWorkerScopedRuntime();
    const agent = makeFakeAgent();
    const cleanup = vi.fn(async () => {});
    mockedCreateUiAgent.mockResolvedValue({ agent, cleanup });

    const world = makeWorld();
    await world.getUiAgent();
    await world.getGeneralAgent();

    const { reportFile, errors } = await world.destroyAgents();
    expect(reportFile).toBe('/tmp/midscene-report.html');
    expect(errors).toEqual([]);
    expect(cleanup).not.toHaveBeenCalled();
    // The general agent IS per-scenario even under worker scope.
    expect(generalDisposeSpy).toHaveBeenCalledTimes(1);
    // Still reachable by the next scenario.
    expect(makeWorld().peekUiAgent()).toBe(agent);
  });

  it('destroyWorkerUiAgent tears the shared agent down (AfterAll path)', async () => {
    setWorkerScopedRuntime();
    const agent = makeFakeAgent();
    const cleanup = vi.fn(async () => {});
    mockedCreateUiAgent.mockResolvedValue({ agent, cleanup });

    await makeWorld().getUiAgent();
    // Report attachment happens per scenario (destroyAgents); AfterAll only
    // tears down, so errors is the entire contract here.
    const { errors } = await destroyWorkerUiAgent();
    expect(errors).toEqual([]);
    expect(cleanup).toHaveBeenCalledTimes(1);

    // A later call is a no-op...
    await expect(destroyWorkerUiAgent()).resolves.toEqual({ errors: [] });
    // ...and a new scenario would create a fresh agent.
    await makeWorld().getUiAgent();
    expect(mockedCreateUiAgent).toHaveBeenCalledTimes(2);
  });

  it('a failed worker-scoped creation clears the slot so the next scenario retries', async () => {
    setWorkerScopedRuntime();
    const agent = makeFakeAgent();
    mockedCreateUiAgent
      .mockRejectedValueOnce(new Error('device offline'))
      .mockResolvedValueOnce({ agent });

    await expect(makeWorld().getUiAgent()).rejects.toThrow('device offline');
    expect(await makeWorld().getUiAgent()).toBe(agent);
  });

  it('destroyWorkerUiAgent is a no-op under the default scenario scope', async () => {
    const agent = makeFakeAgent();
    mockedCreateUiAgent.mockResolvedValue({ agent });
    await makeWorld().getUiAgent();

    await expect(destroyWorkerUiAgent()).resolves.toEqual({ errors: [] });
  });
});

describe('register.ts smoke', () => {
  // SKIPPED: @cucumber/cucumber 13 rejects support-code registration outside
  // its own lifecycle — importing register.ts here throws `You're calling
  // functions (e.g. "setWorldConstructor") on an instance of Cucumber that
  // isn't running (status: PENDING)` (verified empirically). The integration
  // suite covers register.ts inside a real cucumber run.
  it.skip('is importable as a side-effect module', async () => {
    await expect(import('../../src/register')).resolves.toBeDefined();
  });
});
