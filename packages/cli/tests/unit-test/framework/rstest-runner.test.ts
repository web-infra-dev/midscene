import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveRstestCoreImportPath,
  runRstestYamlProject,
} from '@/framework/rstest-runner';
import { describe, expect, test } from 'vitest';

describe('rstest runner', () => {
  test('resolves the bundled Rstest core import path', () => {
    expect(resolveRstestCoreImportPath()).toMatch(
      /@rstest[/\\]core[/\\]dist[/\\]index\.js$/,
    );
  });

  test('limits virtual YAML files with the configured worker concurrency', async () => {
    const root = mkdtempSync(join(tmpdir(), 'midscene-rstest-runner-'));
    const marker = join(root, 'events.jsonl');
    const rstestImport = resolveRstestCoreImportPath();

    const createModule = (
      name: string,
    ) => `import { appendFileSync } from 'node:fs';
import { test } from ${JSON.stringify(rstestImport)};

test(${JSON.stringify(name)}, async () => {
  appendFileSync(${JSON.stringify(marker)}, JSON.stringify({ name: ${JSON.stringify(
    name,
  )}, event: 'start', time: Date.now() }) + '\\n');
  await new Promise((resolve) => setTimeout(resolve, 100));
  appendFileSync(${JSON.stringify(marker)}, JSON.stringify({ name: ${JSON.stringify(
    name,
  )}, event: 'end', time: Date.now() }) + '\\n');
});
`;

    try {
      const exitCode = await runRstestYamlProject({
        cwd: root,
        stdio: 'pipe',
        project: {
          projectDir: root,
          outputDir: join(root, 'output'),
          resultDir: join(root, 'results'),
          include: ['virtual/a.test.ts', 'virtual/b.test.ts'],
          virtualModules: {
            'virtual/a.test.ts': createModule('a'),
            'virtual/b.test.ts': createModule('b'),
          },
          cases: [],
          maxConcurrency: 1,
          testTimeout: 0,
        },
      });

      expect(exitCode).toBe(0);
      const events = readFileSync(marker, 'utf8')
        .trim()
        .split('\n')
        .map(
          (line) =>
            JSON.parse(line) as {
              name: string;
              event: 'start' | 'end';
              time: number;
            },
        );
      const ranges = ['a', 'b'].map((name) => ({
        name,
        start: events.find(
          (event) => event.name === name && event.event === 'start',
        )?.time,
        end: events.find(
          (event) => event.name === name && event.event === 'end',
        )?.time,
      }));

      expect(ranges.every((range) => range.start && range.end)).toBe(true);
      const sorted = ranges.sort((a, b) => (a.start || 0) - (b.start || 0));
      expect(sorted[1].start).toBeGreaterThanOrEqual(sorted[0].end || 0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('allows already running virtual files to finish when bail is reached', async () => {
    const root = mkdtempSync(join(tmpdir(), 'midscene-rstest-bail-'));
    const marker = join(root, 'events.txt');
    const rstestImport = resolveRstestCoreImportPath();

    try {
      const exitCode = await runRstestYamlProject({
        cwd: root,
        stdio: 'pipe',
        project: {
          projectDir: root,
          outputDir: join(root, 'output'),
          resultDir: join(root, 'results'),
          include: ['virtual/a.test.ts', 'virtual/b.test.ts'],
          virtualModules: {
            'virtual/a.test.ts': `import { appendFileSync } from 'node:fs';
import { test } from ${JSON.stringify(rstestImport)};

test('a', async () => {
  appendFileSync(${JSON.stringify(marker)}, 'a-start\\n');
  await new Promise((resolve) => setTimeout(resolve, 10));
  appendFileSync(${JSON.stringify(marker)}, 'a-end\\n');
  throw new Error('a failed');
});
`,
            'virtual/b.test.ts': `import { appendFileSync } from 'node:fs';
import { test } from ${JSON.stringify(rstestImport)};

test('b', async () => {
  appendFileSync(${JSON.stringify(marker)}, 'b-start\\n');
  await new Promise((resolve) => setTimeout(resolve, 100));
  appendFileSync(${JSON.stringify(marker)}, 'b-end\\n');
});
`,
          },
          cases: [],
          maxConcurrency: 2,
          testTimeout: 0,
          bail: 1,
        },
      });

      expect(exitCode).toBe(1);
      const events = readFileSync(marker, 'utf8');
      expect(events).toContain('a-start');
      expect(events).toContain('a-end');
      expect(events).toContain('b-start');
      expect(events).toContain('b-end');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
