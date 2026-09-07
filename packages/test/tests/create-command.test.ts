import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { input, select } from '@inquirer/prompts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type CreateServices,
  parseCreateArgs,
  runCreateCommand,
} from '../src/cli/create-command';
import { parseNodePackageSpec } from '../src/cli/create-template';
import { renderNodeReference } from '../src/cli/node-reference';
import { parseTestCliArgs, runTestCli } from '../src/cli/test-command';

vi.mock('@inquirer/prompts', () => ({ input: vi.fn(), select: vi.fn() }));

const temporaryDirectories: string[] = [];
const temp = () => {
  const path = mkdtempSync(join(tmpdir(), 'midscene-create-'));
  temporaryDirectories.push(path);
  return path;
};
const io = () => ({ log: vi.fn(), error: vi.fn() });
const reference = renderNodeReference([]).markdown;
const services = (cwd: string): CreateServices => ({
  cwd,
  interactive: false,
  promptDirectory: vi.fn(async () => {
    throw new Error('Unexpected prompt');
  }),
  selectPlatform: vi.fn(async () => {
    throw new Error('Unexpected platform prompt');
  }),
  runPnpm: vi.fn(async () => reference),
});

afterEach(() => {
  vi.resetAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('create arguments', () => {
  it.each(['web', 'android', 'ios', 'harmony', 'computer'])(
    'accepts the documented %s platform',
    (platform) => {
      expect(
        parseCreateArgs(['my-tests', '--platform', platform]).platform,
      ).toBe(platform);
    },
  );
  it('keeps directory arguments distinct from repeatable package options', () => {
    expect(
      parseCreateArgs(['--with', 'team-nodes', '123', '--platform', 'web']),
    ).toMatchObject({
      directory: '123',
      packages: [{ name: 'team-nodes', version: 'latest' }],
    });
  });
  it('parses a directory, platform, and repeatable versioned packages', () => {
    expect(
      parseCreateArgs([
        'my tests',
        '--platform=web',
        '--with',
        '@acme/nodes@^1.2.0',
        '--with',
        'other-nodes',
        '-y',
      ]),
    ).toEqual({
      directory: 'my tests',
      platform: 'web',
      packages: [
        { name: '@acme/nodes', version: '^1.2.0' },
        { name: 'other-nodes', version: 'latest' },
      ],
      yes: true,
      help: false,
    });
    expect(parseNodePackageSpec('nodes@beta')).toEqual({
      name: 'nodes',
      version: 'beta',
    });
  });

  it.each([
    ['a', 'b'],
    ['--platform', 'unsupported'],
    ['--platform'],
    ['--with'],
    ['--with', 'nodes@1', '--with', 'nodes@2'],
    ['--config', 'file.ts'],
    [''],
  ])('rejects invalid arguments %j', (...args) => {
    expect(() => parseCreateArgs(args)).toThrow();
  });

  it.each([
    './nodes',
    'https://example.com/nodes',
    '@scope',
    'name@',
    'name;command',
    'name@file:../nodes',
    '@scope/name/subpath',
    '__proto__',
  ])('rejects unsupported package spec %s', (spec) => {
    expect(() => parseNodePackageSpec(spec)).toThrow('Invalid Node package');
  });

  it('keeps --with unavailable for running tests and describing nodes', () => {
    expect(() => parseTestCliArgs(['--with', 'nodes'])).toThrow(
      'Unknown option',
    );
    expect(() =>
      parseTestCliArgs(['describe-nodes', '--with', 'nodes']),
    ).toThrow('Unknown option');
  });

  it('dispatches create help without creating or installing anything', async () => {
    const output = io();
    expect(await runTestCli(['create', '--help'], output)).toBe(0);
    expect(output.log).toHaveBeenCalledWith(
      expect.stringContaining('--platform'),
    );
    expect(output.error).not.toHaveBeenCalled();
  });
});

describe('create project', () => {
  it('uses Inquirer input and selection prompts for missing choices', async () => {
    const cwd = temp();
    vi.mocked(input).mockResolvedValue('library-tests');
    vi.mocked(select).mockResolvedValue('ios');
    await runCreateCommand([], io(), {
      cwd,
      interactive: true,
      runPnpm: vi.fn(async () => reference),
    });
    expect(input).toHaveBeenCalledWith(
      expect.objectContaining({ default: 'my-tests' }),
    );
    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({
        choices: [
          { name: 'Web (Playwright)', value: 'web' },
          { name: 'Android', value: 'android' },
          { name: 'iOS', value: 'ios' },
          { name: 'HarmonyOS', value: 'harmony' },
          { name: 'Desktop (Computer)', value: 'computer' },
        ],
      }),
    );
    expect(
      readFileSync(join(cwd, 'library-tests', 'midscene.config.ts'), 'utf8'),
    ).toContain('agentClass: IOSAgent');
  });

  it.each(['ExitPromptError', 'AbortPromptError'])(
    'handles Inquirer cancellation (%s) before writing files',
    async (name) => {
      const cwd = temp();
      const error = new Error('Prompt cancelled');
      error.name = name;
      vi.mocked(select).mockRejectedValue(error);
      const runPnpm = vi.fn(async () => reference);
      await expect(
        runCreateCommand(['.'], io(), { cwd, interactive: true, runPnpm }),
      ).rejects.toThrow('Project creation cancelled.');
      expect(readdirSync(cwd)).toEqual([]);
      expect(runPnpm).not.toHaveBeenCalled();
    },
  );

  it('installs before describing, writes the reference, and persists package imports', async () => {
    const cwd = temp();
    const runtime = services(cwd);
    await runCreateCommand(
      ['my tests', '--platform', 'web', '--with', '@acme/nodes@1.2.0'],
      io(),
      runtime,
    );
    const root = join(cwd, 'my tests');
    expect(runtime.promptDirectory).not.toHaveBeenCalled();
    expect(runtime.runPnpm).toHaveBeenNthCalledWith(
      1,
      ['install', '--ignore-workspace'],
      root,
    );
    expect(runtime.runPnpm).toHaveBeenNthCalledWith(
      2,
      ['exec', 'midscene-test', 'describe-nodes'],
      root,
      true,
    );
    expect(readFileSync(join(root, 'midscene-nodes.md'), 'utf8')).toBe(
      reference,
    );
    const manifest = JSON.parse(
      readFileSync(join(root, 'package.json'), 'utf8'),
    );
    expect(manifest.name).toBe('my-tests');
    expect(manifest.devDependencies['@acme/nodes']).toBe('1.2.0');
    expect(manifest.devDependencies['@midscene/test']).toBe(
      manifest.devDependencies['@midscene/web'],
    );
    expect(manifest.devDependencies['@midscene/android']).toBeUndefined();
    const config = readFileSync(join(root, 'midscene.config.ts'), 'utf8');
    expect(config).toContain('from "@acme/nodes"');
    expect(config).not.toContain('@acme/nodes@1.2.0');
    expect(existsSync(join(root, '.env'))).toBe(false);
  });

  it('prompts for a directory and selects a platform', async () => {
    const cwd = temp();
    const runtime = services(cwd);
    runtime.interactive = true;
    runtime.promptDirectory = vi.fn().mockResolvedValue('interactive-tests');
    runtime.selectPlatform = vi.fn().mockResolvedValue('android');
    await runCreateCommand([], io(), runtime);
    expect(runtime.promptDirectory).toHaveBeenCalledTimes(1);
    expect(runtime.selectPlatform).toHaveBeenCalledTimes(1);
    expect(
      readFileSync(
        join(cwd, 'interactive-tests', 'midscene.config.ts'),
        'utf8',
      ),
    ).toContain('agentClass: AndroidAgent');
  });

  it('prompts only for platform when the directory is provided', async () => {
    const cwd = temp();
    const runtime = services(cwd);
    runtime.interactive = true;
    runtime.selectPlatform = vi.fn().mockResolvedValue('ios');
    await runCreateCommand(['.'], io(), runtime);
    expect(runtime.promptDirectory).not.toHaveBeenCalled();
    expect(runtime.selectPlatform).toHaveBeenCalledTimes(1);
    expect(existsSync(join(cwd, 'midscene.config.ts'))).toBe(true);
  });

  it.each([[], ['tests'], ['--platform', 'web'], ['tests', '--yes']])(
    'rejects missing noninteractive choices without writing files %j',
    async (...args) => {
      const cwd = temp();
      const runtime = services(cwd);
      await expect(runCreateCommand(args, io(), runtime)).rejects.toThrow(
        'required without prompts',
      );
      expect(readdirSync(cwd)).toEqual([]);
      expect(runtime.runPnpm).not.toHaveBeenCalled();
    },
  );

  it('does not install or write files when a prompt is cancelled', async () => {
    const cwd = temp();
    const runtime = services(cwd);
    runtime.interactive = true;
    runtime.promptDirectory = vi
      .fn()
      .mockRejectedValue(new Error('Project creation cancelled.'));
    await expect(runCreateCommand([], io(), runtime)).rejects.toThrow(
      'cancelled',
    );
    expect(readdirSync(cwd)).toEqual([]);
  });

  it.each([
    'package.json',
    'midscene.config.ts',
    'midscene-nodes.md',
    'pnpm-lock.yaml',
    '.gitignore',
    'cases/example.yaml',
  ])('checks every conflict before writing any files: %s', async (filename) => {
    const cwd = temp();
    mkdirSync(join(cwd, 'cases'));
    writeFileSync(join(cwd, filename), 'keep me');
    const before = readdirSync(cwd);
    await expect(
      runCreateCommand(['.', '--platform', 'web', '-y'], io(), services(cwd)),
    ).rejects.toThrow('Cannot create project');
    expect(readFileSync(join(cwd, filename), 'utf8')).toBe('keep me');
    expect(readdirSync(cwd)).toEqual(before);
  });

  it('rejects dangling destination symlinks', async () => {
    const cwd = temp();
    symlinkSync(join(cwd, 'missing'), join(cwd, 'package.json'));
    await expect(
      runCreateCommand(['.', '--platform', 'web'], io(), services(cwd)),
    ).rejects.toThrow('Cannot create project');
    expect(readdirSync(cwd)).toEqual(['package.json']);
  });

  it('rejects extension packages that replace generated dependencies', async () => {
    const cwd = temp();
    await expect(
      runCreateCommand(
        ['.', '--platform', 'web', '--with', '@midscene/test'],
        io(),
        services(cwd),
      ),
    ).rejects.toThrow('conflicts with a generated project dependency');
    expect(readdirSync(cwd)).toEqual([]);
  });

  it('preserves files and explains recovery after installation fails', async () => {
    const cwd = temp();
    const runtime = services(cwd);
    runtime.runPnpm = vi
      .fn()
      .mockRejectedValue(new Error('registry unavailable'));
    await expect(
      runCreateCommand(['.', '--platform', 'web'], io(), runtime),
    ).rejects.toThrow(
      'pnpm install --ignore-workspace, then pnpm run describe-nodes',
    );
    expect(runtime.runPnpm).toHaveBeenCalledTimes(1);
    expect(existsSync(join(cwd, 'package.json'))).toBe(true);
    expect(existsSync(join(cwd, 'midscene-nodes.md'))).toBe(false);
  });

  it.each(['', 'partial output'])(
    'does not save invalid reference output %j',
    async (output) => {
      const cwd = temp();
      const runtime = services(cwd);
      runtime.runPnpm = vi.fn().mockResolvedValue(output);
      await expect(
        runCreateCommand(['.', '--platform', 'web'], io(), runtime),
      ).rejects.toThrow('Node reference generation failed');
      expect(existsSync(join(cwd, 'midscene-nodes.md'))).toBe(false);
    },
  );
});
