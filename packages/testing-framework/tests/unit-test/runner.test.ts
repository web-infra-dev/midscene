import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type FrameworkBootstrapProject,
  runMidsceneTest,
} from '../../src/runner';
import type { FrameworkCaseResult } from '../../src/types';

const createProject = (configBody: string): string => {
  const root = mkdtempSync(join(tmpdir(), 'midscene-framework-runner-'));
  writeFileSync(join(root, 'midscene.config.ts'), configBody);
  const e2e = join(root, 'e2e');
  mkdirSync(e2e, { recursive: true });
  writeFileSync(join(e2e, 'a.yaml'), 'flow:\n  - aiAct: do a\n');
  writeFileSync(join(e2e, 'b.yaml'), 'flow:\n  - aiAct: do b\n');
  return root;
};

const writeResult = (
  resultDir: string,
  name: string,
  result: FrameworkCaseResult,
) => {
  mkdirSync(resultDir, { recursive: true });
  writeFileSync(join(resultDir, name), JSON.stringify(result));
};

afterEach(() => {
  process.exitCode = 0;
});

describe('runMidsceneTest', () => {
  it('drives a bootstrap project and aggregates the worker result files', async () => {
    const root = createProject(
      "export default { testDir: './e2e', include: ['**/*.yaml'] };\n",
    );

    const rstestRunner = vi.fn(async (project: FrameworkBootstrapProject) => {
      // The result dir is embedded in the bootstrap source for the worker.
      expect(
        project.virtualModules['virtual:midscene-framework/suite.test.ts'],
      ).toContain(`resultDir: ${JSON.stringify(project.resultDir)}`);
      writeResult(project.resultDir, '001-a.json', {
        file: join(root, 'e2e/a.yaml'),
        testName: 'e2e/a.yaml',
        success: true,
        duration: 10,
      });
      writeResult(project.resultDir, '002-b.json', {
        file: join(root, 'e2e/b.yaml'),
        testName: 'e2e/b.yaml',
        success: true,
        duration: 20,
      });
      return { ok: true };
    });

    const summary = await runMidsceneTest({
      configPath: join(root, 'midscene.config.ts'),
      outputDir: join(root, '.out'),
      rstestRunner,
    });

    expect(rstestRunner).toHaveBeenCalledTimes(1);
    const project = rstestRunner.mock.calls[0][0];
    expect(project.root).toBe(root);
    expect(project.include).toEqual([
      'virtual:midscene-framework/suite.test.ts',
    ]);

    const bootstrap =
      project.virtualModules['virtual:midscene-framework/suite.test.ts'];
    expect(bootstrap).toContain('registerMidsceneSuite');
    expect(bootstrap).toContain('midscene.config.ts');
    // The runner must not embed case discovery itself.
    expect(bootstrap).not.toContain('e2e/a.yaml');

    expect(summary).toMatchObject({ total: 2, passed: 2, failed: 0 });
    expect(summary.durationMs).toBe(30);
    expect(process.exitCode).not.toBe(1);
  });

  it('marks the run failed when a case result is a failure', async () => {
    const root = createProject(
      "export default { testDir: './e2e', include: ['**/*.yaml'] };\n",
    );

    const summary = await runMidsceneTest({
      configPath: join(root, 'midscene.config.ts'),
      outputDir: join(root, '.out'),
      rstestRunner: async (project) => {
        writeResult(project.resultDir, '001-a.json', {
          file: 'a',
          testName: 'e2e/a.yaml',
          success: false,
          duration: 1,
          error: 'boom',
        });
        return { ok: false };
      },
    });

    expect(summary.failed).toBe(1);
    expect(summary.passed).toBe(0);
    expect(process.exitCode).toBe(1);
  });

  it('throws when the config path does not exist', async () => {
    await expect(
      runMidsceneTest({
        configPath: join(tmpdir(), 'does-not-exist.config.ts'),
      }),
    ).rejects.toThrow(/midscene config not found/);
  });
});
