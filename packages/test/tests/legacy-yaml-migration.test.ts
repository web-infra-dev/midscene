import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { load as loadYaml } from 'js-yaml';
import { afterEach, describe, expect, it } from 'vitest';
import { runTestCli } from '../src/cli/test-command';
import { loadTestProject } from '../src/cli/test-project';
import { migrateLegacyYamlProject } from '../src/migration/legacy-yaml';

const temporaryDirectories: string[] = [];

const createTemporaryDirectory = (): string => {
  const packageRoot = resolve(__dirname, '..');
  const directory = mkdtempSync(join(packageRoot, '.tmp-yaml-migration-'));
  temporaryDirectories.push(directory);
  return directory;
};

const write = (path: string, content: string): void => {
  writeFileSync(path, content);
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('legacy YAML migration', () => {
  it('converts supported Web tasks without modifying the source', async () => {
    const root = createTemporaryDirectory();
    const sourcePath = join(root, 'checkout.yaml');
    const outputDir = join(root, 'migrated');
    const source = [
      'web:',
      '  url: https://example.com/checkout',
      '  viewportWidth: 1280',
      '  viewportHeight: 720',
      '  extraHTTPHeaders:',
      '    X-Test-Mode: true',
      'agent:',
      '  aiActionContext: Prefer visible controls',
      '  reportFileName: checkout-report',
      'tasks:',
      '  - name: Complete checkout',
      '    flow:',
      '      - aiAction:',
      '          prompt: Fill account ${MIDSCENE_MIGRATION_TEST_LOGIN_USER_UNSET}',
      '        cacheable: false',
      '        deepLocate: true',
      '      - aiAssert: Order form is ready',
      '        errorMessage: Order form did not load',
      '        name: formState',
      '        domIncluded: visible-only',
      "      - sleep: '250'",
      '      - recordToReport: Checkout reached',
      '        content: Ready to submit',
      '',
    ].join('\n');
    write(sourcePath, source);

    const result = migrateLegacyYamlProject({
      source: sourcePath,
      outputDir,
    });

    expect(readFileSync(sourcePath, 'utf8')).toBe(source);
    expect(result.workflowPaths).toEqual([
      join(outputDir, 'cases', 'checkout.yaml'),
    ]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('agent.aiActionContext'),
        expect.stringContaining('agent.reportFileName'),
        expect.stringContaining('named aiAssert output "formState"'),
      ]),
    );

    const workflow = loadYaml(
      readFileSync(result.workflowPaths[0], 'utf8'),
    ) as any;
    expect(workflow).toEqual({
      cases: [
        {
          name: 'Complete checkout',
          steps: [
            {
              aiAct: {
                prompt: 'Fill account ${__legacy_env_1}',
                options: { cacheable: false, deepLocate: true },
              },
            },
            {
              aiAssert: {
                prompt: 'Order form is ready',
                message: 'Order form did not load',
                options: { domIncluded: 'visible-only' },
              },
            },
            { wait: { duration: 250, unit: 'ms' } },
            {
              recordToReport: {
                title: 'Checkout reached',
                content: 'Ready to submit',
              },
            },
          ],
        },
      ],
    });

    const loaded = await loadTestProject(result.configPath);
    expect(loaded.test).toMatchObject({ maxConcurrency: 1, bail: 1 });
    expect(loaded.projects).toHaveLength(1);
    expect(loaded.projects[0]).toMatchObject({
      name: 'checkout',
      platform: 'web',
      retry: 0,
      files: { include: ['cases/checkout.yaml'] },
      variables: {
        __legacy_env_1: '${MIDSCENE_MIGRATION_TEST_LOGIN_USER_UNSET}',
      },
    });
    expect(readFileSync(result.reportPath, 'utf8')).toContain(
      '`describe-nodes` is optional documentation output and does not affect execution.',
    );
  });

  it('maps a legacy batch to isolated projects, concurrency, retry, and bail', async () => {
    const root = createTemporaryDirectory();
    const configPath = join(root, 'legacy.config.yaml');
    const outputDir = join(root, 'migrated');
    write(
      configPath,
      [
        'files:',
        '  - a.yaml',
        '  - b.yml',
        'web:',
        '  url: https://example.com',
        'concurrent: 2',
        'continueOnError: true',
        'retry: 2',
        'headed: true',
        '',
      ].join('\n'),
    );
    write(
      join(root, 'a.yaml'),
      [
        'tasks:',
        '  - name: A',
        '    flow:',
        '      - ai: Open account',
        '',
      ].join('\n'),
    );
    write(
      join(root, 'b.yml'),
      [
        'tasks:',
        '  - name: B',
        '    flow:',
        '      - aiAssert: Account is open',
        '',
      ].join('\n'),
    );

    const result = migrateLegacyYamlProject({
      source: configPath,
      outputDir,
    });
    const loaded = await loadTestProject(result.configPath);

    expect(loaded.test).toMatchObject({ maxConcurrency: 2, bail: 0 });
    expect(loaded.projects.map((project) => project.name)).toEqual(['a', 'b']);
    expect(loaded.projects.map((project) => project.retry)).toEqual([2, 2]);
    expect(
      result.workflowPaths.map((path) => path.slice(dirname(path).length + 1)),
    ).toEqual(['a.yaml', 'b.yaml']);
    expect(readFileSync(result.configPath, 'utf8')).toContain(
      '"headless": false',
    );
  });

  it('keeps workflow files unique when different basenames share a slug', async () => {
    const root = createTemporaryDirectory();
    const outputDir = join(root, 'migrated');
    const script = (name: string) =>
      ['tasks:', `  - name: ${name}`, '    flow:', '      - sleep: 1', ''].join(
        '\n',
      );
    write(join(root, 'a b.yaml'), script('Space'));
    write(join(root, 'a-b.yaml'), script('Hyphen'));
    write(join(root, 'a-b-2.yaml'), script('Pre-suffixed'));
    write(
      join(root, 'index.yaml'),
      [
        'files:',
        '  - a b.yaml',
        '  - a-b.yaml',
        '  - a-b-2.yaml',
        'page:',
        '  url: https://example.com',
        '',
      ].join('\n'),
    );

    const result = migrateLegacyYamlProject({ source: root, outputDir });

    expect(result.workflowPaths).toEqual([
      join(outputDir, 'cases', 'a-b.yaml'),
      join(outputDir, 'cases', 'a-b-2.yaml'),
      join(outputDir, 'cases', 'a-b-2-2.yaml'),
    ]);
    expect(
      result.workflowPaths.map(
        (path) => readFileSync(path, 'utf8').match(/name: ([^\n]+)/)?.[1],
      ),
    ).toEqual(['Space', 'Hyphen', 'Pre-suffixed']);
    const loaded = await loadTestProject(result.configPath);
    expect(loaded.projects.map((project) => project.files)).toEqual([
      { include: ['cases/a-b.yaml'] },
      { include: ['cases/a-b-2.yaml'] },
      { include: ['cases/a-b-2-2.yaml'] },
    ]);
  });

  it('keeps project names unique when a basename already contains a duplicate suffix', async () => {
    const root = createTemporaryDirectory();
    const outputDir = join(root, 'migrated');
    for (const directory of ['one', 'two', 'three']) {
      mkdirSync(join(root, directory));
    }
    const script = (name: string) =>
      ['tasks:', `  - name: ${name}`, '    flow:', '      - sleep: 1', ''].join(
        '\n',
      );
    write(join(root, 'one', 'foo.yaml'), script('First'));
    write(join(root, 'two', 'foo.yaml'), script('Second'));
    write(join(root, 'three', 'foo (2).yaml'), script('Pre-suffixed'));
    write(
      join(root, 'index.yaml'),
      [
        'files:',
        '  - one/foo.yaml',
        '  - two/foo.yaml',
        "  - 'three/foo (2).yaml'",
        'page:',
        '  url: https://example.com',
        '',
      ].join('\n'),
    );

    const result = migrateLegacyYamlProject({
      source: join(root, 'index.yaml'),
      outputDir,
    });
    const loaded = await loadTestProject(result.configPath);

    expect(loaded.projects.map((project) => project.name)).toEqual([
      'foo',
      'foo (2)',
      'foo (2) (2)',
    ]);
    expect(result.workflowPaths).toEqual([
      join(outputDir, 'cases', 'foo.yaml'),
      join(outputDir, 'cases', 'foo-2.yaml'),
      join(outputDir, 'cases', 'foo-2-2.yaml'),
    ]);
  });

  it('reports unsupported behavior before writing any output', () => {
    const root = createTemporaryDirectory();
    const sourcePath = join(root, 'unsupported.yaml');
    const outputDir = join(root, 'migrated');
    write(
      sourcePath,
      [
        'web:',
        '  url: https://example.com',
        'tasks:',
        '  - name: Read title',
        '    flow:',
        '      - javascript: document.title',
        '',
      ].join('\n'),
    );

    expect(() =>
      migrateLegacyYamlProject({ source: sourcePath, outputDir }),
    ).toThrow(
      /legacy action "javascript" has no lossless built-in mapping.*remove it from a migration copy/s,
    );
    expect(existsSync(outputDir)).toBe(false);
  });

  it('preserves legacy step env fallback and resolves spaced config env references and keys', async () => {
    const root = createTemporaryDirectory();
    const sourcePath = join(root, 'environment.yaml');
    const missingOutputDir = join(root, 'missing-env');
    const resolvedOutputDir = join(root, 'resolved-env');
    const envNames = [
      'MIDSCENE-MIGRATION-HOST',
      'MIDSCENE-MIGRATION-HEADER',
      'MIDSCENE_MIGRATION_OPTIONAL',
    ];
    const previousValues = Object.fromEntries(
      envNames.map((name) => [name, process.env[name]]),
    );
    for (const name of envNames) Reflect.deleteProperty(process.env, name);
    write(
      sourcePath,
      [
        'web:',
        "  url: 'https://${ MIDSCENE-MIGRATION-HOST }'",
        '  extraHTTPHeaders:',
        "    '${ MIDSCENE-MIGRATION-HEADER }': migration",
        'tasks:',
        '  - name: Environment compatibility',
        '    flow:',
        '      - ai: Value ${ MIDSCENE_MIGRATION_OPTIONAL }',
        '',
      ].join('\n'),
    );

    try {
      const missingResult = migrateLegacyYamlProject({
        source: sourcePath,
        outputDir: missingOutputDir,
      });
      await expect(loadTestProject(missingResult.configPath)).rejects.toThrow(
        'Environment variable "MIDSCENE-MIGRATION-HOST" is not defined',
      );

      process.env['MIDSCENE-MIGRATION-HOST'] = 'example.com';
      process.env['MIDSCENE-MIGRATION-HEADER'] = 'X-Migration-Test';
      const resolvedResult = migrateLegacyYamlProject({
        source: sourcePath,
        outputDir: resolvedOutputDir,
      });
      const withoutOptional = await loadTestProject(resolvedResult.configPath);
      expect(withoutOptional.projects[0].variables).toEqual({
        __legacy_env_1: '${ MIDSCENE_MIGRATION_OPTIONAL }',
      });
      expect(readFileSync(resolvedResult.configPath, 'utf8')).toContain(
        'const resolvedKey = resolveLegacyEnv(key)',
      );

      process.env.MIDSCENE_MIGRATION_OPTIONAL = 'available-at-runtime';
      const secondResult = migrateLegacyYamlProject({
        source: sourcePath,
        outputDir: join(root, 'resolved-env-second-load'),
      });
      const withOptional = await loadTestProject(secondResult.configPath);
      expect(withOptional.projects[0].variables).toEqual({
        __legacy_env_1: 'available-at-runtime',
      });
    } finally {
      for (const name of envNames) {
        const previous = previousValues[name];
        if (previous === undefined) Reflect.deleteProperty(process.env, name);
        else process.env[name] = previous;
      }
    }
  });

  it('expands environment references in legacy batch file globs', () => {
    const root = createTemporaryDirectory();
    const scripts = join(root, 'scripts');
    mkdirSync(scripts);
    write(
      join(scripts, 'case.yaml'),
      [
        'tasks:',
        '  - name: Expanded glob',
        '    flow:',
        '      - sleep: 1',
        '',
      ].join('\n'),
    );
    const sourcePath = join(root, 'index.yaml');
    write(
      sourcePath,
      [
        'files:',
        "  - '${ MIDSCENE_MIGRATION_CASE_GLOB }'",
        'page:',
        '  url: https://example.com',
        '',
      ].join('\n'),
    );
    const previous = process.env.MIDSCENE_MIGRATION_CASE_GLOB;
    try {
      Reflect.deleteProperty(process.env, 'MIDSCENE_MIGRATION_CASE_GLOB');
      expect(() =>
        migrateLegacyYamlProject({
          source: sourcePath,
          outputDir: join(root, 'missing-glob'),
        }),
      ).toThrow(/required to expand the legacy batch file pattern/);

      process.env.MIDSCENE_MIGRATION_CASE_GLOB = 'scripts/*.yaml';
      const result = migrateLegacyYamlProject({
        source: sourcePath,
        outputDir: join(root, 'expanded-glob'),
      });
      expect(result.workflowPaths).toHaveLength(1);
      expect(readFileSync(result.workflowPaths[0], 'utf8')).toContain(
        'Expanded glob',
      );
    } finally {
      if (previous === undefined)
        Reflect.deleteProperty(process.env, 'MIDSCENE_MIGRATION_CASE_GLOB');
      else process.env.MIDSCENE_MIGRATION_CASE_GLOB = previous;
    }
  });

  it('rejects environment references in typed config fields atomically', () => {
    const root = createTemporaryDirectory();
    const outputDir = join(root, 'migrated');
    write(
      join(root, 'viewport.yaml'),
      [
        'web:',
        '  url: https://example.com',
        "  viewportWidth: '${ WIDTH }'",
        'tasks:',
        '  - name: Typed target env',
        '    flow:',
        '      - sleep: 1',
        '',
      ].join('\n'),
    );
    write(
      join(root, 'agent.yaml'),
      [
        'web:',
        '  url: https://example.com',
        'agent:',
        "  generateReport: '${ GENERATE_REPORT }'",
        'tasks:',
        '  - name: Typed agent env',
        '    flow:',
        '      - sleep: 1',
        '',
      ].join('\n'),
    );

    expect(() => migrateLegacyYamlProject({ source: root, outputDir })).toThrow(
      /2 blocking issues.*typed fields.*typed fields/s,
    );
    expect(existsSync(outputDir)).toBe(false);
  });

  it('rejects unknown top-level fields and invalid lifecycle flag types', () => {
    const root = createTemporaryDirectory();
    const sourcePath = join(root, 'index.yaml');
    write(
      join(root, 'script.yaml'),
      [
        'tasks:',
        '  - name: Batch input validation',
        '    flow:',
        '      - sleep: 1',
        '',
      ].join('\n'),
    );
    const batch = (extra: string) =>
      [
        'files:',
        '  - script.yaml',
        'web:',
        '  url: https://example.com',
        extra,
        '',
      ].join('\n');

    write(sourcePath, batch('unknownBatchField: value'));
    expect(() =>
      migrateLegacyYamlProject({
        source: sourcePath,
        outputDir: join(root, 'unknown-output'),
      }),
    ).toThrow(/unsupported field: unknownBatchField/);

    write(sourcePath, batch('shareBrowserContext: invalid'));
    expect(() =>
      migrateLegacyYamlProject({
        source: sourcePath,
        outputDir: join(root, 'lifecycle-output'),
      }),
    ).toThrow(/shareBrowserContext.*must be a boolean/s);

    for (const field of ['dotenvOverride', 'dotenvDebug']) {
      write(sourcePath, batch(`${field}: invalid`));
      expect(() =>
        migrateLegacyYamlProject({
          source: sourcePath,
          outputDir: join(root, `${field}-output`),
        }),
      ).toThrow(new RegExp(`${field}.*must be a boolean`, 's'));
    }

    write(
      join(root, 'script-with-unknown.yaml'),
      [
        'page:',
        '  url: https://example.com',
        'unknownScriptField: value',
        'tasks:',
        '  - name: Unknown script field',
        '    flow:',
        '      - sleep: 1',
        '',
      ].join('\n'),
    );
    expect(() =>
      migrateLegacyYamlProject({
        source: join(root, 'script-with-unknown.yaml'),
        outputDir: join(root, 'unknown-script-output'),
      }),
    ).toThrow(/unsupported field: unknownScriptField/);
  });

  it('exposes migration through the test runner CLI', async () => {
    const root = createTemporaryDirectory();
    const sourcePath = join(root, 'smoke.yaml');
    const outputDir = join(root, 'migrated');
    write(
      sourcePath,
      [
        'page:',
        '  url: https://example.com',
        'tasks:',
        '  - name: Smoke',
        '    flow:',
        '      - aiAssert: Page is visible',
        '',
      ].join('\n'),
    );
    const logs: string[] = [];
    const errors: string[] = [];

    const exitCode = await runTestCli(
      ['migrate', sourcePath, '--output-dir', outputDir],
      {
        log: (message) => logs.push(message),
        error: (message) => errors.push(message),
      },
    );

    expect(exitCode).toBe(0);
    expect(errors).toEqual([]);
    expect(logs[0]).toContain('converted 1 legacy YAML file');
    expect(existsSync(join(outputDir, 'midscene.config.ts'))).toBe(true);
  });
});
