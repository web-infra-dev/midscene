import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { yamlProgressLogPrefix } from '@/framework/progress-reporter';
import { RSTEST_YAML_CASE_IDS_META_KEY } from '@/framework/rstest-contract';
import { createRstestYamlProject } from '@/framework/rstest-project';
import {
  resolveRstestCoreImportPath,
  runRstestYamlProject,
} from '@/framework/rstest-runner';
import { afterEach, describe, expect, rs, test } from '@rstest/core';

describe('rstest runner', () => {
  test('resolves the bundled Rstest core import path', () => {
    expect(resolveRstestCoreImportPath()).toMatch(
      /@rstest[/\\]core[/\\]dist[/\\]index\.js$/,
    );
  });

  test('forwards marked YAML progress from an Rstest worker', async () => {
    const root = mkdtempSync(join(tmpdir(), 'midscene-rstest-progress-'));
    const rstestImport = resolveRstestCoreImportPath();
    const consoleLog = rs.spyOn(console, 'log').mockImplementation(() => {});

    try {
      const exitCode = await runRstestYamlProject({
        cwd: root,
        project: {
          projectDir: root,
          outputDir: join(root, 'output'),
          resultDir: join(root, 'results'),
          include: ['virtual:progress.test.ts'],
          virtualModules: {
            'virtual:progress.test.ts': `import { test } from ${JSON.stringify(
              rstestImport,
            )};

test('progress', () => {
  console.log(${JSON.stringify(
    `${yamlProgressLogPrefix}◌ login.yaml\n  ◌ open login page`,
  )});
});
`,
          },
          cases: [],
          maxConcurrency: 1,
          testTimeout: 0,
        },
      });

      expect(exitCode).toBe(0);
      expect(consoleLog).toHaveBeenCalledWith(
        '◌ login.yaml\n  ◌ open login page',
      );
    } finally {
      consoleLog.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('does not leak worker console output when stdio is piped', async () => {
    const root = mkdtempSync(join(tmpdir(), 'midscene-rstest-pipe-'));
    const rstestImport = resolveRstestCoreImportPath();
    const consoleLog = rs.spyOn(console, 'log').mockImplementation(() => {});

    try {
      const exitCode = await runRstestYamlProject({
        cwd: root,
        stdio: 'pipe',
        project: {
          projectDir: root,
          outputDir: join(root, 'output'),
          resultDir: join(root, 'results'),
          include: ['virtual:pipe.test.ts'],
          virtualModules: {
            'virtual:pipe.test.ts': `import { test } from ${JSON.stringify(
              rstestImport,
            )};

test('pipe', () => {
  console.log(${JSON.stringify(`${yamlProgressLogPrefix}marked progress`)});
  console.log('plain worker output');
});
`,
          },
          cases: [],
          maxConcurrency: 1,
          testTimeout: 0,
        },
      });

      expect(exitCode).toBe(0);
      expect(consoleLog).not.toHaveBeenCalled();
    } finally {
      consoleLog.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
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
          modules: ['a', 'b'].map((name) => ({
            id: `virtual:${name}.test.ts`,
            source: createModule(name),
            caseIds: [],
          })),
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
          modules: ['a', 'b'].map((name) => ({
            id: `virtual:${name}.test.ts`,
            source: createModule(name),
            caseIds: [],
          })),
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

  test('runs serial YAML cases in config order', async () => {
    const root = mkdtempSync(join(tmpdir(), 'midscene-rstest-ordered-'));
    const marker = join(root, 'ordered-events.jsonl');
    const framework = join(root, 'framework.mjs');
    const yamlFiles = [
      join(root, 'third.yaml'),
      join(root, 'first.yaml'),
      join(root, 'third.yaml'),
      join(root, 'second.yaml'),
    ];

    for (const file of yamlFiles) {
      writeFileSync(file, 'web:\n  url: about:blank\ntasks: []\n');
    }
    writeFileSync(
      framework,
      `import { appendFileSync } from 'node:fs';

export function defineYamlCaseTest(test, options) {
  test(options.testName, async () => {
    appendFileSync(${JSON.stringify(marker)}, JSON.stringify(options.yamlFile) + '\\n');
  });
}
`,
    );

    try {
      const project = createRstestYamlProject({
        files: yamlFiles,
        projectDir: root,
        outputDir: join(root, 'output'),
        frameworkImport: framework,
        maxConcurrency: 1,
      });
      const exitCode = await runRstestYamlProject({
        cwd: root,
        stdio: 'pipe',
        project,
      });

      expect(exitCode).toBe(0);
      expect(
        readFileSync(marker, 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line)),
      ).toEqual(yamlFiles);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('attributes failures to duplicate YAML occurrences by case ID', async () => {
    const root = mkdtempSync(join(tmpdir(), 'midscene-rstest-duplicate-'));
    const framework = join(root, 'framework.mjs');
    const yaml = join(root, 'duplicate.yaml');
    writeFileSync(yaml, 'web:\n  url: about:blank\ntasks: []\n');
    writeFileSync(
      framework,
      `export function defineYamlCaseTest(test, options) {
  test(options.testName, {
    meta: {
      ${JSON.stringify(RSTEST_YAML_CASE_IDS_META_KEY)}: [options.caseId],
    },
  }, async () => {
    throw new Error('failed ' + options.caseId);
  });
}
`,
    );

    try {
      const project = createRstestYamlProject({
        files: [yaml, yaml],
        projectDir: root,
        outputDir: join(root, 'output'),
        frameworkImport: framework,
        maxConcurrency: 1,
        bail: 0,
      });
      const exitCode = await runRstestYamlProject({
        cwd: root,
        stdio: 'pipe',
        project,
      });

      expect(exitCode).toBe(1);
      expect(project.cases[0].caseId).not.toBe(project.cases[1].caseId);
      const results = project.cases.map((item) =>
        JSON.parse(readFileSync(item.resultFile, 'utf8')),
      );
      expect(results.map((item) => item.error)).toEqual(
        project.cases.map((item) => `failed ${item.caseId}`),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('retries a serial YAML case before bailing without starting the next case', async () => {
    const root = mkdtempSync(join(tmpdir(), 'midscene-rstest-ordered-bail-'));
    const marker = join(root, 'ordered-bail-events.jsonl');
    const framework = join(root, 'framework.mjs');
    const yamlFiles = [join(root, 'first.yaml'), join(root, 'second.yaml')];

    for (const file of yamlFiles) {
      writeFileSync(file, 'web:\n  url: about:blank\ntasks: []\n');
    }
    writeFileSync(
      framework,
      `import { appendFileSync } from 'node:fs';

export function defineYamlCaseTest(test, options) {
  test(options.testName, async () => {
    appendFileSync(${JSON.stringify(marker)}, JSON.stringify(options.yamlFile) + '\\n');
    if (options.yamlFile.endsWith('first.yaml')) {
      throw new Error('first failed');
    }
  });
}
`,
    );

    try {
      const project = createRstestYamlProject({
        files: yamlFiles,
        projectDir: root,
        outputDir: join(root, 'output'),
        frameworkImport: framework,
        maxConcurrency: 1,
        retry: 1,
        bail: 1,
      });
      const exitCode = await runRstestYamlProject({
        cwd: root,
        stdio: 'pipe',
        project,
      });

      expect(exitCode).toBe(1);
      expect(
        readFileSync(marker, 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line)),
      ).toEqual([yamlFiles[0], yamlFiles[0]]);
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
          // Every file fails, so the assertion below holds whatever order
          // Rstest schedules them in: at concurrency 1, the first file to run
          // trips `bail`, and the other two must never start. Rstest 0.11.2
          // does not promise to run `include` in array order (it reorders by
          // previous-run history and file size), so an order-sensitive
          // assertion would test the scheduler, not the bail.
          modules: [
            {
              id: 'virtual:a.test.ts',
              caseIds: [],
              source: `import { appendFileSync } from 'node:fs';
import { test } from ${JSON.stringify(rstestImport)};

test('a', async () => {
  appendFileSync(${JSON.stringify(marker)}, 'a\\n');
  throw new Error('a failed');
});
`,
            },
            {
              id: 'virtual:b.test.ts',
              caseIds: [],
              source: `import { appendFileSync } from 'node:fs';
import { test } from ${JSON.stringify(rstestImport)};

test('b', async () => {
  appendFileSync(${JSON.stringify(marker)}, 'b\\n');
  throw new Error('b failed');
});
`,
            },
            {
              id: 'virtual:c.test.ts',
              caseIds: [],
              source: `import { appendFileSync } from 'node:fs';
import { test } from ${JSON.stringify(rstestImport)};

test('c', async () => {
  appendFileSync(${JSON.stringify(marker)}, 'c\\n');
  throw new Error('c failed');
});
`,
            },
          ],
          cases: [],
          maxConcurrency: 1,
          testTimeout: 0,
          bail: 1,
        },
      });

      expect(exitCode).toBe(1);
      const ran = readFileSync(marker, 'utf8').split('\n').filter(Boolean);
      expect(ran).toHaveLength(1);
      expect(['a', 'b', 'c']).toContain(ran[0]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
