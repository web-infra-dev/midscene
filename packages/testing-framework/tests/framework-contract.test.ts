import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  collectFrameworkTestFiles,
  defineMidsceneConfig,
  loadMidsceneConfig,
} from '../src';
import {
  createYamlFrameworkTestSource,
  normalizeYamlCase,
  runYamlFlowWithCustomSteps,
} from '../src/runtime';

const createTempDir = () => mkdtempSync(join(tmpdir(), 'midscene-framework-'));

describe('testing framework contract', () => {
  it('loads midscene.config.ts as the typed source of truth', async () => {
    const root = createTempDir();
    const configFile = join(root, 'midscene.config.ts');
    writeFileSync(
      configFile,
      `
        import { defineMidsceneConfig } from ${JSON.stringify(resolve(__dirname, '../src'))};

        export default defineMidsceneConfig({
          target: {
            type: 'android',
            options: {
              deviceId: 'emulator-5554',
              launch: 'https://www.ebay.com',
              autoDismissKeyboard: false,
            },
          },
          testDir: './e2e',
          include: ['**/*.yaml'],
          testRunner: {
            maxConcurrency: 1,
            bail: 0,
            testTimeout: 120_000,
          },
          output: {
            summary: './midscene_run/output/summary.json',
          },
          agentOptions: {
            reportFileName: 'android-config-demo',
            cache: true,
          },
        });
      `,
    );

    const loaded = await loadMidsceneConfig(configFile);

    expect(loaded.path).toBe(configFile);
    expect(loaded.root).toBe(root);
    expect(loaded.config.target?.type).toBe('android');
    expect(loaded.config.testRunner?.testTimeout).toBe(120_000);
    expect(loaded.config.output?.summary).toBe(
      './midscene_run/output/summary.json',
    );
  });

  it('loads TypeScript config files in a plain Node process', () => {
    const root = createTempDir();
    const configFile = join(root, 'midscene.config.ts');
    writeFileSync(
      configFile,
      `
        type LocalConfig = { testDir: string };
        const config: LocalConfig = {
          testDir: './e2e',
        };
        export default config;
      `,
    );

    const packageRoot = resolve(__dirname, '..');
    const sourceEntry = resolve(packageRoot, 'src/index.ts');
    const script = `
      const { createJiti } = require('jiti');
      const jiti = createJiti(${JSON.stringify(sourceEntry)}, { moduleCache: false });
      const { loadMidsceneConfig } = jiti(${JSON.stringify(sourceEntry)});
      loadMidsceneConfig(${JSON.stringify(configFile)})
        .then((loaded) => {
          if (loaded.config.testDir !== './e2e') {
            throw new Error('Unexpected testDir: ' + loaded.config.testDir);
          }
        })
        .catch((error) => {
          console.error(error);
          process.exit(1);
        });
    `;

    const result = spawnSync(process.execPath, ['-e', script], {
      cwd: packageRoot,
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
  });

  it('collects yaml and TypeScript cases from testDir/include/exclude', async () => {
    const root = createTempDir();
    writeFileSync(join(root, 'midscene.config.ts'), 'export default {};');
    const e2e = join(root, 'e2e');
    const nested = join(e2e, 'nested');
    await import('node:fs/promises').then(async ({ mkdir }) => {
      await mkdir(nested, { recursive: true });
    });
    writeFileSync(join(e2e, 'checkout.yaml'), 'flow: []');
    writeFileSync(join(e2e, 'checkout-risk.test.ts'), 'test("risk", () => {})');
    writeFileSync(join(e2e, 'draft.yaml'), 'flow: []');
    writeFileSync(join(nested, 'support.yml'), 'flow: []');

    const files = await collectFrameworkTestFiles({
      root,
      config: defineMidsceneConfig({
        testDir: './e2e',
        include: ['**/*.yaml', '**/*.yml', '**/*.test.ts'],
        exclude: ['**/*.draft.yaml', '**/draft.yaml'],
      }),
    });

    expect(files.map((file) => file.relativePath)).toEqual([
      'e2e/checkout-risk.test.ts',
      'e2e/checkout.yaml',
      'e2e/nested/support.yml',
    ]);
  });

  it('normalizes flow-only YAML into a single runnable task', () => {
    const result = normalizeYamlCase(
      `
        flow:
          - aiAct: Search for "hoodie"
          - aiAssert: The page shows search results.
      `,
      'e2e/search.yaml',
    );

    expect(result.tasks).toEqual([
      {
        name: 'search',
        flow: [
          { aiAct: 'Search for "hoodie"' },
          { aiAssert: 'The page shows search results.' },
        ],
      },
    ]);
  });

  it('dispatches custom YAML steps with agent, state and step metadata', async () => {
    const agent = {
      runYaml: vi.fn(async () => undefined),
    };
    const seedOrder = vi.fn(async (value, ctx) => {
      ctx.state.lastOrderId = value.orderId;
    });
    const assertOrderStatus = vi.fn();

    await runYamlFlowWithCustomSteps({
      agent,
      filePath: '/project/e2e/order-details.yaml',
      caseName: 'order-details',
      flow: [
        { seedOrder: { orderId: 'E2E-10001', status: 'paid' } },
        { aiAct: 'Open my orders' },
        { assertOrderStatus: { status: 'paid' } },
      ],
      yamlSteps: {
        seedOrder,
        assertOrderStatus,
      },
      state: {},
    });

    expect(seedOrder).toHaveBeenCalledWith(
      { orderId: 'E2E-10001', status: 'paid' },
      expect.objectContaining({
        agent,
        filePath: '/project/e2e/order-details.yaml',
        stepIndex: 0,
        stepName: 'seedOrder',
      }),
    );
    expect(agent.runYaml).toHaveBeenCalledWith(
      expect.stringContaining('aiAct: Open my orders'),
    );
    expect(assertOrderStatus).toHaveBeenCalledWith(
      { status: 'paid' },
      expect.objectContaining({
        state: { lastOrderId: 'E2E-10001' },
        stepIndex: 2,
        stepName: 'assertOrderStatus',
      }),
    );
  });

  it('generates yaml virtual test sources that import midscene.config.ts', () => {
    const source = createYamlFrameworkTestSource({
      configPath: '/project/midscene.config.ts',
      filePath: '/project/e2e/order-details.yaml',
      testName: 'e2e/order-details.yaml',
      runtimeImport: '@midscene/testing-framework/runtime',
      rstestImport: '@rstest/core',
    });

    expect(source).toContain('import { test } from "@rstest/core"');
    expect(source).toContain(
      'import config from "/project/midscene.config.ts"',
    );
    expect(source).toContain(
      'import { runYamlFrameworkCase } from "@midscene/testing-framework/runtime"',
    );
    expect(source).toContain('test("e2e/order-details.yaml"');
  });
});
