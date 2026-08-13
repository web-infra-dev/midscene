import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { basename, join } from 'node:path';
import { createConfig } from '@/config-factory';
import { runFrameworkTestConfig } from '@/framework/command';
import { createServer } from 'http-server';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

vi.setConfig({
  testTimeout: 60 * 1000,
});

describe('shareBrowserContext - Storage Sharing', () => {
  let server: ReturnType<typeof createServer>;
  let testOrigin: string;

  beforeAll(async () => {
    // Start a shared server for all tests
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
    await new Promise<void>((resolve, reject) => {
      server.server.close((error: Error | undefined) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });

  test('should run setup first and copy its state into isolated parallel pages', async () => {
    const scriptDir = join(__dirname, '../share_context_parallel_test_scripts');
    const indexYamlPath = join(scriptDir, 'index.yaml');
    const frameworkImport = join(
      __dirname,
      '../../src/framework/rstest-entry.ts',
    );
    const previousCwd = process.cwd();

    process.chdir(scriptDir);
    try {
      const config = await createConfig(indexYamlPath);
      config.globalConfig = {
        ...config.globalConfig,
        web: {
          ...config.globalConfig?.web,
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
      expect(summary.summary).toMatchObject({ total: 4, successful: 4 });
      expect(
        summary.results
          .map((result: { script: string }) => basename(result.script))
          .sort(),
      ).toEqual([
        '00-setup.yaml',
        '01-search.yaml',
        '02-report.yaml',
        '03-settings.yaml',
      ]);
    } finally {
      process.chdir(previousCwd);
    }
  });
});
