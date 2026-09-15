import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLegacyTestRunPlan } from '../src/cli/legacy-command';
import {
  parseTestCliArgsWithYaml as parseTestCliArgs,
  runTestCli,
} from '../src/cli/test-command';
import { runTestProjectWithYamlCompatibility as runTestProject } from '../src/cli/test-project-runner';
import {
  createLegacyConfigFactory,
  matchLegacyYamlFiles,
} from '../src/runtime/legacy-config';

vi.mock('../src/cli/test-project-runner', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  runTestProjectWithYamlCompatibility: vi.fn(),
}));

let root: string;
const write = (name: string, content = 'tasks: []\n') => {
  const file = join(root, name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  return file;
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'legacy-command-'));
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

describe('legacy YAML command compatibility', () => {
  it('parses old flags, booleans, nested platform overrides and file lists', () => {
    const parsed = parseTestCliArgs(
      [
        '--files',
        'b.yaml',
        'a.yaml',
        'b.yaml',
        '--setup',
        'login.yaml',
        '--retry',
        '2',
        '--concurrent=3',
        '--continue-on-error=false',
        '--headed',
        '--keep-window',
        '--share-browser-context',
        '--dotenv-override',
        '--dotenv-debug',
        '--summary',
        'custom.json',
        '--web.user-agent',
        'custom',
        '--web.viewportWidth',
        '900',
        '--harmony.auto-dismiss-keyboard',
        'false',
      ],
      root,
    );
    expect(parsed.legacyOptions).toMatchObject({
      files: ['b.yaml', 'a.yaml', 'b.yaml'],
      setup: 'login.yaml',
      retry: 2,
      concurrent: 3,
      continueOnError: false,
      headed: true,
      keepWindow: true,
      shareBrowserContext: true,
      dotenvOverride: true,
      dotenvDebug: true,
      summary: 'custom.json',
      web: { userAgent: 'custom', viewportWidth: 900 },
      harmony: { autoDismissKeyboard: false },
    });
    expect(
      parseTestCliArgs(['--no-headed', '--no-continue-on-error'], root)
        .legacyOptions,
    ).toMatchObject({ headed: false, continueOnError: false });
    expect(
      parseTestCliArgs(
        ['--files=a.yaml', 'b.yaml', '--config=batch.yaml'],
        root,
      ),
    ).toMatchObject({
      configPath: 'batch.yaml',
      legacyOptions: { files: ['a.yaml', 'b.yaml'] },
    });
  });

  it('keeps native CLI parsing and rejects unrelated scheduling flags', () => {
    expect(parseTestCliArgs(['project', '--project', 'web'], root)).toEqual({
      cwd: root,
      projectRoot: join(root, 'project'),
      configPath: undefined,
      resultDir: undefined,
      projectNames: ['web'],
    });
    expect(() => parseTestCliArgs(['--bail', '1'], root)).toThrow(
      'Unknown option: --bail',
    );
    expect(() => parseTestCliArgs(['--retry'], root)).toThrow(
      '--retry requires a value.',
    );
    expect(() => parseTestCliArgs(['nodes', '--headed'], root)).toThrow(
      'not supported by nodes',
    );
  });

  it('maps a batch YAML config without losing file order, duplicates or target precedence', async () => {
    const a = write('suite/a.yaml');
    const b = write('suite/b.yaml');
    const setup = write('suite/login.yaml');
    write(
      'suite/batch.yaml',
      `
files: [b.yaml, a.yaml, b.yaml]
setup: login.yaml
concurrent: 2
retry: 1
continueOnError: false
summary: previous-summary.json
shareBrowserContext: true
headed: false
keepWindow: false
dotenvOverride: false
dotenvDebug: false
web:
  url: https://example.test
  userAgent: original
  viewportWidth: 800
`,
    );
    const options = parseTestCliArgs(
      [
        '--config',
        'suite/batch.yaml',
        '--retry',
        '3',
        '--keep-window',
        '--web.user-agent',
        'replacement',
      ],
      root,
    );
    const plan = await createLegacyTestRunPlan(options);
    expect(plan).toMatchObject({
      files: [b, a, b],
      setup,
      concurrent: 2,
      retry: 3,
      bail: 1,
      continueOnError: false,
      summary: 'previous-summary.json',
      shareBrowserContext: true,
      headed: true,
      keepWindow: true,
      globalConfig: {
        web: {
          url: 'https://example.test',
          userAgent: 'replacement',
          viewportWidth: 800,
        },
      },
    });
  });

  it('resolves directory patterns against their config directory and keeps hidden YAML opt-in', async () => {
    const file = write('suite/cases/a.yaml');
    const hidden = write('suite/cases/.github/workflows/ci.yml', 'jobs: {}');
    write('suite/batch.yaml', 'files: [cases]\n');
    const plan = await createLegacyTestRunPlan({
      cwd: root,
      configPath: 'suite/batch.yaml',
    });
    expect(plan?.files).toEqual([file]);
    expect(
      await matchLegacyYamlFiles('cases/.github/**/*.yml', {
        cwd: join(root, 'suite'),
      }),
    ).toEqual([hidden]);
  });

  it('accepts quoted globs and explicit repeated --files invocations', async () => {
    const a = write('a.yaml');
    const b = write('b.yaml');
    const glob = await createLegacyTestRunPlan(
      parseTestCliArgs(['*.yaml'], root),
    );
    expect(glob?.files).toEqual([a, b]);
    expect(glob?.bail).toBe(1);
    const ordered = await createLegacyTestRunPlan(
      parseTestCliArgs(
        ['--files', 'b.yaml', 'a.yaml', 'b.yaml', '--continue-on-error'],
        root,
      ),
    );
    expect(ordered?.files).toEqual([b, a, b]);
    expect(ordered?.bail).toBe(0);
  });

  it('does not turn a native file, directory or TypeScript config into a legacy plan', async () => {
    const native = write('native.yaml', 'cases: []\n');
    for (const args of [[native], [root], ['--config', 'midscene.config.ts']])
      expect(
        await createLegacyTestRunPlan(parseTestCliArgs(args, root)),
      ).toBeUndefined();
    await expect(
      createLegacyTestRunPlan(
        parseTestCliArgs(
          ['--config', 'midscene.config.ts', '--retry', '1'],
          root,
        ),
      ),
    ).rejects.toThrow('cannot be combined');
  });

  it('does not silently discard an implicitly discovered native config when old flags are supplied', async () => {
    write('midscene.config.ts', 'export default { nodes: [] };');
    write('legacy.yaml');
    await expect(
      createLegacyTestRunPlan(
        parseTestCliArgs(['legacy.yaml', '--retry', '1'], root),
      ),
    ).rejects.toThrow('cannot be combined');
  });

  it('loads .env before interpolation and honors the old override switch', async () => {
    vi.stubEnv('MIDSCENE_LEGACY_COMMAND_TEST_VALUE', 'shell');
    write('.env', 'MIDSCENE_LEGACY_COMMAND_TEST_VALUE=dotenv\n');
    write('a.yaml');
    write(
      'batch.yaml',
      'files: [a.yaml]\nweb: {url: "${MIDSCENE_LEGACY_COMMAND_TEST_VALUE}"}\n',
    );
    const normal = await createLegacyTestRunPlan({
      cwd: root,
      configPath: 'batch.yaml',
    });
    expect(normal?.globalConfig?.web?.url).toBe('shell');
    const override = await createLegacyTestRunPlan(
      parseTestCliArgs(['--config', 'batch.yaml', '--dotenv-override'], root),
    );
    expect(override?.globalConfig?.web?.url).toBe('dotenv');
  });

  it('rejects an invalid setup selection instead of executing it twice', async () => {
    write('a.yaml');
    await expect(
      createLegacyTestRunPlan(
        parseTestCliArgs(['--files', 'a.yaml', '--setup', 'a.yaml'], root),
      ),
    ).rejects.toThrow('must not also appear in files');
    await expect(
      createLegacyTestRunPlan(
        parseTestCliArgs(
          ['--files', 'a.yaml', '--setup', 'missing.yaml'],
          root,
        ),
      ),
    ).rejects.toThrow('No YAML file found matching "setup"');
  });

  it.each([
    ['--retry', '-1'],
    ['--retry', '0.5'],
    ['--concurrent', '0'],
  ])('rejects invalid scheduling input %s %s', async (option, value) => {
    write('a.yaml');
    await expect(
      createLegacyTestRunPlan(
        parseTestCliArgs(['--files', 'a.yaml', option, value], root),
      ),
    ).rejects.toThrow(/must be a .*integer/);
  });

  it('propagates file expansion failures instead of silently omitting requested work', async () => {
    const factory = createLegacyConfigFactory(async () => {
      throw new Error('cannot read directory');
    });
    await expect(factory.createFilesConfig(['bad'], {}, root)).rejects.toThrow(
      'cannot read directory',
    );
  });

  it('forwards the compatibility plan to the existing Test runner', async () => {
    const file = write('a.yaml');
    const config = write('batch.yaml', 'files: [a.yaml]\nretry: 2\n');
    vi.mocked(runTestProject).mockResolvedValue({
      schemaVersion: 3,
      runId: 'run-1',
      startedAt: '2026-09-14T00:00:00.000Z',
      endedAt: '2026-09-14T00:00:00.000Z',
      durationMs: 0,
      status: 'success',
      collectionErrors: [],
      cases: [],
      documents: [],
      projects: [],
      summary: {
        passed: 0,
        total: 0,
        failed: 0,
        notRun: 0,
        filtered: 0,
        collectionErrors: 0,
        documentFailures: 0,
        projectFailures: 0,
      },
      resultDir: join(root, 'results'),
      summaryPath: join(root, 'summary.json'),
      reportDir: join(root, 'reports'),
      exitCode: 0,
    });
    const io = { log: vi.fn(), error: vi.fn() };
    expect(await runTestCli(['--config', config], io)).toBe(0);
    expect(runTestProject).toHaveBeenCalledWith(
      expect.objectContaining({
        configPath: undefined,
      }),
      expect.objectContaining({
        plan: expect.objectContaining({
          files: [resolve(file)],
          retry: 2,
          bail: 1,
        }),
      }),
    );
    expect(io.error).not.toHaveBeenCalled();
  });
});
