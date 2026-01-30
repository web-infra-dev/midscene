import { join } from 'node:path';
import { execa } from 'execa';
import { describe, expect, it, vi } from 'vitest';

const cliBin = require.resolve('../../bin/midscene');
vi.setConfig({
  testTimeout: 120 * 1000,
});

const shouldRunAITest =
  process.platform !== 'linux' || process.env.AITEST === 'true';

describe.skipIf(!shouldRunAITest)(
  'SessionStorage preservation with shareBrowserContext',
  () => {
    it('should preserve sessionStorage when shareBrowserContext=true', async () => {
      const indexYamlPath = join(
        __dirname,
        '../share_context_test_scripts/index-session.yaml',
      );

      const result = await execa(cliBin, ['--config', indexYamlPath], {
        cwd: join(__dirname, '../share_context_test_scripts'),
        reject: false,
      });

      console.log('=== Test Output (shareBrowserContext=true) ===');
      console.log(result.stdout);
      if (result.stderr) {
        console.log('STDERR:', result.stderr);
      }
      console.log('Exit code:', result.exitCode);

      // Both files should succeed when shareBrowserContext is true
      expect(result.exitCode).toBe(0);
    });

    it('should lose sessionStorage when shareBrowserContext=false', async () => {
      const indexYamlPath = join(
        __dirname,
        '../share_context_test_scripts/index-session-no-share.yaml',
      );

      const result = await execa(cliBin, ['--config', indexYamlPath], {
        cwd: join(__dirname, '../share_context_test_scripts'),
        reject: false,
        all: true,
      });

      const output = result.all || result.stdout;
      console.log('=== Test Output (shareBrowserContext=false) ===');
      console.log(output);
      console.log('Exit code:', result.exitCode);

      // First file should succeed, second should fail because sessionStorage is lost
      // Since continueOnError is true, the process may exit with 0 or 1
      // The important check is that the error message about lost sessionStorage appears
      expect(output).toContain('sessionStorage.authToken was lost');
    });

    it('should preserve both localStorage and sessionStorage', async () => {
      const indexYamlPath = join(
        __dirname,
        '../share_context_test_scripts/index-session.yaml',
      );

      const result = await execa(cliBin, ['--config', indexYamlPath], {
        cwd: join(__dirname, '../share_context_test_scripts'),
        reject: false,
        all: true,
      });

      const output = result.all || result.stdout;
      console.log('=== Test Output (storage preservation) ===');
      console.log(output);
      console.log('Exit code:', result.exitCode);

      // Verify the test completed successfully
      // The YAML scripts check for sessionStorage and localStorage values internally
      // and throw errors if they are not preserved, so exitCode=0 means all storage was preserved
      expect(result.exitCode).toBe(0);
    });
  },
);
