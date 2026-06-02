import { describe, expect, it } from 'vitest';
import {
  type RsbuildLike,
  type RunRstestWithVirtualModulesOptions,
  buildRstestInlineConfig,
} from '../../src/rstest';

const createFakeRsbuild = () => {
  const created: Record<string, string>[] = [];
  const rsbuild: RsbuildLike = {
    rspack: {
      experiments: {
        VirtualModulesPlugin: class {
          constructor(modules: Record<string, string>) {
            created.push(modules);
          }
        },
      },
    },
  };
  return { rsbuild, created };
};

const base: RunRstestWithVirtualModulesOptions = {
  cwd: '/proj',
  root: '/proj',
  include: ['virtual:a.test.ts'],
  virtualModules: { 'virtual:a.test.ts': 'export {};' },
  rsbuildEntry: '/proj/node_modules/@rsbuild/core',
};

describe('buildRstestInlineConfig', () => {
  it('registers the virtual modules via VirtualModulesPlugin under a node env', () => {
    const { rsbuild, created } = createFakeRsbuild();
    const config = buildRstestInlineConfig(base, rsbuild);

    expect(config.testEnvironment).toBe('node');
    expect(config.include).toEqual(['virtual:a.test.ts']);

    const appended: unknown[] = [];
    (
      config.tools as {
        rspack: (
          c: unknown,
          h: { appendPlugins: (p: unknown) => void },
        ) => void;
      }
    ).rspack({}, { appendPlugins: (p) => appended.push(p) });

    expect(appended).toHaveLength(1);
    expect(created).toEqual([{ 'virtual:a.test.ts': 'export {};' }]);
  });

  it('omits optional run-level keys when unset', () => {
    const { rsbuild } = createFakeRsbuild();
    const config = buildRstestInlineConfig(base, rsbuild);
    for (const key of [
      'testTimeout',
      'maxConcurrency',
      'pool',
      'bail',
      'reporters',
    ]) {
      expect(key in config).toBe(false);
    }
  });

  it('maps maxConcurrency to a single-sized pool and forwards run-level options', () => {
    const { rsbuild } = createFakeRsbuild();
    const config = buildRstestInlineConfig(
      { ...base, testTimeout: 0, maxConcurrency: 2, bail: 1, reporters: [] },
      rsbuild,
    );
    expect(config.testTimeout).toBe(0);
    expect(config.maxConcurrency).toBe(2);
    expect(config.pool).toEqual({ maxWorkers: 2, minWorkers: 2 });
    expect(config.bail).toBe(1);
    expect(config.reporters).toEqual([]);
  });
});
