import { describe, expect, it, vi } from 'vitest';
import { NodeRegistry } from '../src';
import { createAndroidNodes } from '../src/android';
import { runCollectedCase } from '../src/engine/run-collected-case';
import type { CollectedCase } from '../src/parser/types';

const collected = (
  steps: CollectedCase['definition']['steps'],
): CollectedCase => ({
  caseId: 'android-nodes',
  projectId: 'project',
  sourcePath: 'flows/android.yaml',
  caseIndex: 0,
  definition: { name: 'android nodes', steps },
});

describe('createAndroidNodes', () => {
  it('runs ADB shell commands and maps timeoutMs to the Agent option', async () => {
    const runAdbShell = vi.fn(async () => 'package:com.example.app');
    const registry = new NodeRegistry(
      createAndroidNodes({ getAgent: () => ({ runAdbShell }) }),
    );
    const result = await runCollectedCase(
      collected([
        {
          node: 'runAdbShell',
          input: { command: 'pm list packages', timeoutMs: 5_000 },
          meta: { continueOnError: false },
        },
      ]),
      { resolveNode: registry.require.bind(registry), context: undefined },
    );

    expect(result.status).toBe('success');
    expect(runAdbShell).toHaveBeenCalledWith('pm list packages', {
      timeout: 5_000,
    });
    expect(result.steps[0].output?.data).toEqual({
      stdout: 'package:com.example.app',
    });
  });

  it('supports string shorthand and rejects adb-prefixed commands', async () => {
    const runAdbShell = vi.fn(async () => 'ok');
    const registry = new NodeRegistry(
      createAndroidNodes({ getAgent: () => ({ runAdbShell }) }),
    );
    const shorthand = await runCollectedCase(
      collected([
        {
          node: 'runAdbShell',
          input: { prompt: 'dumpsys battery' },
          meta: { continueOnError: false },
        },
      ]),
      { resolveNode: registry.require.bind(registry), context: undefined },
    );
    expect(shorthand.status).toBe('success');
    expect(runAdbShell).toHaveBeenCalledWith('dumpsys battery', {});

    const prefixed = await runCollectedCase(
      collected([
        {
          node: 'runAdbShell',
          input: { prompt: 'adb shell dumpsys battery' },
          meta: { continueOnError: false },
        },
      ]),
      { resolveNode: registry.require.bind(registry), context: undefined },
    );
    expect(prefixed.steps[0].error?.message).toContain(
      'must not include an adb',
    );
  });

  it('validates factory options and Agent capability', async () => {
    expect(() => createAndroidNodes({} as never)).toThrow(
      'createAndroidNodes() requires getAgent()',
    );
    const registry = new NodeRegistry(
      createAndroidNodes({ getAgent: () => ({}) }),
    );
    const result = await runCollectedCase(
      collected([
        {
          node: 'runAdbShell',
          input: { command: 'id' },
          meta: { continueOnError: false },
        },
      ]),
      { resolveNode: registry.require.bind(registry), context: undefined },
    );
    expect(result.steps[0].error?.message).toContain(
      'Android Agent with runAdbShell()',
    );
  });
});
