import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import * as common from '@midscene/shared/common';
import { getDebug } from '@midscene/shared/logger';
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';
import { runTestProject } from '../src/cli';

const roots: string[] = [];
const cjs = createRequire(import.meta.url)(
  '@midscene/shared/common',
) as typeof common;
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'midscene-artifact-paths-'));
  roots.push(root);
  return root;
};
const write = (root: string, name: string, value: string) => {
  const file = join(root, name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, value);
};
const project = (root: string, output = '{}') => {
  write(
    root,
    'midscene.config.ts',
    `
    const s=globalThis.__artifactPaths;
    export default {
      output:${output},
      nodes:[{name:'recordPaths',async execute(){
        await s.pause?.();
        const paths=['cache','log','output','tmp','dump'].map(name=>s.common.getMidsceneRunSubDir(name));
        s.seen.push({root:s.common.getMidsceneRunDir(),cjsRoot:s.cjs.getMidsceneRunDir(),paths});
        s.getDebug('test:artifact-paths')('artifact marker %s', s.common.getMidsceneRunDir());
      }}],
    };
  `,
  );
  write(
    root,
    'case.yaml',
    'cases:\n  - name: scope\n    steps:\n      - recordPaths: {}\n',
  );
};
let state: {
  common: typeof common;
  cjs: typeof common;
  getDebug: typeof getDebug;
  seen: { root: string; cjsRoot: string; paths: string[] }[];
  pause?: () => Promise<void>;
};
beforeEach(() => {
  rs.stubEnv('MIDSCENE_RUN_DIR', undefined);
  state = { common, cjs, getDebug, seen: [] };
  (globalThis as any).__artifactPaths = state;
});
afterEach(() => {
  rs.unstubAllEnvs();
  (globalThis as any).__artifactPaths = undefined;
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe('one artifact root for native Test', () => {
  it('ignores generated YAML when the artifact root is the project itself', async () => {
    const root = fixture();
    rs.stubEnv('MIDSCENE_RUN_DIR', '.');
    project(root);
    for (const directory of ['cache', 'log', 'output', 'tmp', 'dump'])
      write(root, `${directory}/copy.yaml`, 'invalid generated YAML');
    const result = await runTestProject({ projectRoot: root });
    expect(result.status).toBe('success');
    expect(result.summary.total).toBe(1);
    expect(result.resultDir).toBe(join(root, 'test-results'));
  });
  it.each(['default', 'environment', 'absolute-environment'] as const)(
    'uses the %s root for results, report and SDK artifacts',
    async (source) => {
      const root = fixture();
      const cwd = fixture();
      const directory =
        source === 'default' ? 'midscene_run' : 'artifacts [local]';
      const artifactRoot =
        source === 'absolute-environment'
          ? join(fixture(), directory)
          : join(root, directory);
      if (source !== 'default')
        rs.stubEnv(
          'MIDSCENE_RUN_DIR',
          source === 'environment' ? directory : artifactRoot,
        );
      project(root);
      write(artifactRoot, 'copied-case.yaml', 'invalid generated YAML');
      const result = await runTestProject({ cwd, projectRoot: root });
      expect(result.status).toBe('success');
      expect(result.summary.total).toBe(1);
      expect(result.resultDir).toBe(join(artifactRoot, 'test-results'));
      expect(result.reportDir).toBe(join(artifactRoot, 'report'));
      expect(result.summaryPath).toBe(
        join(result.resultDir, result.runId, 'summary.json'),
      );
      expect(result.reportPath).toBe(
        join(result.reportDir, `midscene-e2e-${result.runId}.html`),
      );
      expect(existsSync(join(root, '.midscene'))).toBe(false);
      expect(existsSync(join(cwd, 'midscene_run'))).toBe(false);
      expect(state.seen).toEqual([
        {
          root: artifactRoot,
          cjsRoot: artifactRoot,
          paths: ['cache', 'log', 'output', 'tmp', 'dump'].map((name) =>
            join(artifactRoot, name),
          ),
        },
      ]);
      const summary = JSON.parse(readFileSync(result.summaryPath, 'utf8'));
      expect(resolve(dirname(result.summaryPath), summary.report)).toBe(
        result.reportPath,
      );
      await rs.waitFor(() =>
        expect(
          readFileSync(
            join(artifactRoot, 'log', 'test-artifact-paths.log'),
            'utf8',
          ),
        ).toContain(artifactRoot),
      );
    },
  );

  it('preserves explicit result/report locations and old results without collecting their YAML', async () => {
    const root = fixture();
    const cwd = fixture();
    rs.stubEnv('MIDSCENE_RUN_DIR', 'artifacts');
    project(root, "{reportDir:'reports'}");
    const resultDir = join(root, 'results');
    write(root, 'results/old/copy.yaml', 'invalid generated YAML');
    write(root, 'reports/copy.yaml', 'invalid generated YAML');
    write(
      root,
      '.midscene/test-results/old/evidence.yaml',
      'keep previous run',
    );
    const result = await runTestProject({
      cwd,
      projectRoot: root,
      resultDir: relative(cwd, resultDir),
    });
    expect(result.status).toBe('success');
    expect(result.summary.total).toBe(1);
    expect(result.resultDir).toBe(resultDir);
    expect(result.reportDir).toBe(join(root, 'reports'));
    expect(
      readFileSync(
        join(root, '.midscene/test-results/old/evidence.yaml'),
        'utf8',
      ),
    ).toBe('keep previous run');
  });

  it.each(['', '  '])(
    'rejects an empty environment root %j before execution',
    async (directory) => {
      const root = fixture();
      project(root);
      rs.stubEnv('MIDSCENE_RUN_DIR', directory);
      await expect(runTestProject({ projectRoot: root })).rejects.toThrow(
        'non-empty path',
      );
      expect(state.seen).toHaveLength(0);
      expect(existsSync(join(root, 'midscene_run'))).toBe(false);
    },
  );

  it('rejects an environment root that is a file without redirecting output', async () => {
    const root = fixture();
    project(root);
    write(root, 'artifact-root', 'keep this file');
    rs.stubEnv('MIDSCENE_RUN_DIR', 'artifact-root');
    await expect(runTestProject({ projectRoot: root })).rejects.toThrow();
    expect(state.seen).toHaveLength(0);
    expect(readFileSync(join(root, 'artifact-root'), 'utf8')).toBe(
      'keep this file',
    );
    expect(existsSync(join(root, 'midscene_run'))).toBe(false);
  });

  it.each(['default', 'environment'] as const)(
    'isolates concurrent projects with the %s root across ESM/CJS SDKs and restores the caller root',
    async (source) => {
      const first = fixture();
      const second = fixture();
      const directory =
        source === 'default' ? 'midscene_run' : 'artifacts [local]';
      if (source === 'environment') rs.stubEnv('MIDSCENE_RUN_DIR', directory);
      project(first);
      project(second);
      let entered = 0;
      let release!: () => void;
      const barrier = new Promise<void>((done) => {
        release = done;
      });
      state.pause = async () => {
        if (++entered === 2) release();
        await barrier;
      };
      const before = common.getMidsceneRunDir();
      const results = await Promise.all([
        runTestProject({ projectRoot: first }),
        runTestProject({ projectRoot: second }),
      ]);
      expect(results.map((r) => r.status)).toEqual(['success', 'success']);
      expect(state.seen.map((s) => s.root).sort()).toEqual(
        [first, second].map((r) => join(r, directory)).sort(),
      );
      for (const row of state.seen) {
        expect(row.cjsRoot).toBe(row.root);
        expect(row.paths.every((p) => p.startsWith(row.root))).toBe(true);
      }
      expect(common.getMidsceneRunDir()).toBe(before);
      for (const root of [first, second])
        await rs.waitFor(() => {
          const log = readFileSync(
            join(root, directory, 'log/test-artifact-paths.log'),
            'utf8',
          );
          expect(log).toContain(root);
          expect(log).not.toContain(root === first ? second : first);
        });
    },
  );
});
