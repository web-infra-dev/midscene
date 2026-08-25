import { describe, expect, it, vi } from 'vitest';
import { NodeRegistry } from '../src';
import { runCollectedCase } from '../src/engine/run-collected-case';
import { createIOSNodes } from '../src/ios';
import type { CollectedCase } from '../src/parser/types';

const collected = (
  steps: CollectedCase['definition']['steps'],
): CollectedCase => ({
  caseId: 'ios-nodes',
  projectId: 'project',
  sourcePath: 'flows/ios.yaml',
  caseIndex: 0,
  definition: { name: 'ios nodes', steps },
});

describe('createIOSNodes', () => {
  it('runs WDA requests and returns their structured response', async () => {
    const runWdaRequest = vi.fn(async () => ({ value: { scale: 3 } }));
    const registry = new NodeRegistry(
      createIOSNodes({
        getAgent: () => ({
          launch: vi.fn(async () => undefined),
          terminate: vi.fn(async () => undefined),
          runWdaRequest,
        }),
      }),
    );
    expect(registry.names()).toEqual(['launch', 'terminate', 'runWdaRequest']);
    const result = await runCollectedCase(
      collected([
        {
          node: 'runWdaRequest',
          input: {
            method: 'POST',
            endpoint: '/wda/pressButton',
            data: { name: 'home' },
          },
          meta: { continueOnError: false },
        },
      ]),
      { resolveNode: registry.require.bind(registry), context: undefined },
    );

    expect(result.status).toBe('success');
    expect(runWdaRequest).toHaveBeenCalledWith({
      method: 'POST',
      endpoint: '/wda/pressButton',
      data: { name: 'home' },
    });
    expect(result.steps[0].output?.data).toEqual({ value: { scale: 3 } });
  });

  it('owns and delegates iOS lifecycle nodes', async () => {
    const launch = vi.fn(async () => undefined);
    const terminate = vi.fn(async () => undefined);
    const registry = new NodeRegistry(
      createIOSNodes({
        getAgent: () => ({
          launch,
          terminate,
          runWdaRequest: vi.fn(async () => undefined),
        }),
      }),
    );
    const result = await runCollectedCase(
      collected([
        {
          node: 'launch',
          input: { uri: 'com.example.app' },
          meta: { continueOnError: false },
        },
        {
          node: 'terminate',
          input: { prompt: 'com.example.app' },
          meta: { continueOnError: false },
        },
      ]),
      { resolveNode: registry.require.bind(registry), context: undefined },
    );

    expect(result.status).toBe('success');
    expect(launch).toHaveBeenCalledWith('com.example.app');
    expect(terminate).toHaveBeenCalledWith('com.example.app');
  });

  it('rejects unsupported methods and missing Agent capability', async () => {
    const registry = new NodeRegistry(
      createIOSNodes({ getAgent: () => ({}) as never }),
    );
    const invalidMethod = await runCollectedCase(
      collected([
        {
          node: 'runWdaRequest',
          input: { method: 'PATCH', endpoint: '/status' },
          meta: { continueOnError: false },
        },
      ]),
      { resolveNode: registry.require.bind(registry), context: undefined },
    );
    expect(invalidMethod.steps[0].error?.code).toBe(
      'NODE_INPUT_VALIDATION_ERROR',
    );

    const missingMethod = await runCollectedCase(
      collected([
        {
          node: 'runWdaRequest',
          input: { method: 'GET', endpoint: '/status' },
          meta: { continueOnError: false },
        },
      ]),
      { resolveNode: registry.require.bind(registry), context: undefined },
    );
    expect(missingMethod.steps[0].error?.message).toContain(
      'iOS Agent with runWdaRequest()',
    );

    const lifecycleResult = await runCollectedCase(
      collected([
        {
          node: 'terminate',
          input: { uri: 'com.example.app' },
          meta: { continueOnError: false },
        },
      ]),
      { resolveNode: registry.require.bind(registry), context: undefined },
    );
    expect(lifecycleResult.steps[0].error?.message).toContain(
      'iOS Agent with terminate()',
    );
  });

  it('validates factory options', () => {
    expect(() => createIOSNodes({} as never)).toThrow(
      'createIOSNodes() requires getAgent()',
    );
  });
});
