import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  runFrameworkTestCommand,
  runFrameworkTestConfig,
} from '@/framework/command';
import { describe, expect, test } from 'vitest';

const createTempDir = () => mkdtempSync(join(tmpdir(), 'midscene-command-'));

describe('framework test command', () => {
  test('discovers YAML files, generates a Rstest project, and passes the config to the runner', async () => {
    const root = createTempDir();
    const outputDir = join(root, 'generated-runner');
    const yaml = join(root, 'cases', 'checkout.yaml');
    mkdirSync(join(root, 'cases'), { recursive: true });
    writeFileSync(yaml, 'web:\n  url: about:blank\ntasks: []\n');

    const calls: Array<{ configFile: string; cwd?: string }> = [];

    try {
      const exitCode = await runFrameworkTestCommand(
        [root, '--concurrent', '3'],
        {
          outputDir,
          frameworkImport: '@test/framework',
          rstestRunner: async (options) => {
            calls.push(options);
            return 7;
          },
        },
      );

      expect(exitCode).toBe(7);
      expect(calls).toHaveLength(1);
      expect(calls[0].cwd).toBe(root);
      expect(calls[0].configFile).toBe(join(outputDir, 'rstest.config.ts'));
      expect(readFileSync(calls[0].configFile, 'utf8')).toContain(
        '"maxConcurrency": 3',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('supports --files filtering without changing the project root', async () => {
    const root = createTempDir();
    const outputDir = join(root, 'generated-runner');
    const included = join(root, 'cases', 'included.yaml');
    const skipped = join(root, 'cases', 'skipped.yaml');
    mkdirSync(join(root, 'cases'), { recursive: true });
    writeFileSync(included, 'web:\n  url: about:blank\ntasks: []\n');
    writeFileSync(skipped, 'web:\n  url: about:blank\ntasks: []\n');

    try {
      await runFrameworkTestCommand([root, '--files', 'cases/included.yaml'], {
        outputDir,
        rstestRunner: async () => 0,
      });

      const config = readFileSync(join(outputDir, 'rstest.config.ts'), 'utf8');
      expect(config).toContain('included');
      expect(config).not.toContain('skipped');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('throws when no YAML files are found', async () => {
    const root = createTempDir();

    try {
      await expect(
        runFrameworkTestCommand([root], {
          rstestRunner: async () => 0,
        }),
      ).rejects.toThrow(/No yaml files found/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('can run a generated Rstest project end to end with a test framework import override', async () => {
    const root = createTempDir();
    const outputDir = join(root, 'generated-runner');
    const yaml = join(root, 'case.yaml');
    const framework = join(root, 'framework.ts');
    const marker = join(root, 'marker.txt');
    writeFileSync(yaml, 'web:\n  url: about:blank\ntasks: []\n');
    writeFileSync(
      framework,
      `import { writeFileSync } from 'node:fs';
export async function runYamlCaseInChildProcess(options: { file: string }) {
  writeFileSync(${JSON.stringify(marker)}, options.file);
}
`,
    );

    try {
      const exitCode = await runFrameworkTestCommand([root], {
        outputDir,
        frameworkImport: framework,
        stdio: 'pipe',
      });

      expect(exitCode).toBe(0);
      expect(readFileSync(marker, 'utf8')).toBe(yaml);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('runs an existing CLI config through Rstest and writes the summary file', async () => {
    const root = createTempDir();
    const runDir = join(root, 'midscene-run');
    const outputDir = join(root, 'generated-runner');
    const yaml = join(root, 'case.yaml');
    const framework = join(root, 'framework.ts');
    const marker = join(root, 'execution-config.json');
    const previousRunDir = process.env.MIDSCENE_RUN_DIR;

    process.env.MIDSCENE_RUN_DIR = runDir;
    writeFileSync(yaml, 'web:\n  url: https://file.example\ntasks: []\n');
    writeFileSync(
      framework,
      `import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
export async function runYamlCaseInChildProcess(options: any) {
  mkdirSync(dirname(options.resultFile), { recursive: true });
  writeFileSync(${JSON.stringify(marker)}, JSON.stringify(options.globalConfig));
  writeFileSync(options.resultFile, JSON.stringify({
    file: options.file,
    success: true,
    executed: true,
    output: null,
    report: null,
    duration: 12,
    resultType: 'success'
  }));
}
`,
    );

    try {
      const exitCode = await runFrameworkTestConfig(
        {
          files: [yaml],
          concurrent: 2,
          continueOnError: false,
          summary: 'summary.json',
          shareBrowserContext: false,
          globalConfig: {
            web: {
              viewportWidth: 1280,
            },
          },
          headed: true,
          keepWindow: false,
          dotenvOverride: false,
          dotenvDebug: false,
        },
        {
          outputDir,
          frameworkImport: framework,
          stdio: 'pipe',
        },
      );

      expect(exitCode).toBe(0);
      expect(
        readFileSync(join(outputDir, 'rstest.config.ts'), 'utf8'),
      ).toContain('"bail": 1');
      expect(JSON.parse(readFileSync(marker, 'utf8'))).toMatchObject({
        web: {
          viewportWidth: 1280,
        },
      });
      const summary = JSON.parse(
        readFileSync(join(runDir, 'output', 'summary.json'), 'utf8'),
      );
      expect(summary.summary.successful).toBe(1);
      expect(summary.results[0].success).toBe(true);
    } finally {
      if (previousRunDir === undefined) {
        Reflect.deleteProperty(process.env, 'MIDSCENE_RUN_DIR');
      } else {
        process.env.MIDSCENE_RUN_DIR = previousRunDir;
      }
      rmSync(root, { recursive: true, force: true });
    }
  });
});
