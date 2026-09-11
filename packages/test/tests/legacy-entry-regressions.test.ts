import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { version } from '../package.json';
import { parseTestCliArgs, runTestCli } from '../src/cli/test-command';
import { runTestProject } from '../src/cli/test-project-runner';

// Exercise the real Node host without letting Vite resolve browser-only WASM.
vi.mock('../src/runtime/create-yaml-player', async () => {
  const { createRequire } = await import('node:module');
  return createRequire(import.meta.url)('../dist/lib/runtime/index.js');
});

let root: string;
let legacyYaml: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'legacy-entry-regression-'));
  const device = join(root, 'device.mjs');
  writeFileSync(
    device,
    `
export default class Device {
  interfaceType = 'custom';
  actionSpace() { return []; }
  async destroy() {}
}
`,
  );
  legacyYaml = `interface:
  module: ${JSON.stringify(device)}
agent:
  generateReport: false
tasks:
  - name: original task
    flow: []
`;
  vi.stubEnv('MIDSCENE_RUN_DIR', join(root, 'midscene_run'));
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

describe('legacy entry regressions', () => {
  it.each([0, 1])(
    'prints final step failures without reporting recovered attempts (retry: %s)',
    async (retry) => {
      writeFileSync(
        join(root, 'device.mjs'),
        `let calls = 0;
export default class Device {
  interfaceType = 'custom';
  actionSpace() { return []; }
  async evaluateJavaScript() {
    if (++calls === 1) throw new Error('intentional first action failure');
    return 42;
  }
  async destroy() {}
}`,
      );
      const file = join(root, 'action-failure.yaml');
      writeFileSync(
        file,
        legacyYaml.replace('flow: []', 'flow:\n      - javascript: "42"'),
      );
      const io = { log: vi.fn(), error: vi.fn() };
      expect(await runTestCli([file, '--retry', String(retry)], io)).toBe(
        retry ? 0 : 1,
      );
      if (retry) {
        expect(io.error).not.toHaveBeenCalled();
      } else {
        expect(io.error).toHaveBeenCalledExactlyOnceWith(
          expect.stringMatching(
            /action-failure\.yaml.*original task.*steps\[1\].*intentional first action failure/,
          ),
        );
      }
    },
  );

  it('prints the source and cause of a legacy YAML collection failure', async () => {
    const file = join(root, 'missing-env.yaml');
    vi.stubEnv('MIDSCENE_TEST_MISSING_USAGE_ENV', undefined);
    writeFileSync(
      file,
      'web:\n  url: ${MIDSCENE_TEST_MISSING_USAGE_ENV}\ntasks: []\n',
    );
    const io = { log: vi.fn(), error: vi.fn() };
    expect(await runTestCli([file], io)).toBe(1);
    expect(io.error).toHaveBeenCalledWith(
      expect.stringContaining('missing-env.yaml'),
    );
    expect(io.error).toHaveBeenCalledWith(
      expect.stringContaining('MIDSCENE_TEST_MISSING_USAGE_ENV'),
    );
  });

  it.each(['yaml', 'yml'])(
    'runs a selected old file beside midscene.config.%s',
    async (extension) => {
      const file = join(root, 'task.yaml');
      writeFileSync(file, legacyYaml);
      writeFileSync(
        join(root, `midscene.config.${extension}`),
        'files: [task.yaml]\n',
      );
      const result = await runTestProject({ cwd: root, projectRoot: file });
      expect(result.exitCode).toBe(0);
      expect(result.summary).toMatchObject({
        total: 1,
        passed: 1,
        collectionErrors: 0,
      });
    },
  );

  it('retains old matching when every selected file in a directory is a legacy script', async () => {
    writeFileSync(join(root, 'task.yaml'), legacyYaml);
    writeFileSync(join(root, 'midscene.config.yaml'), legacyYaml);
    const result = await runTestProject({ cwd: root, projectRoot: root });
    expect(result.exitCode).toBe(0);
    expect(result.summary).toMatchObject({
      total: 2,
      passed: 2,
      collectionErrors: 0,
    });
  });

  it('does not silently discard a batch config selected by the old directory matcher', async () => {
    writeFileSync(join(root, 'task.yaml'), legacyYaml);
    writeFileSync(join(root, 'midscene.config.yaml'), 'files: [task.yaml]\n');
    await expect(
      runTestProject({ cwd: root, projectRoot: root }),
    ).rejects.toThrow('Only midscene.config.ts is supported');
  });

  it('keeps explicit native configuration authoritative for a legacy file', async () => {
    const file = join(root, 'task.yaml');
    writeFileSync(file, legacyYaml);
    writeFileSync(join(root, 'midscene.config.yaml'), 'files: [task.yaml]\n');
    writeFileSync(
      join(root, 'selected.config.ts'),
      `export default {
      nodes: [],
      setup: { name: 'explicit setup', setup() { throw new Error('explicit setup was used'); } }
    };`,
    );
    const result = await runTestProject({
      cwd: root,
      projectRoot: file,
      configPath: 'selected.config.ts',
    });
    expect(result.exitCode).toBe(1);
    expect(result.projects[0].lifecycle?.setupError?.message).toContain(
      'explicit setup was used',
    );
  });

  it('preserves native configuration discovery for native workflows', async () => {
    const file = join(root, 'native.yaml');
    writeFileSync(file, 'cases: []\n');
    writeFileSync(join(root, 'midscene.config.yaml'), 'files: [native.yaml]\n');
    await expect(
      runTestProject({ cwd: root, projectRoot: file }),
    ).rejects.toThrow('Only midscene.config.ts is supported');
  });

  it('preserves native config conflicts when midscene.config.ts exists', async () => {
    const file = join(root, 'task.yaml');
    writeFileSync(file, legacyYaml);
    writeFileSync(
      join(root, 'midscene.config.ts'),
      'export default { nodes: [] };',
    );
    writeFileSync(join(root, 'midscene.config.yaml'), 'files: [task.yaml]\n');
    await expect(
      runTestProject({ cwd: root, projectRoot: file }),
    ).rejects.toThrow('Only midscene.config.ts is supported');
  });

  it.each([
    ['--no-web.wait-for-network-idle', 'web', 'waitForNetworkIdle'],
    ['--no-ios.auto-dismiss-keyboard', 'ios', 'autoDismissKeyboard'],
    ['--no-harmony.auto-dismiss-keyboard', 'harmony', 'autoDismissKeyboard'],
  ])(
    'keeps the positional file after %s and maps its field to false',
    (option, target, field) => {
      const parsed = parseTestCliArgs([option, 'task.yaml'], root);
      expect(parsed.projectRoot).toBe(join(root, 'task.yaml'));
      expect(parsed.legacyOptions).toMatchObject({
        [target]: { [field]: false },
      });
    },
  );

  it.each([
    ['--help'],
    ['-h'],
    ['nodes', '--help'],
    ['missing.yaml', '--help'],
  ])(
    'prints help without discovering or executing inputs: %j',
    async (...args) => {
      const io = { log: vi.fn(), error: vi.fn() };
      expect(await runTestCli(args, io)).toBe(0);
      expect(io.log).toHaveBeenCalledWith(
        expect.stringContaining('midscene-test nodes'),
      );
      expect(io.log).toHaveBeenCalledWith(
        expect.stringContaining('--no-<target>.<field>'),
      );
      expect(io.error).not.toHaveBeenCalled();
    },
  );

  it('prints the package version and succeeds without an input path', async () => {
    const io = { log: vi.fn(), error: vi.fn() };
    expect(await runTestCli(['--version'], io)).toBe(0);
    expect(io.log).toHaveBeenCalledExactlyOnceWith(version);
    expect(io.error).not.toHaveBeenCalled();
  });
});
