import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { basename, join } from 'node:path';
import { execa } from 'execa';
import { createServer } from 'http-server';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

vi.setConfig({
  testTimeout: 90 * 1000,
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
    summaryName,
    expectedScripts,
  }: {
    scriptDir: string;
    indexFile: string;
    summaryName: string;
    expectedScripts: string[];
  }) => {
    const indexYamlPath = join(scriptDir, indexFile);
    const summaryPath = join(
      scriptDir,
      'midscene_run',
      'output',
      `${summaryName}-${Date.now()}.json`,
    );
    const cliBin = join(__dirname, '../../bin/midscene');

    await execa(cliBin, ['--config', indexYamlPath, '--summary', summaryPath], {
      cwd: scriptDir,
      env: {
        ...process.env,
        SHARED_BROWSER_TEST_ORIGIN: testOrigin,
      },
      timeout: 60 * 1000,
    });

    const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
    expect(summary.summary).toMatchObject({
      total: expectedScripts.length,
      successful: expectedScripts.length,
    });
    expect(
      summary.results
        .map((result: { script: string }) => basename(result.script))
        .sort(),
    ).toEqual([...expectedScripts].sort());
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
        summaryName: `e2e-${targetSource}`,
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
      summaryName: 'e2e-sequential',
      expectedScripts: ['01-login.yaml', '02-check-login.yaml'],
    });
  });
});
