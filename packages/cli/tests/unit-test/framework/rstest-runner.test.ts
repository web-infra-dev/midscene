import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveRstestCoreImportPath,
  runRstestYamlProject,
} from '@/framework/rstest-runner';
import { afterEach, describe, expect, test } from 'vitest';

describe('rstest runner', () => {
  test('resolves the bundled Rstest core import path', () => {
    expect(resolveRstestCoreImportPath()).toMatch(
      /@rstest[/\\]core[/\\]dist[/\\]index\.js$/,
    );
  });

  describe('dependency resolution anchor', () => {
    const originalEntry = process.argv[1];
    let isolatedRoot: string | undefined;

    afterEach(() => {
      process.argv[1] = originalEntry;
      if (isolatedRoot) {
        rmSync(isolatedRoot, { recursive: true, force: true });
        isolatedRoot = undefined;
      }
    });

    test('resolves @rstest/core independently of process.argv[1]', () => {
      // Simulate a launcher (wrapper script, symlinked bin, npx cache, Docker
      // entrypoint) whose node_modules chain does NOT contain @rstest/core.
      // Resolution must still succeed because it is anchored on the CLI module
      // location, not on the command-line entry. This is the regression that
      // caused "Cannot find module '@rstest/core/package.json'".
      isolatedRoot = mkdtempSync(join(tmpdir(), 'midscene-bogus-entry-'));
      const fakeEntry = join(isolatedRoot, 'midscene-cli.js');
      writeFileSync(fakeEntry, '');
      process.argv[1] = fakeEntry;

      expect(resolveRstestCoreImportPath()).toMatch(
        /@rstest[/\\]core[/\\]dist[/\\]index\.js$/,
      );
    });
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
          include: ['virtual:a.test.ts', 'virtual:b.test.ts'],
          virtualModules: {
            'virtual:a.test.ts': createModule('a'),
            'virtual:b.test.ts': createModule('b'),
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

  test('runs multiple virtual files concurrently when maxConcurrency allows it', async () => {
    const root = mkdtempSync(join(tmpdir(), 'midscene-rstest-parallel-'));
    const marker = join(root, 'parallel-events.jsonl');
    const rstestImport = resolveRstestCoreImportPath();

    const createModule = (
      name: string,
    ) => `import { appendFileSync } from 'node:fs';
import { test } from ${JSON.stringify(rstestImport)};

test(${JSON.stringify(name)}, async () => {
  appendFileSync(${JSON.stringify(marker)}, JSON.stringify({ name: ${JSON.stringify(
    name,
  )}, event: 'start', time: Date.now() }) + '\\n');
  await new Promise((resolve) => setTimeout(resolve, 300));
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
          include: ['virtual:a.test.ts', 'virtual:b.test.ts'],
          virtualModules: {
            'virtual:a.test.ts': createModule('a'),
            'virtual:b.test.ts': createModule('b'),
          },
          cases: [],
          maxConcurrency: 2,
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
      const aStart = events.find(
        (event) => event.name === 'a' && event.event === 'start',
      )?.time;
      const aEnd = events.find(
        (event) => event.name === 'a' && event.event === 'end',
      )?.time;
      const bStart = events.find(
        (event) => event.name === 'b' && event.event === 'start',
      )?.time;
      const bEnd = events.find(
        (event) => event.name === 'b' && event.event === 'end',
      )?.time;

      expect([aStart, aEnd, bStart, bEnd].every(Boolean)).toBe(true);
      expect(Math.max(aStart || 0, bStart || 0)).toBeLessThanOrEqual(
        Math.min(aEnd || 0, bEnd || 0),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('lets Rstest bail before scheduling later virtual files when concurrency is one', async () => {
    const root = mkdtempSync(join(tmpdir(), 'midscene-rstest-serial-bail-'));
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
          include: [
            'virtual:a.test.ts',
            'virtual:b.test.ts',
            'virtual:c.test.ts',
          ],
          virtualModules: {
            'virtual:a.test.ts': `import { appendFileSync } from 'node:fs';
import { test } from ${JSON.stringify(rstestImport)};

test('a', async () => {
  appendFileSync(${JSON.stringify(marker)}, 'a\\n');
});
`,
            'virtual:b.test.ts': `import { appendFileSync } from 'node:fs';
import { test } from ${JSON.stringify(rstestImport)};

test('b', async () => {
  appendFileSync(${JSON.stringify(marker)}, 'b\\n');
  throw new Error('b failed');
});
`,
            'virtual:c.test.ts': `import { appendFileSync } from 'node:fs';
import { test } from ${JSON.stringify(rstestImport)};

test('c', async () => {
  appendFileSync(${JSON.stringify(marker)}, 'c\\n');
});
`,
          },
          cases: [],
          maxConcurrency: 1,
          testTimeout: 0,
          bail: 1,
        },
      });

      expect(exitCode).toBe(1);
      expect(readFileSync(marker, 'utf8')).toBe('a\nb\n');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
