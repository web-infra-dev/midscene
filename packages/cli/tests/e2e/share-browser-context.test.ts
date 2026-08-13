import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { basename, join } from 'node:path';
import { createConfig } from '@/config-factory';
import { runFrameworkTestConfig } from '@/framework/command';
import { resolveWebTarget } from '@midscene/core/yaml';
import { createServer } from 'http-server';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

vi.setConfig({
  testTimeout: 60 * 1000,
});

describe('shareBrowserContext CLI YAML e2e', () => {
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
    indexFile,
    targetSource,
    targetDeclaredInIndex = true,
    expectedScripts,
  }: {
    scriptDir: string;
    indexFile: string;
    targetSource: 'page' | 'browser' | 'web';
    targetDeclaredInIndex?: boolean;
    expectedScripts: string[];
  }) => {
    const indexYamlPath = join(scriptDir, indexFile);
    const frameworkImport = join(
      __dirname,
      '../../src/framework/rstest-entry.ts',
    );
    const previousCwd = process.cwd();

    process.chdir(scriptDir);
    try {
      const config = await createConfig(indexYamlPath);
      const resolvedTarget = resolveWebTarget(config.globalConfig ?? {});
      if (targetDeclaredInIndex) {
        expect(resolvedTarget?.source).toBe(targetSource);
      } else {
        expect(resolvedTarget).toBeUndefined();
      }
      config.globalConfig = {
        ...config.globalConfig,
        [targetSource]: {
          ...config.globalConfig?.[targetSource],
          url: `${testOrigin}/share-context-test.html`,
        },
      };
      const exitCode = await runFrameworkTestConfig(config, {
        projectDir: scriptDir,
        frameworkImport,
        stdio: 'pipe',
      });

      expect(exitCode).toBe(0);
      const summary = JSON.parse(
        readFileSync(
          join(scriptDir, 'midscene_run', 'output', config.summary),
          'utf8',
        ),
      );
      expect(summary.summary).toMatchObject({
        total: expectedScripts.length,
        successful: expectedScripts.length,
      });
      expect(
        summary.results
          .map((result: { script: string }) => basename(result.script))
          .sort(),
      ).toEqual([...expectedScripts].sort());
    } finally {
      process.chdir(previousCwd);
    }
  };

  test.each([
    { targetSource: 'page' as const, indexFile: 'index.yaml' },
    { targetSource: 'browser' as const, indexFile: 'index-browser.yaml' },
    { targetSource: 'web' as const, indexFile: 'index-web.yaml' },
  ])(
    'should run setup first and copy its state into isolated parallel pages using $targetSource',
    async ({ targetSource, indexFile }) => {
      await runFixture({
        scriptDir: join(__dirname, '../share_context_parallel_test_scripts'),
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

  test('should preserve setup state for a sequential shared-browser batch', async () => {
    await runFixture({
      scriptDir: join(__dirname, '../share_context_test_scripts'),
      indexFile: 'index.yaml',
      targetSource: 'web',
      targetDeclaredInIndex: false,
      expectedScripts: ['01-login.yaml', '02-check-login.yaml'],
    });
  });
});
