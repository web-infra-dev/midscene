import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from '@rstest/core';
import {
  cliPath,
  execFileAsync,
  packageRoot,
  runFailure,
  summaryPathFor,
} from './test-cli-support';

const temporaryDirectories: string[] = [];
afterAll(() => {
  for (const directory of temporaryDirectories)
    rmSync(directory, { recursive: true, force: true });
});

describe('midscene-test CLI configuration', () => {
  it.each(['file', 'directory', 'symlink'])(
    'collects a standalone external %s without loading its config',
    async (kind) => {
      const cwd = mkdtempSync(join(tmpdir(), 'cli-standalone-cwd-'));
      const target = mkdtempSync(join(tmpdir(), 'cli-standalone-target-'));
      temporaryDirectories.push(cwd, target);
      writeFileSync(
        join(target, 'midscene.config.mjs'),
        'throw new Error("target config loaded")',
      );
      writeFileSync(
        join(target, 'case.yaml'),
        'cases: [{ name: standalone, steps: [{ wait: { duration: 1, unit: ms } }] }]',
      );
      const targetFile = join(target, 'case.yaml');
      let input = kind === 'directory' ? target : targetFile;
      if (kind === 'symlink') {
        input = join(cwd, 'linked.yaml');
        symlinkSync(targetFile, input, 'file');
      }
      const failure = await runFailure([input], process.env, cwd);
      expect(failure.code).toBe(1);
      expect(failure.stderr).toContain('unknown node "wait"');
      expect(failure.stderr).not.toContain('target config loaded');
      const summary = JSON.parse(
        readFileSync(
          summaryPathFor(join(cwd, 'midscene_run/test-results')),
          'utf8',
        ),
      );
      expect(summary.projectRoot).toBe(realpathSync(cwd));
      expect(summary.projects[0].collectionErrors).toHaveLength(1);
    },
  );

  it('runs file and directory filters with the same cwd config and artifacts', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cli-path-filter-'));
    temporaryDirectories.push(root);
    mkdirSync(join(root, 'cases'));
    writeFileSync(
      join(root, 'midscene.config.mjs'),
      `export default {
      nodes: [{ name: 'noop', execute() {} }],
      projects: [{ name: 'smoke', files: { include: ['cases/*.yaml'], exclude: ['**/excluded.yaml'] } }],
    };`,
    );
    writeFileSync(
      join(root, 'cases/midscene.config.mjs'),
      'throw new Error("nested config loaded");',
    );
    for (const name of ['one', 'two'])
      writeFileSync(
        join(root, `cases/${name}.yaml`),
        `cases: [{ name: ${name}, steps: [{ noop: {} }] }]`,
      );
    writeFileSync(join(root, 'cases/excluded.yaml'), 'cases: invalid');
    for (const [index, path] of [
      undefined,
      'cases/one.yaml',
      'cases',
    ].entries()) {
      const resultDir = join(root, `results-${index}`);
      const execution = await execFileAsync(
        process.execPath,
        [cliPath, ...(path ? [path] : []), '--result-dir', resultDir],
        { cwd: root },
      );
      const summary = JSON.parse(
        readFileSync(summaryPathFor(resultDir), 'utf8'),
      );
      expect(summary.projectRoot).toBe(realpathSync(root));
      expect(summary.summary.passed).toBe(index === 1 ? 1 : 2);
      expect(execution.stdout).toContain('Report:');
    }
    const resultDir = join(root, 'child-results');
    await execFileAsync(
      process.execPath,
      [
        cliPath,
        'one.yaml',
        '--config',
        '../midscene.config.mjs',
        '--result-dir',
        '../child-results',
      ],
      { cwd: join(root, 'cases') },
    );
    const summary = JSON.parse(readFileSync(summaryPathFor(resultDir), 'utf8'));
    expect(summary.projectRoot).toBe(realpathSync(root));
    expect(summary.projects[0].cases[0].sourcePath).toBe('cases/one.yaml');
    const failure = await runFailure(
      ['cases/excluded.yaml'],
      process.env,
      root,
    );
    expect(failure.code).toBe(1);
    expect(failure.stderr).toContain('No test cases match');
  });

  it.each(['smoke', 'missing'])(
    'counts only files selected by the %s tag in the completed CLI output',
    async (tag) => {
      const root = mkdtempSync(join(tmpdir(), 'cli-filtered-files-'));
      temporaryDirectories.push(root);
      const resultDir = join(root, 'results');
      writeFileSync(
        join(root, 'midscene.config.mjs'),
        `export default {
  projects: [{ name: 'web', tags: { include: [${JSON.stringify(tag)}] } }],
  nodes: [{ name: 'test.record', execute({ input }) {
    if (input.tag === 'slow') throw new Error('A filtered Case must not run');
  } }],
};\n`,
      );
      for (const name of ['smoke', 'slow'])
        writeFileSync(
          join(root, `${name}.yaml`),
          `cases:\n  - name: ${name}\n    tags: [${name}]\n    steps:\n      - test.record:\n          tag: ${name}\n`,
        );
      const execution = await execFileAsync(
        process.execPath,
        [
          cliPath,
          '--config',
          join(root, 'midscene.config.mjs'),
          '--result-dir',
          resultDir,
        ],
        { cwd: packageRoot },
      );
      const selected = tag === 'smoke' ? 1 : 0;
      expect(execution.stdout).toContain(
        `1 projects · ${selected} files · ${selected} cases`,
      );
      expect(execution.stdout).toContain(
        `Test Files ${selected} passed (${selected})`,
      );
      expect(execution.stdout).not.toContain('slow.yaml');
      if (!selected) expect(execution.stdout).not.toContain('smoke.yaml');
      const summary = JSON.parse(
        readFileSync(summaryPathFor(resultDir), 'utf8'),
      );
      expect(summary.projects[0].sourceCount).toBe(2);
      expect(summary.projects[0].selectedCaseCount).toBe(selected);
      expect(summary.summary.filtered).toBe(2 - selected);
    },
  );

  it('prints the original config stack and preserves the failure exit code', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cli-config-error-'));
    temporaryDirectories.push(root);
    const config = join(root, 'midscene.config.mjs');
    writeFileSync(
      config,
      `function failConfig() { throw new Error('original config failure'); }\nfailConfig();`,
    );

    const failure = await runFailure(['nodes', root]);

    expect(failure.code).toBe(1);
    expect(failure.stderr).toContain(
      `Failed to load Midscene config "${config}"`,
    );
    expect(failure.stderr).toContain('Error: original config failure');
    expect(failure.stderr).toMatch(
      /at failConfig \(.*midscene\.config\.mjs:1:\d+\)/,
    );
  });

  it('rejects legacy workflows and batch configs with the matching-command guidance', async () => {
    const root = mkdtempSync(join(tmpdir(), 'strict-test-entry-'));
    temporaryDirectories.push(root);
    const legacy = join(root, 'flow.yaml');
    writeFileSync(legacy, 'tasks:\n  - name: old\n    flow: []\n');
    const config = join(root, 'batch.yaml');
    writeFileSync(config, 'files: [flow.yaml]\n');

    const workflowFailure = await runFailure([legacy], process.env, root);
    expect(workflowFailure.stderr).toContain(
      'Legacy tasks/flow YAML is not supported by midscene-test',
    );
    expect(workflowFailure.stderr).toContain('midscene');

    const configFailure = await runFailure(['--config', config]);
    expect(configFailure.stderr).toContain(
      'midscene-test --config only accepts a native TypeScript or JavaScript project config',
    );
    expect(configFailure.stderr).toContain('midscene --config');
  });
});
