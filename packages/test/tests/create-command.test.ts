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
import { confirm, input, select } from '@inquirer/prompts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type CreateServices,
  parseCreateArgs,
  runCreateCommand,
} from '../src/cli/create-command';
import { renderNodeReference } from '../src/cli/node-reference';
import { parseTestCliArgs, runTestCli } from '../src/cli/test-command';

vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
  select: vi.fn(),
  confirm: vi.fn(),
}));

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
  confirmInstall: vi.fn(async () => true),
  userAgent: 'pnpm/9.15.0 npm/? node/v22.19.0',
  selectPackageManager: vi.fn(async (defaultValue) => defaultValue),
  promptDirectory: vi.fn(async () => {
    throw new Error('Unexpected prompt');
  }),
  selectPlatform: vi.fn(async () => {
    throw new Error('Unexpected platform prompt');
  }),
  runPackageManager: vi.fn(async (_manager, args, root) => {
    if (args[0] !== 'install') {
      writeFileSync(join(root, 'midscene-node-reference.md'), reference);
    }
    return '';
  }),
});

afterEach(() => {
  vi.resetAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('create arguments', () => {
  it('accepts --skip-install together with --yes', () => {
    expect(
      parseCreateArgs(['.', '--platform', 'web', '--skip-install', '--yes']),
    ).toMatchObject({ skipInstall: true, yes: true });
  });
  it.each(['npm', 'pnpm'])('accepts --package-manager %s', (packageManager) => {
    expect(
      parseCreateArgs([
        '.',
        '--platform',
        'web',
        '--package-manager',
        packageManager,
      ]).packageManager,
    ).toBe(packageManager);
  });
  it.each(['web', 'android', 'ios', 'harmony', 'computer'])(
    'accepts the documented %s platform',
    (platform) => {
      expect(
        parseCreateArgs(['my-tests', '--platform', platform]).platform,
      ).toBe(platform);
    },
  );

  it.each([
    ['a', 'b'],
    ['--platform', 'unsupported'],
    ['--platform'],
    ['--package-manager'],
    ['--package-manager', 'yarn'],
    ['--with', 'nodes'],
    ['--config', 'file.ts'],
    [''],
  ])('rejects invalid arguments %j', (...args) => {
    expect(() => parseCreateArgs(args)).toThrow();
  });

  it('keeps --with unavailable for all commands', () => {
    expect(() => parseCreateArgs(['--with', 'nodes'])).toThrow(
      'Unknown argument',
    );
    expect(() => parseTestCliArgs(['--with', 'nodes'])).toThrow(
      'Unknown option',
    );
    expect(() => parseTestCliArgs(['nodes', '--with', 'nodes'])).toThrow(
      'Unknown option',
    );
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

describe('create installation confirmation and postinstall', () => {
  it.each(['npm', 'pnpm'] as const)(
    'can decline %s installation after creating files',
    async (packageManager) => {
      const cwd = temp();
      const runtime = services(cwd);
      runtime.interactive = true;
      runtime.confirmInstall = vi.fn(async () => {
        expect(existsSync(join(cwd, 'midscene.config.ts'))).toBe(true);
        return false;
      });
      const output = io();
      await runCreateCommand(
        ['.', '--platform', 'web', '--package-manager', packageManager],
        output,
        runtime,
      );
      expect(runtime.confirmInstall).toHaveBeenCalledTimes(1);
      expect(runtime.runPackageManager).not.toHaveBeenCalled();
      expect(existsSync(join(cwd, 'midscene-node-reference.md'))).toBe(false);
      const manifest = JSON.parse(
        readFileSync(join(cwd, 'package.json'), 'utf8'),
      );
      expect(manifest.scripts.postinstall).toBe('midscene-test nodes');
      expect(manifest.scripts.nodes).toBe(manifest.scripts.postinstall);
      expect(output.log).toHaveBeenLastCalledWith(
        expect.stringContaining(`Next: run ${packageManager} install`),
      );
      expect(output.log.mock.calls.flat().join('\n')).not.toContain(
        'Project ready:',
      );
    },
  );

  it.each([false, true])(
    'skips installation without prompting when --skip-install is set (interactive: %s)',
    async (interactive) => {
      for (const yes of [false, true]) {
        const cwd = temp();
        const runtime = services(cwd);
        runtime.interactive = interactive;
        await runCreateCommand(
          [
            '.',
            '--platform',
            'web',
            '--package-manager',
            'pnpm',
            '--skip-install',
            ...(yes ? ['--yes'] : []),
          ],
          io(),
          runtime,
        );
        expect(runtime.confirmInstall).not.toHaveBeenCalled();
        expect(runtime.runPackageManager).not.toHaveBeenCalled();
        expect(existsSync(join(cwd, 'package.json'))).toBe(true);
        expect(existsSync(join(cwd, 'midscene-node-reference.md'))).toBe(false);
      }
    },
  );

  it.each([false, true])(
    'installs without prompting in noninteractive mode or with --yes (interactive: %s)',
    async (interactive) => {
      const cwd = temp();
      const runtime = services(cwd);
      runtime.interactive = interactive;
      await runCreateCommand(
        ['.', '--platform', 'web', ...(interactive ? ['--yes'] : [])],
        io(),
        runtime,
      );
      expect(runtime.confirmInstall).not.toHaveBeenCalled();
      expect(runtime.runPackageManager).toHaveBeenCalled();
    },
  );

  it.each(['ExitPromptError', 'AbortPromptError'])(
    'preserves project files when the last prompt is cancelled (%s)',
    async (name) => {
      const cwd = temp();
      const runtime = services(cwd);
      runtime.interactive = true;
      const error = new Error('Cancelled');
      error.name = name;
      runtime.confirmInstall = vi.fn().mockRejectedValue(error);
      await expect(
        runCreateCommand(['.', '--platform', 'web'], io(), runtime),
      ).rejects.toThrow('Project files are preserved');
      expect(existsSync(join(cwd, 'package.json'))).toBe(true);
      expect(runtime.runPackageManager).not.toHaveBeenCalled();
    },
  );

  it('uses the reference written by postinstall without generating twice', async () => {
    const cwd = temp();
    const runtime = services(cwd);
    runtime.interactive = true;
    runtime.runPackageManager = vi.fn(async () => {
      writeFileSync(join(cwd, 'midscene-node-reference.md'), reference);
      return '';
    });
    const output = io();
    await runCreateCommand(['.', '--platform', 'web'], output, runtime);
    expect(runtime.confirmInstall).toHaveBeenCalledTimes(1);
    expect(runtime.runPackageManager).toHaveBeenCalledTimes(1);
    expect(readFileSync(join(cwd, 'midscene-node-reference.md'), 'utf8')).toBe(
      reference,
    );
    expect(output.log).not.toHaveBeenCalledWith('Generating Node reference...');
    expect(output.log).toHaveBeenLastCalledWith(
      expect.stringContaining('Project ready:'),
    );
  });

  it('falls back to explicit generation when lifecycle scripts did not run', async () => {
    const cwd = temp();
    const runtime = services(cwd);
    await runCreateCommand(['.', '--platform', 'web'], io(), runtime);
    expect(runtime.runPackageManager).toHaveBeenCalledTimes(2);
    expect(readFileSync(join(cwd, 'midscene-node-reference.md'), 'utf8')).toBe(
      reference,
    );
  });

  it('rejects invalid output left by postinstall', async () => {
    const cwd = temp();
    const runtime = services(cwd);
    runtime.runPackageManager = vi.fn(async () => {
      writeFileSync(join(cwd, 'midscene-node-reference.md'), 'invalid output');
      return '';
    });
    await expect(
      runCreateCommand(['.', '--platform', 'web'], io(), runtime),
    ).rejects.toThrow('Node reference generation failed');
    expect(runtime.runPackageManager).toHaveBeenCalledTimes(1);
    expect(readFileSync(join(cwd, 'midscene-node-reference.md'), 'utf8')).toBe(
      'invalid output',
    );
  });
});

describe('create project', () => {
  it('uses Inquirer input and selection prompts for missing choices', async () => {
    const cwd = temp();
    vi.mocked(input).mockResolvedValue('library-tests');
    vi.mocked(confirm).mockResolvedValue(true);
    vi.mocked(select)
      .mockResolvedValueOnce('ios')
      .mockResolvedValueOnce('pnpm');
    await runCreateCommand([], io(), {
      cwd,
      interactive: true,
      userAgent: 'pnpm/9.15.0',
      runPackageManager: services(cwd).runPackageManager,
    });
    expect(confirm).toHaveBeenCalledWith({
      message:
        'Install dependencies and generate midscene-node-reference.md now?',
      default: true,
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
    expect(select).toHaveBeenNthCalledWith(2, {
      message: 'Select a package manager:',
      choices: [
        { name: 'npm', value: 'npm' },
        { name: 'pnpm', value: 'pnpm' },
      ],
      default: 'pnpm',
    });
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
      const runPackageManager = vi.fn(async () => reference);
      await expect(
        runCreateCommand(['.'], io(), {
          cwd,
          interactive: true,
          runPackageManager,
        }),
      ).rejects.toThrow('Project creation cancelled.');
      expect(readdirSync(cwd)).toEqual([]);
      expect(runPackageManager).not.toHaveBeenCalled();
    },
  );

  it('installs before describing and writes the generated project', async () => {
    const cwd = temp();
    const runtime = services(cwd);
    await runCreateCommand(['my tests', '--platform', 'web'], io(), runtime);
    const root = join(cwd, 'my tests');
    expect(runtime.promptDirectory).not.toHaveBeenCalled();
    expect(runtime.runPackageManager).toHaveBeenNthCalledWith(
      1,
      'pnpm',
      ['install', '--ignore-workspace'],
      root,
    );
    expect(runtime.runPackageManager).toHaveBeenNthCalledWith(
      2,
      'pnpm',
      ['exec', 'midscene-test', 'nodes'],
      root,
    );
    expect(readFileSync(join(root, 'midscene-node-reference.md'), 'utf8')).toBe(
      reference,
    );
    const manifest = JSON.parse(
      readFileSync(join(root, 'package.json'), 'utf8'),
    );
    expect(manifest.name).toBe('my-tests');
    expect(manifest.devDependencies['@midscene/test']).toBe(
      manifest.devDependencies['@midscene/web'],
    );
    expect(manifest.devDependencies['@midscene/android']).toBeUndefined();
    expect(manifest.devDependencies['@playwright/test']).toBeUndefined();
    const config = readFileSync(join(root, 'midscene.config.ts'), 'utf8');
    expect(config).toContain("from '@midscene/web/playwright/agent'");
    expect(config).toContain("from '@midscene/web/playwright/test'");
    expect(config).not.toContain('@midscene/test/playwright');
    expect(existsSync(join(root, '.env'))).toBe(false);
    expect(existsSync(join(root, 'README.md'))).toBe(true);
    expect(existsSync(join(root, 'README.zh.md'))).toBe(false);
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
    await runCreateCommand(['.', '--package-manager', 'pnpm'], io(), runtime);
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
      expect(runtime.runPackageManager).not.toHaveBeenCalled();
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
    'midscene-node-reference.md',
    'pnpm-lock.yaml',
    'package-lock.json',
    'npm-shrinkwrap.json',
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

  it('preserves files and explains recovery after installation fails', async () => {
    const cwd = temp();
    const runtime = services(cwd);
    runtime.runPackageManager = vi
      .fn()
      .mockRejectedValue(new Error('registry unavailable'));
    await expect(
      runCreateCommand(['.', '--platform', 'web'], io(), runtime),
    ).rejects.toThrow('pnpm install --ignore-workspace, then pnpm run nodes');
    expect(runtime.runPackageManager).toHaveBeenCalledTimes(1);
    expect(existsSync(join(cwd, 'package.json'))).toBe(true);
    expect(existsSync(join(cwd, 'midscene-node-reference.md'))).toBe(false);
  });

  it.each(['', 'partial output'])(
    'fails when the command returns %j without generating a reference',
    async (output) => {
      const cwd = temp();
      const runtime = services(cwd);
      runtime.runPackageManager = vi.fn().mockResolvedValue(output);
      await expect(
        runCreateCommand(['.', '--platform', 'web'], io(), runtime),
      ).rejects.toThrow('Node reference generation failed');
      expect(existsSync(join(cwd, 'midscene-node-reference.md'))).toBe(false);
    },
  );
});

describe('create package manager selection', () => {
  it.each(['npm', 'pnpm'] as const)(
    'uses explicit %s for installation, reference generation, and instructions',
    async (packageManager) => {
      const cwd = temp();
      const runtime = services(cwd);
      runtime.interactive = true;
      runtime.userAgent =
        packageManager === 'npm' ? 'pnpm/9.15.0' : 'npm/10.0.0';
      const output = io();
      await runCreateCommand(
        ['.', '--platform', 'web', '--package-manager', packageManager],
        output,
        runtime,
      );
      expect(runtime.selectPackageManager).not.toHaveBeenCalled();
      const install =
        packageManager === 'npm'
          ? ['install', '--workspaces=false']
          : ['install', '--ignore-workspace'];
      const describe =
        packageManager === 'npm'
          ? [
              'exec',
              '--no',
              '--workspaces=false',
              '--',
              'midscene-test',
              'nodes',
            ]
          : ['exec', 'midscene-test', 'nodes'];
      expect(runtime.runPackageManager).toHaveBeenNthCalledWith(
        1,
        packageManager,
        install,
        cwd,
      );
      expect(runtime.runPackageManager).toHaveBeenNthCalledWith(
        2,
        packageManager,
        describe,
        cwd,
      );
      const readme = readFileSync(join(cwd, 'README.md'), 'utf8');
      const chromium =
        packageManager === 'npm'
          ? 'npm exec -- playwright install chromium'
          : 'pnpm exec playwright install chromium';
      expect(readme).toContain(chromium);
      expect(readme).toContain(`${packageManager} test`);
      expect(readme).toContain('A Midscene Test project for web.');
      expect(readme).toContain(`${packageManager} run nodes`);
      expect(output.log).toHaveBeenCalledWith(
        `Installing dependencies with ${packageManager}...`,
      );
      expect(output.log).toHaveBeenLastCalledWith(
        expect.stringContaining(`Install Chromium: ${chromium}`),
      );
      expect(output.log).toHaveBeenLastCalledWith(
        expect.stringContaining(`${packageManager} test`),
      );
    },
  );

  it.each([
    ['pnpm/9.15.0 npm/? node/v22.19.0', 'pnpm'],
    ['npm/10.9.0 node/v22.19.0', 'npm'],
    [undefined, 'npm'],
    ['', 'npm'],
    ['yarn/1.22.0 npm/? node/v22.19.0', 'npm'],
    ['unknown pnpm/9.15.0', 'npm'],
  ] as const)(
    'detects %s as %s without prompts',
    async (userAgent, expected) => {
      for (const interactive of [false, true]) {
        const cwd = temp();
        const runtime = services(cwd);
        runtime.userAgent = userAgent;
        runtime.interactive = interactive;
        await runCreateCommand(
          ['.', '--platform', 'web', ...(interactive ? ['--yes'] : [])],
          io(),
          runtime,
        );
        expect(runtime.selectPackageManager).not.toHaveBeenCalled();
        expect(runtime.runPackageManager).toHaveBeenCalledWith(
          expected,
          expect.any(Array),
          cwd,
        );
      }
    },
  );

  it.each(['npm', 'pnpm'] as const)(
    'allows the interactive choice to override detected %s',
    async (detected) => {
      const cwd = temp();
      const runtime = services(cwd);
      runtime.interactive = true;
      runtime.userAgent = `${detected}/10.0.0`;
      const selected = detected === 'npm' ? 'pnpm' : 'npm';
      runtime.selectPackageManager = vi.fn().mockResolvedValue(selected);
      await runCreateCommand(['.', '--platform', 'web'], io(), runtime);
      expect(runtime.selectPackageManager).toHaveBeenCalledWith(detected);
      expect(runtime.runPackageManager).toHaveBeenCalledWith(
        selected,
        expect.any(Array),
        cwd,
      );
    },
  );

  it('cancels package manager selection before writing files or installing', async () => {
    const cwd = temp();
    const runtime = services(cwd);
    runtime.interactive = true;
    const error = new Error('Cancelled');
    error.name = 'ExitPromptError';
    runtime.selectPackageManager = vi.fn().mockRejectedValue(error);
    await expect(
      runCreateCommand(['.', '--platform', 'web'], io(), runtime),
    ).rejects.toThrow('Project creation cancelled.');
    expect(readdirSync(cwd)).toEqual([]);
    expect(runtime.runPackageManager).not.toHaveBeenCalled();
  });

  it.each(['npm', 'pnpm'] as const)(
    'preserves existing lockfiles when selecting %s',
    async (packageManager) => {
      for (const lockfile of [
        'package-lock.json',
        'npm-shrinkwrap.json',
        'pnpm-lock.yaml',
      ]) {
        const cwd = temp();
        const runtime = services(cwd);
        writeFileSync(join(cwd, lockfile), 'keep me');
        await expect(
          runCreateCommand(
            ['.', '--platform', 'web', '--package-manager', packageManager],
            io(),
            runtime,
          ),
        ).rejects.toThrow('Cannot create project');
        expect(readdirSync(cwd)).toEqual([lockfile]);
        expect(readFileSync(join(cwd, lockfile), 'utf8')).toBe('keep me');
        expect(runtime.runPackageManager).not.toHaveBeenCalled();
      }
    },
  );

  it.each(['npm', 'pnpm'] as const)(
    'uses %s in installation and reference failure recovery',
    async (packageManager) => {
      for (const failure of ['install', 'describe']) {
        const cwd = temp();
        const runtime = services(cwd);
        runtime.runPackageManager = vi.fn(async (_manager, args) => {
          if (failure === 'install' || args[0] === 'exec')
            throw new Error('command failed');
          return '';
        });
        const output = io();
        const recovery =
          failure === 'install'
            ? `${packageManager} install ${packageManager === 'npm' ? '--workspaces=false' : '--ignore-workspace'}, then ${packageManager} run nodes`
            : `then run ${packageManager} run nodes`;
        await expect(
          runCreateCommand(
            ['.', '--platform', 'web', '--package-manager', packageManager],
            output,
            runtime,
          ),
        ).rejects.toThrow(recovery);
        expect(existsSync(join(cwd, 'package.json'))).toBe(true);
        expect(existsSync(join(cwd, 'midscene-node-reference.md'))).toBe(false);
        expect(output.log.mock.calls.flat().join('\n')).not.toContain(
          'Project ready',
        );
      }
    },
  );
});
