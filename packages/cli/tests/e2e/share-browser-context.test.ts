import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { createConfig } from '@/config-factory';
import { runYamlBatch } from '@/yaml-batch-executor';
import { resolveWebTarget } from '@midscene/core/yaml';
import { afterAll, beforeAll, describe, expect, rs, test } from '@rstest/core';
import { execa } from 'execa';
import { createServer } from 'http-server';

rs.setConfig({
  testTimeout: 120 * 1000,
});

describe('shareBrowserContext CLI YAML e2e', () => {
  const generateReportEvidence =
    process.env.SHARED_BROWSER_REPORT_EVIDENCE === 'true';
  let server: ReturnType<typeof createServer>;
  let testOrigin: string;

  beforeAll(async () => {
    server = createServer({
      root: join(__dirname, '../server_root'),
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.server.address() as AddressInfo;
        testOrigin = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    server.server.closeAllConnections?.();
    await new Promise<void>((resolve, reject) => {
      server.server.close((error: Error | undefined) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });

  const runFixture = async ({
    scriptDir,
    executionScriptDir,
    indexFile,
    targetSource,
    targetDeclaredInIndex = true,
    expectedScripts,
  }: {
    scriptDir: string;
    executionScriptDir?: string;
    indexFile: string;
    targetSource: 'page' | 'browser' | 'web';
    targetDeclaredInIndex?: boolean;
    expectedScripts: string[];
  }) => {
    const indexYamlPath = join(scriptDir, indexFile);
    const previousCwd = process.cwd();
    const previousOrigin = process.env.SHARED_BROWSER_TEST_ORIGIN;

    process.chdir(scriptDir);
    process.env.SHARED_BROWSER_TEST_ORIGIN = testOrigin;
    try {
      const config = await createConfig(indexYamlPath);
      const resolvedTarget = resolveWebTarget(config.globalConfig ?? {});
      if (targetDeclaredInIndex) {
        expect(resolvedTarget?.source).toBe(targetSource);
      } else {
        expect(resolvedTarget).toBeUndefined();
      }
      const executionConfig = executionScriptDir
        ? {
            ...config,
            setup: config.setup
              ? join(executionScriptDir, basename(config.setup))
              : undefined,
            files: config.files.map((file) =>
              join(executionScriptDir, basename(file)),
            ),
          }
        : config;
      const results = await runYamlBatch(executionConfig, {
        generateSummary: false,
        printExecutionPlan: false,
      });

      expect(results).toHaveLength(expectedScripts.length);
      expect(results.every((result) => result.success)).toBe(true);
      expect(results.map((result) => basename(result.file)).sort()).toEqual(
        [...expectedScripts].sort(),
      );
    } finally {
      process.chdir(previousCwd);
      if (previousOrigin === undefined) {
        Reflect.deleteProperty(process.env, 'SHARED_BROWSER_TEST_ORIGIN');
      } else {
        process.env.SHARED_BROWSER_TEST_ORIGIN = previousOrigin;
      }
    }
  };

  test.each([
    { targetSource: 'page' as const, indexFile: 'index.yaml' },
    { targetSource: 'browser' as const, indexFile: 'index-browser.yaml' },
    { targetSource: 'web' as const, indexFile: 'index-web.yaml' },
  ])(
    'should share browser-context state without copying page state using $targetSource',
    async ({ targetSource, indexFile }) => {
      await runFixture({
        scriptDir: join(__dirname, '../share_context_parallel_test_scripts'),
        // The report fixtures exercise the same assertions and can generate
        // human-readable local reports. CI omits explicit report screenshots
        // so this regression only fails on browser-state or tab-isolation bugs.
        executionScriptDir: generateReportEvidence
          ? undefined
          : join(__dirname, '../share_context_parallel_e2e_scripts'),
        indexFile,
        targetSource,
        expectedScripts: [
          '00-setup.yaml',
          '01-search.yaml',
          '02-report.yaml',
          '03-settings.yaml',
        ],
      });
    },
  );

  test('should isolate page-scoped state throughout a sequential shared-browser batch', async () => {
    await runFixture({
      scriptDir: join(__dirname, '../share_context_test_scripts'),
      indexFile: 'index.yaml',
      targetSource: 'web',
      targetDeclaredInIndex: false,
      expectedScripts: [
        '01-login.yaml',
        '02-check-login.yaml',
        '03-check-session-continuity.yaml',
      ],
    });
  });

  test('should execute a shared-browser batch through the built CLI entrypoint', async () => {
    const scriptDir = join(__dirname, '../share_context_parallel_e2e_scripts');
    const runDir = mkdtempSync(join(tmpdir(), 'midscene-cli-e2e-'));
    const summaryFile = 'cli-shared-browser-summary.json';
    const cliEntry = join(__dirname, '../../dist/lib/index.js');

    try {
      const result = await execa(
        process.execPath,
        [
          cliEntry,
          '--config',
          join(scriptDir, 'index.yaml'),
          '--summary',
          summaryFile,
        ],
        {
          cwd: scriptDir,
          env: {
            ...process.env,
            CI: '1',
            MIDSCENE_RUN_DIR: runDir,
            SHARED_BROWSER_TEST_ORIGIN: testOrigin,
          },
          reject: false,
        },
      );

      if (result.exitCode !== 0) {
        throw new Error(
          `CLI shared-browser smoke failed with exit code ${result.exitCode}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
        );
      }

      const summary = JSON.parse(
        readFileSync(join(runDir, 'output', summaryFile), 'utf8'),
      );
      expect(summary.summary).toMatchObject({
        total: 4,
        successful: 4,
        failed: 0,
        partialFailed: 0,
        notExecuted: 0,
      });
      expect(
        summary.results
          .map((item: { script: string }) => basename(item.script))
          .sort(),
      ).toEqual(
        [
          '00-setup.yaml',
          '01-search.yaml',
          '02-report.yaml',
          '03-settings.yaml',
        ].sort(),
      );
    } finally {
      rmSync(runDir, { recursive: true, force: true });
    }
  });
});
