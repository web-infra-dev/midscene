import { join } from 'node:path';
import { execa } from 'execa';
import { createServer } from 'http-server';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

const cliBin = require.resolve('../../bin/midscene');
vi.setConfig({
  testTimeout: 60 * 1000,
});

const shouldRunAITest =
  process.platform !== 'linux' || process.env.AITEST === 'true';

// Fixed port for testing - YAML files will use this URL
const TEST_PORT = 18527;
const TEST_URL = `http://127.0.0.1:${TEST_PORT}`;

describe.skipIf(!shouldRunAITest)(
  'shareBrowserContext - Storage Sharing',
  () => {
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

    test('should preserve all storage types when shareBrowserContext is true', async () => {
      const indexYamlPath = join(
        __dirname,
        '../share_context_test_scripts/index.yaml',
      );

      const result = await execa(cliBin, ['--config', indexYamlPath], {
        cwd: join(__dirname, '../share_context_test_scripts'),
        reject: false,
        all: true,
      });

      const output = result.all || result.stdout;
      console.log('=== Test Output ===');
      console.log(output);
      console.log('Exit code:', result.exitCode);

      // Test should pass - all storage preserved
      expect(result.exitCode).toBe(0);
    });
  },
);
