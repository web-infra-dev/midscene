import { basename, join } from 'node:path';
import { createConfig } from '@/config-factory';
import { resolveWebTarget } from '@midscene/core/yaml';
import { describe, expect, test } from 'vitest';

describe('shareBrowserContext YAML configuration', () => {
  const parallelScriptDir = join(
    __dirname,
    '../share_context_parallel_test_scripts',
  );
  const expectedScripts = [
    '00-setup.yaml',
    '01-search.yaml',
    '02-report.yaml',
    '03-settings.yaml',
  ];

  const createFixtureConfig = async (scriptDir: string, indexFile: string) => {
    const previousCwd = process.cwd();
    const previousOrigin = process.env.SHARED_BROWSER_TEST_ORIGIN;
    process.chdir(scriptDir);
    process.env.SHARED_BROWSER_TEST_ORIGIN = 'http://127.0.0.1';
    try {
      return await createConfig(join(scriptDir, indexFile));
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
    'should resolve setup and parallel files from the $targetSource YAML target',
    async ({ targetSource, indexFile }) => {
      const config = await createFixtureConfig(parallelScriptDir, indexFile);

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

  test('should resolve a sequential shared-browser YAML batch without an index target', async () => {
    const config = await createFixtureConfig(
      join(__dirname, '../share_context_test_scripts'),
      'index.yaml',
    );

    expect(resolveWebTarget(config.globalConfig ?? {})).toBeUndefined();
    expect(config).toMatchObject({
      concurrent: 1,
      shareBrowserContext: true,
    });
    expect(basename(config.setup ?? '')).toBe('01-login.yaml');
    expect(config.files.map((file) => basename(file))).toEqual([
      '02-check-login.yaml',
    ]);
  });
});
