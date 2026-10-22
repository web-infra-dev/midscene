import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { prepareTestRun } from '../src/cli/prepare-test-run';
import { discoverTestConfig } from '../src/cli/project-preparation';

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
  expect(plan.resultDir).toBe(join(root, '.midscene', 'test-results'));
  expect(plan.reportDir).toBe(join(root, 'reports'));
  expect(plan.projects[0].sources.map(({ sourcePath }) => sourcePath)).toEqual([
    'cases/smoke/a.yaml',
  ]);
  expect(plan.projects[0].collectionErrors).toEqual([]);
});

it.each(['midscene.config.ts', 'midscene.config.mjs'])(
  'uses the nearest %s instead of an outer config',
  (configName) => {
    const { root, selected, write } = fixture();
    write(`cases/${configName}`, 'export default { nodes: [] };');
    expect(discoverTestConfig(selected)).toBe(join(root, 'cases', configName));
  },
);

it.each(['package.json', '.git directory', '.git file'])(
  'loads a config at the %s boundary and does not cross it',
  (boundary) => {
    const { root, selected, write } = fixture();
    if (boundary === '.git directory') mkdirSync(join(root, 'cases', '.git'));
    else write(`cases/${boundary === '.git file' ? '.git' : boundary}`, '');
    expect(discoverTestConfig(selected)).toBeUndefined();
    write('cases/midscene.config.mjs', 'export default { nodes: [] };');
    expect(discoverTestConfig(selected)).toBe(
      join(root, 'cases', 'midscene.config.mjs'),
    );
  },
);

it.each([
  ['ts', 'Multiple Midscene configs'],
  ['cjs', 'Unsupported or conflicting Midscene configs'],
])(
  'rejects an ambiguous or unsupported ancestor config: %s',
  (extension, message) => {
    const { selected, write } = fixture();
    write(`midscene.config.${extension}`, 'export default { nodes: [] };');
    expect(() => discoverTestConfig(selected)).toThrow(message);
  },
);

it('preserves single-file roots and bypasses discovery with an explicit config', async () => {
  const { root, selected, write } = fixture();
  write('midscene.config.cjs', 'unsupported ancestor must not be discovered');
  write(
    'custom.config.mjs',
    `export default { nodes: [{ name: 'noop', stringInputKey: 'prompt', execute() {} }], output: { reportDir: 'custom-reports' } };`,
  );
  const plan = await prepareTestRun({
    cwd: root,
    projectRoot: join(selected, 'a.yaml'),
    configPath: '../../custom.config.mjs',
  });
  expect(plan.configPath).toBe(join(root, 'custom.config.mjs'));
  expect(plan.projectRoot).toBe(selected);
  expect(plan.resultDir).toBe(join(selected, '.midscene', 'test-results'));
  expect(plan.reportDir).toBe(join(selected, 'custom-reports'));
  expect(plan.projects[0].sources.map(({ sourcePath }) => sourcePath)).toEqual([
    'a.yaml',
  ]);
  expect(plan.projects[0].collectionErrors).toEqual([]);
});

it('resolves an explicit result directory from cwd after finding an ancestor config', async () => {
  const { root, selected } = fixture();
  const caller = join(root, 'caller');
  mkdirSync(caller);
  const plan = await prepareTestRun({
    cwd: caller,
    projectRoot: '../cases/smoke/a.yaml',
    resultDir: './results',
  });
  expect(plan.configPath).toBe(join(root, 'midscene.config.mjs'));
  expect(plan.projectRoot).toBe(root);
  expect(plan.resultDir).toBe(join(caller, 'results'));
  expect(plan.reportDir).toBe(join(root, 'reports'));
  expect(plan.projects[0].collectionErrors).toEqual([]);
});

it('retains the file directory when no config is found within the project boundary', async () => {
  const { root, selected, write } = fixture();
  rmSync(join(root, 'midscene.config.mjs'));
  write('package.json', '{}');
  const plan = await prepareTestRun({
    cwd: root,
    projectRoot: join(selected, 'a.yaml'),
  });
  expect(plan.configPath).toBeUndefined();
  expect(plan.projectRoot).toBe(selected);
  expect(plan.resultDir).toBe(join(selected, '.midscene', 'test-results'));
  expect(plan.projects[0].sources.map(({ sourcePath }) => sourcePath)).toEqual([
    'a.yaml',
  ]);
  expect(plan.projects[0].collectionErrors).toHaveLength(1);
  expect(plan.projects[0].collectionErrors[0].error.message).toContain(
    'unknown node "noop"',
  );
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
    `export default { nodes: [{ name: 'noop', execute() {} }], projects: [{ name: 'selected', files: { include: ['flows/*.yaml'], exclude: ['**/*.draft.yaml'] } }] };`,
  );
  const source = 'cases: [{ name: selected, steps: [{ noop: {} }] }]';
  write('cases/smoke/flows/chosen.yaml', source);
  write('cases/smoke/flows/ignored.draft.yaml', source);
  const plan = await prepareTestRun({ cwd: root, projectRoot: selected });
  expect(plan.projects[0].sources.map(({ sourcePath }) => sourcePath)).toEqual([
    'flows/chosen.yaml',
  ]);
  expect(plan.projects[0].collectionErrors).toEqual([]);
});
