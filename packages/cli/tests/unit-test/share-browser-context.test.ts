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

describe('shareBrowserContext - Storage Sharing', () => {
  const scriptDir = join(__dirname, '../share_context_parallel_test_scripts');
  const expectedScripts = [
    '00-setup.yaml',
    '01-search.yaml',
    '02-report.yaml',
    '03-settings.yaml',
  ];
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

  const createFixtureConfig = async (indexFile: string) => {
    const previousCwd = process.cwd();
    process.chdir(scriptDir);
    try {
      return await createConfig(join(scriptDir, indexFile));
    } finally {
      process.chdir(previousCwd);
    }
  };

  test.each([
    { targetSource: 'page' as const, indexFile: 'index.yaml' },
    { targetSource: 'browser' as const, indexFile: 'index-browser.yaml' },
    { targetSource: 'web' as const, indexFile: 'index-web.yaml' },
  ])(
    'should resolve setup and parallel files from the $targetSource YAML target',
    async ({ targetSource, indexFile }) => {
      const config = await createFixtureConfig(indexFile);

      expect(resolveWebTarget(config.globalConfig ?? {})?.source).toBe(
        targetSource,
      );
      expect(config).toMatchObject({
        concurrent: 3,
        shareBrowserContext: true,
      });
      expect(basename(config.setup ?? '')).toBe(expectedScripts[0]);
      expect(config.files.map((file) => basename(file))).toEqual(
        expectedScripts.slice(1),
      );
    },
  );

  test('should run setup first and copy its state into isolated parallel pages', async () => {
    const frameworkImport = join(
      __dirname,
      '../../src/framework/rstest-entry.ts',
    );
    const previousCwd = process.cwd();

    process.chdir(scriptDir);
    try {
      const config = await createConfig(join(scriptDir, 'index.yaml'));
      config.globalConfig = {
        ...config.globalConfig,
        page: {
          ...config.globalConfig?.page,
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
  });
});
