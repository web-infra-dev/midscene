import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { prepareTestRun } from '../src/cli/prepare-test-run';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'midscene-preparation-'));
  directories.push(root);
  const selected = join(root, 'cases', 'smoke');
  const write = (path: string, content: string) => {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  };
  write(
    'midscene.config.mjs',
    `export default { nodes: [{ name: 'noop', stringInputKey: 'prompt', execute() {} }], output: { reportDir: 'reports' } };`,
  );
  write(
    'cases/smoke/a.yaml',
    'cases: [{ name: selected, steps: [{ noop: run }] }]',
  );
  write(
    'cases/other/b.yaml',
    'cases: [{ name: other, steps: [{ noop: run }] }]',
  );
  return { root, selected, write };
}

it('inherits ancestor config for a single YAML without collecting sibling files', async () => {
  const { root, selected } = fixture();
  const plan = await prepareTestRun({
    cwd: root,
    projectRoot: join(selected, 'a.yaml'),
  });
  expect(plan.configPath).toBe(join(root, 'midscene.config.mjs'));
  expect(plan.projectRoot).toBe(root);
  expect(plan.reportDir).toBe(join(root, 'reports'));
  expect(plan.projects[0].sources.map(({ sourcePath }) => sourcePath)).toEqual([
    'cases/smoke/a.yaml',
  ]);
  expect(plan.projects[0].collectionErrors).toEqual([]);
});

it.each([false, true])(
  'preserves directory selection when cwd is the selected directory: %s',
  async (useSelectedCwd) => {
    const { root, selected } = fixture();
    const plan = await prepareTestRun(
      useSelectedCwd ? { cwd: selected } : { cwd: root, projectRoot: selected },
    );
    expect(plan.configPath).toBe(join(root, 'midscene.config.mjs'));
    expect(plan.projectRoot).toBe(selected);
    expect(plan.resultDir).toBe(join(selected, '.midscene', 'test-results'));
    expect(plan.reportDir).toBe(join(selected, 'reports'));
    expect(
      plan.projects[0].sources.map(({ sourcePath }) => sourcePath),
    ).toEqual(['a.yaml']);
    expect(plan.projects[0].collectionErrors).toEqual([]);
  },
);

it('keeps directory include and exclude patterns relative to the selected directory', async () => {
  const { root, selected, write } = fixture();
  write(
    'midscene.config.mjs',
    `export default { nodes: [], projects: [{ name: 'selected', files: { include: ['flows/*.yaml'], exclude: ['**/*.draft.yaml'] } }] };`,
  );
  write('cases/smoke/flows/chosen.yaml', 'cases: []');
  write('cases/smoke/flows/ignored.draft.yaml', 'cases: []');
  const plan = await prepareTestRun({ cwd: root, projectRoot: selected });
  expect(plan.projects[0].sources.map(({ sourcePath }) => sourcePath)).toEqual([
    'flows/chosen.yaml',
  ]);
});
