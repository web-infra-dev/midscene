import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runRstestYamlProject } from '@/framework/rstest-runner';
import { describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runRstest: vi.fn(),
}));

vi.mock('@rstest/core/api', () => ({
  runRstest: mocks.runRstest,
}));

describe('rstest runner config', () => {
  test('suppresses Rstest reporter output by default', async () => {
    const root = mkdtempSync(join(tmpdir(), 'midscene-rstest-config-'));
    mocks.runRstest.mockResolvedValue({ ok: true, unhandledErrors: [] });

    try {
      const exitCode = await runRstestYamlProject({
        cwd: root,
        project: {
          projectDir: root,
          outputDir: join(root, 'output'),
          resultDir: join(root, 'results'),
          include: ['virtual/a.test.ts'],
          virtualModules: {
            'virtual/a.test.ts': 'export {};',
          },
          cases: [],
          maxConcurrency: 1,
          testTimeout: 0,
        },
      });

      expect(exitCode).toBe(0);
      expect(mocks.runRstest).toHaveBeenCalledWith(
        expect.objectContaining({
          inlineConfig: expect.objectContaining({
            reporters: [],
          }),
        }),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
