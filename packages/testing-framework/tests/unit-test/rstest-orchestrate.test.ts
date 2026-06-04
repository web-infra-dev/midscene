import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { runWithRstest } from '../../src/rstest/orchestrate';
import type { GeneratedCase } from '../../src/rstest/project';
import type { CaseResult, RunSummary } from '../../src/types';

const createTempDir = () => mkdtempSync(join(tmpdir(), 'mts-orch-'));

interface ProjectScenario {
  yamlFiles: string[];
  configBody?: string;
}

const writeProject = (root: string, scenario: ProjectScenario): string => {
  mkdirSync(join(root, 'e2e'), { recursive: true });
  const configPath = join(root, 'midscene.config.ts');
  writeFileSync(
    configPath,
    scenario.configBody ??
      `export default {
        uiAgent: { type: 'web', options: {} },
        testDir: './e2e',
        include: ['**/*.yaml'],
        output: { summary: './midscene_run/summary.json' },
      };`,
  );
  for (const file of scenario.yamlFiles) {
    writeFileSync(join(root, 'e2e', file), 'name: case\nflow: []\n');
  }
  return configPath;
};

const writeCaseResult = (
  item: GeneratedCase,
  status: CaseResult['status'],
): void => {
  mkdirSync(dirname(item.resultFile), { recursive: true });
  const result: CaseResult = {
    name: item.testName,
    file: item.yamlFile,
    status,
    steps: [],
    warnings: [],
    durationMs: 5,
  };
  writeFileSync(item.resultFile, JSON.stringify(result));
};

describe('runWithRstest orchestration', () => {
  test('discovers cases, aggregates per-case results, and writes the summary', async () => {
    const root = createTempDir();
    const configPath = writeProject(root, {
      yamlFiles: ['checkout.yaml', 'detail.yaml'],
    });
    let seenInclude: string[] = [];

    try {
      const { summary, exitCode } = await runWithRstest({
        configPath,
        rstestRunner: async ({ project, cwd }) => {
          seenInclude = project.include;
          expect(cwd).toBe(root);
          for (const item of project.cases) {
            writeCaseResult(item, 'passed');
          }
          return 0;
        },
      });

      expect(exitCode).toBe(0);
      expect(seenInclude).toEqual([
        'virtual:midscene-tf/001-checkout.test.ts',
        'virtual:midscene-tf/002-detail.test.ts',
      ]);
      expect(summary.total).toBe(2);
      expect(summary.passed).toBe(2);
      expect(summary.failed).toBe(0);

      const written = JSON.parse(
        readFileSync(join(root, 'midscene_run', 'summary.json'), 'utf-8'),
      ) as RunSummary;
      expect(written.total).toBe(2);
      expect(written.cases.map((c) => c.status)).toEqual(['passed', 'passed']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('reflects a failed case in the summary and propagates the exit code', async () => {
    const root = createTempDir();
    const configPath = writeProject(root, {
      yamlFiles: ['a.yaml', 'b.yaml'],
    });

    try {
      const { summary, exitCode } = await runWithRstest({
        configPath,
        rstestRunner: async ({ project }) => {
          writeCaseResult(project.cases[0], 'passed');
          writeCaseResult(project.cases[1], 'failed');
          return 1;
        },
      });

      expect(exitCode).toBe(1);
      expect(summary.total).toBe(2);
      expect(summary.passed).toBe(1);
      expect(summary.failed).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('omits cases with no result file (e.g. stopped by bail)', async () => {
    const root = createTempDir();
    const configPath = writeProject(root, {
      yamlFiles: ['a.yaml', 'b.yaml', 'c.yaml'],
    });

    try {
      const { summary } = await runWithRstest({
        configPath,
        rstestRunner: async ({ project }) => {
          // only the first two cases ran before bail stopped the suite
          writeCaseResult(project.cases[0], 'passed');
          writeCaseResult(project.cases[1], 'failed');
          return 1;
        },
      });

      expect(summary.total).toBe(2);
      expect(summary.cases.map((c) => c.name)).not.toContain('e2e/c.yaml');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('passes an explicit file list straight through to the project', async () => {
    const root = createTempDir();
    const configPath = writeProject(root, {
      yamlFiles: ['a.yaml', 'b.yaml'],
    });
    const only = join(root, 'e2e', 'b.yaml');

    try {
      const { summary } = await runWithRstest({
        configPath,
        files: [only],
        rstestRunner: async ({ project }) => {
          expect(project.cases).toHaveLength(1);
          expect(project.cases[0].yamlFile).toBe(only);
          writeCaseResult(project.cases[0], 'passed');
          return 0;
        },
      });
      expect(summary.total).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
