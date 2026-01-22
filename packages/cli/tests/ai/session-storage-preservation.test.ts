import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BatchRunner } from '@/batch-runner';
import { createConfig } from '@/config-factory';
import { startStaticServer } from '../start-server';

describe('SessionStorage preservation with shareBrowserContext', () => {
  let serverUrl: string;
  let stopServer: () => Promise<void>;

  beforeAll(async () => {
    const serverInfo = await startStaticServer(
      join(__dirname, '../server_root'),
    );
    serverUrl = serverInfo.url;
    stopServer = serverInfo.stop;
  });

  afterAll(async () => {
    await stopServer();
  });

  it('should preserve sessionStorage when shareBrowserContext=true', async () => {
    const indexFile = join(
      __dirname,
      '../share_context_test_scripts/index-session.yaml',
    );
    expect(existsSync(indexFile)).toBe(true);

    const config = await createConfig(indexFile, {
      web: { url: serverUrl },
      headed: false,
      keepWindow: false,
    });

    const runner = new BatchRunner(config);
    await runner.run();

    const results = runner.getResults();

    // Both files should succeed
    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);

    // Second file should have successfully verified sessionStorage
    expect(results[1].file).toContain('02-check-session.yaml');
    expect(results[1].error).toBeUndefined();
  }, 120000);

  it('should lose sessionStorage when shareBrowserContext=false', async () => {
    const indexFile = join(
      __dirname,
      '../share_context_test_scripts/index-session-no-share.yaml',
    );
    expect(existsSync(indexFile)).toBe(true);

    const config = await createConfig(indexFile, {
      web: { url: serverUrl },
      headed: false,
      keepWindow: false,
    });

    const runner = new BatchRunner(config);
    await runner.run();

    const results = runner.getResults();

    // First file should succeed
    expect(results[0].success).toBe(true);
    expect(results[0].file).toContain('01-set-session.yaml');

    // Second file should FAIL because sessionStorage is lost
    expect(results[1].success).toBe(false);
    expect(results[1].file).toContain('02-check-session.yaml');
    expect(results[1].error).toBeDefined();
    expect(results[1].error).toContain('sessionStorage.authToken was lost');
  }, 120000);

  it('should preserve both localStorage and sessionStorage', async () => {
    const indexFile = join(
      __dirname,
      '../share_context_test_scripts/index-session.yaml',
    );

    const config = await createConfig(indexFile, {
      web: { url: serverUrl },
      headed: false,
      keepWindow: false,
    });

    const runner = new BatchRunner(config);
    await runner.run();

    const results = runner.getResults();

    // Verify the output contains the expected values
    expect(results[1].success).toBe(true);

    // Check if the output file exists and contains the verification results
    if (results[1].output && existsSync(results[1].output)) {
      const { readFileSync } = await import('node:fs');
      const output = readFileSync(results[1].output, 'utf-8');

      // Verify sessionStorage values are preserved
      expect(output).toContain('test-token-12345');
      expect(output).toContain('user-999');
      expect(output).toContain('dark-mode');
    }
  }, 120000);
});
