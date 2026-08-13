import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { createConfig } from '@/config-factory';
import { runFrameworkTestConfig } from '@/framework/command';
import { createServer } from 'http-server';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

vi.setConfig({
  testTimeout: 60 * 1000,
});

// Fixed port for testing - YAML files will use this URL
const TEST_PORT = 18527;

describe('shareBrowserContext - Storage Sharing', () => {
  let server: ReturnType<typeof createServer>;

  beforeAll(async () => {
    // Start a shared server for all tests
    server = createServer({
      root: join(__dirname, '../server_root'),
    });
    await new Promise<void>((resolve) => {
      server.listen(TEST_PORT, '127.0.0.1', () => {
        resolve();
      });
    });
  });

  afterAll(() => {
    server?.server.close();
  });

  test('should run setup before the main file and report both results', async () => {
    const scriptDir = join(__dirname, '../share_context_test_scripts');
    const indexYamlPath = join(scriptDir, 'index.yaml');
    const frameworkImport = join(
      __dirname,
      '../../src/framework/rstest-entry.ts',
    );
    const previousCwd = process.cwd();

    process.chdir(scriptDir);
    try {
      const config = await createConfig(indexYamlPath);
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
      expect(summary.summary).toMatchObject({ total: 2, successful: 2 });
      expect(
        summary.results.map((result: { script: string }) =>
          basename(result.script),
        ),
      ).toEqual(['01-login.yaml', '02-check-login.yaml']);
    } finally {
      process.chdir(previousCwd);
    }
  });

  test('should copy setup state into isolated pages for parallel YAML files', async () => {
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
