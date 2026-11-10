import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from '@rstest/core';
import { prepareTestRun } from '../src/cli/prepare-test-run';
import { parseTestCliArgs } from '../src/cli/test-command';

const roots: string[] = [];
const write = (root: string, path: string, content: string) => {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
};
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'midscene-config-context-'));
  roots.push(root);
  write(
    root,
    'midscene.config.ts',
    `export default {
    nodes: [{ name: 'noop', execute() {} }],
    output: { reportDir: './reports' },
    projects: [
      { name: 'smoke', files: { include: ['cases/**/*.yaml'], exclude: ['**/*.draft.yaml'] }, tags: { include: ['smoke'] } },
      { name: 'other', files: { include: ['other/**/*.yaml'] } },
    ],
  };`,
  );
  for (const path of [
    'cases/a.yaml',
    'cases/nested/b.yaml',
    'cases/ab/c.yaml',
    'other/d.yaml',
  ])
    write(
      root,
      path,
      'cases: [{ name: example, tags: [smoke], steps: [{ noop: {} }] }]',
    );
  write(root, 'cases/b.draft.yaml', 'cases: invalid');
  write(
    root,
    'cases/untagged.yaml',
    'cases: [{ name: untagged, steps: [{ noop: {} }] }]',
  );
  // A nested config must never replace the invocation's project context.
  write(
    root,
    'cases/midscene.config.ts',
    'throw new Error("nested config loaded");',
  );
  return root;
};
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
const selected = (plan: Awaited<ReturnType<typeof prepareTestRun>>) =>
  plan.projects.flatMap((p) => p.documents.map((d) => d.sourcePath));

describe('stable project context with CLI path filters', () => {
  it.each([undefined, 'cases/a.yaml', 'cases/nested', 'cases'])(
    'keeps config, nodes and output paths for %s',
    async (path) => {
      const root = fixture();
      const plan = await prepareTestRun(
        parseTestCliArgs(path ? [path] : [], root),
      );
      expect(plan.projectRoot).toBe(root);
      expect(plan.configPath).toBe(join(root, 'midscene.config.ts'));
      expect(plan.reportDir).toBe(join(root, 'reports'));
      expect(plan.resultDir).toBe(join(root, 'midscene_run/test-results'));
      expect(plan.projects.flatMap((p) => p.collectionErrors)).toEqual([]);
      expect(selected(plan)).toEqual(
        path === 'cases/a.yaml'
          ? ['cases/a.yaml']
          : path === 'cases/nested'
            ? ['cases/nested/b.yaml']
            : path === 'cases'
              ? ['cases/a.yaml', 'cases/ab/c.yaml', 'cases/nested/b.yaml']
              : [
                  'cases/a.yaml',
                  'cases/ab/c.yaml',
                  'cases/nested/b.yaml',
                  'other/d.yaml',
                ],
      );
    },
  );

  it.each(['relative', 'absolute'])(
    'resolves %s explicit config from cwd and uses its directory as root',
    async (kind) => {
      const root = fixture();
      const cwd = join(root, 'cases/nested');
      const config =
        kind === 'relative'
          ? '../../midscene.config.ts'
          : join(root, 'midscene.config.ts');
      const plan = await prepareTestRun(
        parseTestCliArgs(
          ['b.yaml', '--config', config, '--result-dir', 'results'],
          cwd,
        ),
      );
      expect(plan.projectRoot).toBe(root);
      expect(plan.reportDir).toBe(join(root, 'reports'));
      expect(plan.resultDir).toBe(join(cwd, 'results'));
      expect(selected(plan)).toEqual(['cases/nested/b.yaml']);
    },
  );

  it.each([
    'cases/b.draft.yaml',
    'cases/untagged.yaml',
    'midscene_run/generated.yaml',
  ])('does not bypass file or tag exclusions for %s', async (path) => {
    const root = fixture();
    write(root, 'midscene_run/generated.yaml', 'cases: invalid');
    await expect(
      prepareTestRun(parseTestCliArgs([path], root)),
    ).rejects.toThrow(/No test cases match.*files.*tags/);
  });

  it('keeps project selection and directory boundaries', async () => {
    const root = fixture();
    await expect(
      prepareTestRun(parseTestCliArgs(['cases', '--project', 'other'], root)),
    ).rejects.toThrow(/No test cases match/);
    const plan = await prepareTestRun(parseTestCliArgs(['cases/ab'], root));
    expect(selected(plan)).toEqual(['cases/ab/c.yaml']);
  });

  it('does not search parent or child configs without --config', async () => {
    const root = fixture();
    const cwd = join(root, 'cases/nested');
    const plan = await prepareTestRun(parseTestCliArgs(['b.yaml'], cwd));
    expect(plan.projectRoot).toBe(cwd);
    expect(plan.configPath).toBeUndefined();
    expect(plan.projects[0].collectionErrors).toHaveLength(1);
  });

  it('keeps cwd as root without a config even for a nested file', async () => {
    const root = fixture();
    const cwd = join(root, 'other');
    write(cwd, 'nested/empty.yaml', 'cases: [{ name: empty, steps: [] }]');
    const plan = await prepareTestRun(
      parseTestCliArgs(['nested/empty.yaml'], cwd),
    );
    expect(plan.projectRoot).toBe(cwd);
    expect(plan.configPath).toBeUndefined();
  });

  it.each(['file', 'directory'])(
    'collects an external %s without loading its config',
    async (kind) => {
      const cwd = mkdtempSync(join(tmpdir(), 'midscene-no-config-'));
      roots.push(cwd);
      const target = mkdtempSync(join(tmpdir(), 'midscene-external-'));
      roots.push(target);
      write(
        target,
        'standalone.yaml',
        'cases: [{ name: standalone, steps: [{ wait: { duration: 1, unit: ms } }] }]',
      );
      // Even an invalid config beside the selected YAML must not be loaded.
      write(
        target,
        'midscene.config.ts',
        'throw new Error("target config loaded");',
      );
      const path = kind === 'file' ? join(target, 'standalone.yaml') : target;
      const plan = await prepareTestRun(parseTestCliArgs([path], cwd));
      expect(plan.configPath).toBeUndefined();
      const errors = plan.projects.flatMap((p) => p.collectionErrors);
      expect(errors).toHaveLength(1);
      expect(errors[0].sourcePath).toMatch(/standalone\.yaml$/);
      expect(errors[0].error.message).toContain('unknown node "wait"');
      expect(plan.projectRoot).toBe(cwd);
      expect(plan.resultDir).toBe(join(cwd, 'midscene_run/test-results'));
    },
  );

  it('rejects missing paths and non-YAML files before collection', async () => {
    const root = fixture();
    await expect(
      prepareTestRun(parseTestCliArgs(['missing.yaml'], root)),
    ).rejects.toThrow(/Test path does not exist/);
    await expect(
      prepareTestRun(parseTestCliArgs(['midscene.config.ts'], root)),
    ).rejects.toThrow(/YAML file or directory/);
  });

  it('matches an absolute path through a symlinked working directory', async () => {
    const root = fixture();
    const alias = join(root, 'alias');
    symlinkSync(join(root, 'cases'), alias, 'dir');
    const plan = await prepareTestRun(
      parseTestCliArgs(
        ['a.yaml', '--config', join(root, 'midscene.config.ts')],
        alias,
      ),
    );
    expect(selected(plan)).toEqual(['cases/a.yaml']);
  });

  it('does not switch projects for a path outside cwd', async () => {
    const root = fixture();
    const outside = fixture();
    await expect(
      prepareTestRun(parseTestCliArgs([join(outside, 'cases/a.yaml')], root)),
    ).rejects.toThrow(/No test cases match/);
  });
});
