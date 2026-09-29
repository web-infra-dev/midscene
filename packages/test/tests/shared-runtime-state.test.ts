import { createRequire } from 'node:module';
import * as esmRunner from '@midscene/core/internal/test-runner';
import type * as RunnerRuntime from '@midscene/core/internal/test-runner';
import * as esmYaml from '@midscene/core/internal/yaml-runtime';
import type * as YamlRuntime from '@midscene/core/internal/yaml-runtime';
import type * as CoreYaml from '@midscene/core/yaml';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const cjsRunner =
  require('@midscene/core/internal/test-runner') as typeof RunnerRuntime;
const cjsYaml =
  require('@midscene/core/internal/yaml-runtime') as typeof YamlRuntime;
const { ScriptPlayer } = require('@midscene/core/yaml') as typeof CoreYaml;

describe('CJS frontend with an ESM platform host', () => {
  it('keeps player host state internal and shares it across CJS and ESM', async () => {
    const failure = new Error('setup failed');
    const player = new ScriptPlayer(
      { agent: { generateReport: false }, tasks: [] },
      async () => {
        throw failure;
      },
    );
    const state = esmYaml.getLegacyYamlPlayerState(player);
    state.fallbackReportFileName = 'internal-fallback';
    expect(cjsYaml.getLegacyYamlPlayerState(player)).toBe(state);
    await player.run();
    expect(state.executionRecord?.setupError).toBe(failure);
    expect(state.fallbackReportFileName).toBe('internal-fallback');
    expect(player.run.length).toBe(0);
    for (const field of [
      'executionResult',
      'executionRecord',
      'fallbackReportFileName',
    ])
      expect(field in player).toBe(false);
    expect(() => esmYaml.getLegacyYamlPlayerState({})).toThrow(
      'initialized YAML ScriptPlayer',
    );
    expect(require('@midscene/core/yaml')).not.toHaveProperty(
      'getLegacyYamlPlayerState',
    );
  });

  it('shares nested YAML ownership across both core entry points', async () => {
    const agent = {};
    await cjsYaml.runInYamlExecutionContext(async () => {
      const root = cjsYaml.enterYamlExecution(agent);
      await Promise.resolve();
      await esmYaml.runInYamlExecutionContext(async () => {
        const nested = esmYaml.enterYamlExecution(agent);
        expect(root.isRoot).toBe(true);
        expect(nested.isRoot).toBe(false);
        nested.finish();
      });
      root.finish();
    });
    await esmYaml.runInYamlExecutionContext(async () => {
      const next = esmYaml.enterYamlExecution(agent);
      expect(next.isRoot).toBe(true);
      next.finish();
    });
  });

  it('shares resource leases and parent scopes across both core entry points', async () => {
    const parent = new AbortController();
    const child = new AbortController();
    cjsRunner.linkResourceSignal(child.signal, parent.signal);
    let finish!: () => void;
    const operation = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const agent = {};
    esmRunner.trackResourceOperation(agent, operation, child.signal);
    child.abort();
    expect(() => cjsRunner.assertResourceAvailable(agent)).toThrow(
      'Cannot reuse',
    );
    const cleanup = vi.fn(async () => {});
    const failure = await cjsRunner
      .cleanupScopeResources(parent.signal, cleanup, {
        graceMs: 5,
        onDeferredError: vi.fn(),
      })
      .catch((error) => error);
    expect(failure.code).toBe('RESOURCE_CLEANUP_DEFERRED');
    expect(cleanup).not.toHaveBeenCalled();
    finish();
    await esmRunner.getResourceCleanupCompletion(parent.signal);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
