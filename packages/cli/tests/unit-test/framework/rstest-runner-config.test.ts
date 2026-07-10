import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type RstestRspackDeps,
  createRstestInlineConfig,
  resolveDefaultFeatureLoaderPath,
  runRstestYamlProject,
} from '@/framework/rstest-runner';
import { describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runRstest: vi.fn(),
}));

vi.mock('@rstest/core/api', () => ({
  runRstest: mocks.runRstest,
}));

describe('rstest runner config', () => {
  const rspack = {
    experiments: {
      VirtualModulesPlugin: class VirtualModulesPlugin {
        constructor(public modules: Record<string, string>) {}
      },
    },
  } as RstestRspackDeps['rspack'];

  test('suppresses Rstest reporter output by default', async () => {
    const root = mkdtempSync(join(tmpdir(), 'midscene-rstest-config-'));
    mocks.runRstest.mockResolvedValue({ ok: true, unhandledErrors: [] });

    try {
      const exitCode = await runRstestYamlProject({
        cwd: root,
        project: {
          projectDir: root,
          outputDir: join(root, 'output'),
          resultDir: join(root, 'results'),
          include: ['virtual:a.test.ts'],
          virtualModules: {
            'virtual:a.test.ts': 'export {};',
          },
          cases: [],
          maxConcurrency: 1,
          testTimeout: 0,
        },
      });

      expect(exitCode).toBe(0);
      expect(mocks.runRstest).toHaveBeenCalledWith(
        expect.objectContaining({
          inlineConfig: expect.objectContaining({
            reporters: [],
          }),
        }),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('forwards a positive retry count to Rstest', async () => {
    const root = mkdtempSync(join(tmpdir(), 'midscene-rstest-config-'));
    mocks.runRstest.mockResolvedValue({ ok: true, unhandledErrors: [] });

    try {
      await runRstestYamlProject({
        cwd: root,
        project: {
          projectDir: root,
          outputDir: join(root, 'output'),
          resultDir: join(root, 'results'),
          include: ['virtual:a.test.ts'],
          virtualModules: {
            'virtual:a.test.ts': 'export {};',
          },
          cases: [],
          maxConcurrency: 1,
          testTimeout: 0,
          retry: 2,
        },
      });

      expect(mocks.runRstest).toHaveBeenCalledWith(
        expect.objectContaining({
          inlineConfig: expect.objectContaining({
            retry: 2,
          }),
        }),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('omits retry when it is zero or undefined', async () => {
    const root = mkdtempSync(join(tmpdir(), 'midscene-rstest-config-'));
    mocks.runRstest.mockResolvedValue({ ok: true, unhandledErrors: [] });

    try {
      await runRstestYamlProject({
        cwd: root,
        project: {
          projectDir: root,
          outputDir: join(root, 'output'),
          resultDir: join(root, 'results'),
          include: ['virtual:a.test.ts'],
          virtualModules: {
            'virtual:a.test.ts': 'export {};',
          },
          cases: [],
          maxConcurrency: 1,
          testTimeout: 0,
          retry: 0,
        },
      });

      const inlineConfig = mocks.runRstest.mock.calls.at(-1)?.[0].inlineConfig;
      expect(inlineConfig).not.toHaveProperty('retry');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('configures the feature loader when feature loader options are present', () => {
    const root = mkdtempSync(join(tmpdir(), 'midscene-rstest-config-'));
    const feature = join(root, 'checkout.feature');
    const inlineConfig = createRstestInlineConfig(
      {
        projectDir: root,
        outputDir: join(root, 'output'),
        resultDir: join(root, 'results'),
        include: [feature],
        virtualModules: {},
        cases: [],
        maxConcurrency: 1,
        testTimeout: 0,
        featureLoaderOptions: {
          frameworkImport: '@test/framework',
          rstestCoreImport: '@test/rstest-core',
          featureCasesByFile: {
            [feature]: [
              {
                testName: 'checkout.feature > Checkout > Add item',
                resultFile: join(root, 'results', '001-checkout.json'),
              },
            ],
          },
        },
      },
      {
        rspack,
        featureLoaderPath:
          '/repo/packages/cli/dist/lib/framework/feature-loader.js',
      },
    );

    try {
      const config: {
        module?: {
          rules?: Array<{ options?: unknown }>;
        };
      } = {};
      const appendPlugins = vi.fn();
      const configureRspack = inlineConfig.tools?.rspack;
      if (typeof configureRspack !== 'function') {
        throw new Error('Expected rspack config hook');
      }
      configureRspack(
        config as Parameters<typeof configureRspack>[0],
        {
          appendPlugins,
        } as unknown as Parameters<typeof configureRspack>[1],
      );
      expect(config.module?.rules).toEqual([
        expect.objectContaining({
          test: /\.feature$/,
          type: 'javascript/auto',
          loader: '/repo/packages/cli/dist/lib/framework/feature-loader.js',
        }),
      ]);
      expect(config.module?.rules?.[0]?.options).toEqual(
        expect.objectContaining({
          frameworkImport: '@test/framework',
          rstestCoreImport: '@test/rstest-core',
        }),
      );
      expect(appendPlugins).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('resolves the feature loader from both root and framework bundle directories', () => {
    expect(resolveDefaultFeatureLoaderPath('/repo/dist/lib')).toBe(
      '/repo/dist/lib/framework/feature-loader.js',
    );
    expect(resolveDefaultFeatureLoaderPath('/repo/dist/lib/framework')).toBe(
      '/repo/dist/lib/framework/feature-loader.js',
    );
  });

  test('records unreported test errors against only the matching scenario result file', async () => {
    const root = mkdtempSync(join(tmpdir(), 'midscene-rstest-config-'));
    const feature = join(root, 'checkout.feature');
    const firstResult = join(root, 'results', '001-checkout.json');
    const secondResult = join(root, 'results', '002-checkout.json');
    mocks.runRstest.mockResolvedValue({
      ok: false,
      unhandledErrors: [],
      files: [
        {
          name: feature,
          testPath: feature,
          errors: [],
          results: [
            {
              name: 'checkout.feature > Checkout > Add item',
              errors: [
                { message: 'first scenario failed before result write' },
              ],
            },
          ],
        },
      ],
    });

    try {
      const exitCode = await runRstestYamlProject({
        cwd: root,
        stdio: 'pipe',
        project: {
          projectDir: root,
          outputDir: join(root, 'output'),
          resultDir: join(root, 'results'),
          include: [feature],
          virtualModules: {},
          cases: [
            {
              yamlFile: feature,
              testModule: feature,
              resultFile: firstResult,
              testName: 'checkout.feature > Checkout > Add item',
            },
            {
              yamlFile: feature,
              testModule: feature,
              resultFile: secondResult,
              testName: 'checkout.feature > Checkout > Remove item',
            },
          ],
          maxConcurrency: 1,
          testTimeout: 0,
        },
      });

      expect(exitCode).toBe(1);
      expect(JSON.parse(readFileSync(firstResult, 'utf8'))).toMatchObject({
        file: feature,
        testName: 'checkout.feature > Checkout > Add item',
        error: 'first scenario failed before result write',
      });
      expect(existsSync(secondResult)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
