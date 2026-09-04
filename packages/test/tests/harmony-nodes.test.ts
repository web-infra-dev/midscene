import { describe, expect, it, vi } from 'vitest';
import { NodeRegistry } from '../src';
import { runCollectedCase } from '../src/engine/run-collected-case';
import { type HarmonyRunnerAgent, createHarmonyNodes } from '../src/harmony';
import type { CollectedCase } from '../src/parser/types';

const collected = (
  steps: CollectedCase['definition']['steps'],
): CollectedCase => ({
  caseId: 'harmony-nodes',
  projectId: 'project',
  sourcePath: 'flows/harmony.yaml',
  caseIndex: 0,
  definition: { name: 'harmony nodes', steps },
});

const harmonyAgent = (
  overrides: Partial<HarmonyRunnerAgent> = {},
): HarmonyRunnerAgent => ({
  launch: vi.fn(async () => undefined),
  terminate: vi.fn(async () => undefined),
  runHdcShell: vi.fn(async () => ''),
  back: vi.fn(async () => undefined),
  home: vi.fn(async () => undefined),
  recentApps: vi.fn(async () => undefined),
  ...overrides,
});

describe('createHarmonyNodes', () => {
  it('preserves Agent method contracts and platform operations', async () => {
    const launch = vi.fn(async () => undefined);
    const runHdcShell = vi.fn(async () => 'bundleName:com.example.app');
    const back = vi.fn(async () => undefined);
    const registry = new NodeRegistry(
      createHarmonyNodes({
        getAgent: () => harmonyAgent({ launch, runHdcShell, back }),
      }),
    );

    expect(registry.names()).toEqual([
      'launch',
      'terminate',
      'runHdcShell',
      'back',
      'home',
      'recentApps',
    ]);
    const result = await runCollectedCase(
      collected([
        {
          node: 'launch',
          input: { uri: 'com.example.app' },
          meta: { continueOnError: false },
        },
        {
          node: 'runHdcShell',
          input: { command: 'bm dump -a' },
          meta: { continueOnError: false },
        },
        {
          node: 'back',
          input: {},
          meta: { continueOnError: false },
        },
      ]),
      { resolveNode: registry.require.bind(registry), context: undefined },
    );

    expect(result.status).toBe('success');
    expect(launch).toHaveBeenCalledWith('com.example.app');
    expect(runHdcShell).toHaveBeenCalledWith('bm dump -a');
    expect(back).toHaveBeenCalledWith();
    expect(result.steps[1].output?.data).toEqual({
      stdout: 'bundleName:com.example.app',
    });
  });

  it('rejects prefixed commands and missing Agent capabilities', async () => {
    const prefixedRegistry = new NodeRegistry(
      createHarmonyNodes({ getAgent: () => harmonyAgent() }),
    );
    const prefixed = await runCollectedCase(
      collected([
        {
          node: 'runHdcShell',
          input: { command: 'hdc shell bm dump -a' },
          meta: { continueOnError: false },
        },
      ]),
      {
        resolveNode: prefixedRegistry.require.bind(prefixedRegistry),
        context: undefined,
      },
    );
    expect(prefixed.steps[0].error?.message).toContain(
      'must not include an hdc',
    );

    const missingRegistry = new NodeRegistry(
      createHarmonyNodes({ getAgent: () => ({}) as never }),
    );
    const missing = await runCollectedCase(
      collected([
        {
          node: 'launch',
          input: { uri: 'com.example.app' },
          meta: { continueOnError: false },
        },
      ]),
      {
        resolveNode: missingRegistry.require.bind(missingRegistry),
        context: undefined,
      },
    );
    expect(missing.steps[0].error?.message).toContain(
      'Harmony Agent with launch()',
    );
  });

  it('validates factory options', () => {
    expect(() => createHarmonyNodes({} as never)).toThrow(
      'createHarmonyNodes() requires getAgent()',
    );
  });
});
