import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveRstestCoreImportPath,
  runRstestYamlProject,
} from '@/framework/rstest-runner';
import { afterEach, describe, expect, test } from '@rstest/core';

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

  test(
    'runs multiple virtual files concurrently when maxConcurrency allows it',
    { timeout: 30_000 },
    async () => {
      const root = mkdtempSync(join(tmpdir(), 'midscene-rstest-parallel-'));
      const marker = join(root, 'parallel-events.jsonl');
      const rstestImport = resolveRstestCoreImportPath();

      // Each virtual file records its own start, then blocks until it observes
      // the peer's start marker before finishing. If the runner schedules both
      // files concurrently, each sees the other alive and reports `sawPeer`.
      // A serial scheduler (peer cannot start until this file ends) makes the
      // first file exhaust the bounded wait and report `sawPeer: false`, so the
      // assertion fails deterministically instead of racing on wall-clock time.
      const createModule = (
        name: string,
        peer: string,
      ) => `import { appendFileSync, readFileSync } from 'node:fs';
import { test } from ${JSON.stringify(rstestImport)};

const marker = ${JSON.stringify(marker)};

const peerStarted = () => {
  try {
    return readFileSync(marker, 'utf8')
      .split('\\n')
      .filter(Boolean)
      .some((line) => {
        const entry = JSON.parse(line);
        return entry.name === ${JSON.stringify(peer)} && entry.event === 'start';
      });
  } catch {
    return false;
  }
};

test(${JSON.stringify(name)}, async () => {
  appendFileSync(marker, JSON.stringify({ name: ${JSON.stringify(
    name,
  )}, event: 'start' }) + '\\n');
  const deadline = Date.now() + 10_000;
  let sawPeer = false;
  while (Date.now() < deadline) {
    if (peerStarted()) {
      sawPeer = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  appendFileSync(marker, JSON.stringify({ name: ${JSON.stringify(
    name,
  )}, event: 'end', sawPeer }) + '\\n');
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
              'virtual:a.test.ts': createModule('a', 'b'),
              'virtual:b.test.ts': createModule('b', 'a'),
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
                sawPeer?: boolean;
              },
          );
        const aEnd = events.find(
          (event) => event.name === 'a' && event.event === 'end',
        );
        const bEnd = events.find(
          (event) => event.name === 'b' && event.event === 'end',
        );

        expect(aEnd?.sawPeer).toBe(true);
        expect(bEnd?.sawPeer).toBe(true);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );

  test('lets Rstest bail before scheduling later virtual files when concurrency is one', async () => {
    const root = mkdtempSync(join(tmpdir(), 'midscene-rstest-serial-bail-'));
    const marker = join(root, 'events.txt');
    const rstestImport = resolveRstestCoreImportPath();
    const names = ['a', 'b', 'c'];

    // Every file fails, so the assertion below holds whatever order Rstest
    // schedules them in: at concurrency 1, the first file to run trips `bail`,
    // and the other two must never start. Do not reintroduce a pass/fail mix
    // keyed to a specific file -- Rstest does not promise to run `include` in
    // array order (0.11.2 reorders by previous-run history and file size), so
    // an order-sensitive assertion tests the scheduler, not the bail.
    const virtualModules = Object.fromEntries(
      names.map((name) => [
        `virtual:${name}.test.ts`,
        `import { appendFileSync } from 'node:fs';
import { test } from ${JSON.stringify(rstestImport)};

test(${JSON.stringify(name)}, async () => {
  appendFileSync(${JSON.stringify(marker)}, ${JSON.stringify(`${name}\n`)});
  throw new Error(${JSON.stringify(`${name} failed`)});
});
`,
      ]),
    );

    try {
      const exitCode = await runRstestYamlProject({
        cwd: root,
        stdio: 'pipe',
        project: {
          projectDir: root,
          outputDir: join(root, 'output'),
          resultDir: join(root, 'results'),
          include: names.map((name) => `virtual:${name}.test.ts`),
          virtualModules,
          cases: [],
          maxConcurrency: 1,
          testTimeout: 0,
          bail: 1,
        },
      });

      expect(exitCode).toBe(1);
      const ran = readFileSync(marker, 'utf8').split('\n').filter(Boolean);
      expect(ran).toHaveLength(1);
      expect(names).toContain(ran[0]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
