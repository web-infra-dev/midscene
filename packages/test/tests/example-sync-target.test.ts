import { execFile, execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveExampleTarget } from '../src/cli/example-sync-target';

const roots: string[] = [];
const execFileAsync = promisify(execFile);
const temp = () => {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), 'midscene-sync-target-')),
  );
  roots.push(root);
  return root;
};
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, {
    cwd,
    stdio: 'pipe',
  });
const checkout = (
  root: string,
  remote = 'git@github.com:web-infra-dev/midscene-example.git',
) => {
  mkdirSync(root, { recursive: true });
  git(root, 'init', '--quiet');
  git(root, 'remote', 'add', 'origin', remote);
  return root;
};

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe('example sync target', () => {
  it('resolves relative targets from the original caller directory', () => {
    const root = temp();
    const source = join(root, 'midscene');
    mkdirSync(join(source, 'packages/test'), { recursive: true });
    const target = checkout(join(root, 'midscene-example'));
    vi.stubEnv('INIT_CWD', source);
    expect(resolveExampleTarget('../midscene-example')).toBe(target);
    expect(resolveExampleTarget(target, source)).toBe(target);
    expect(readdirSync(target)).toEqual(['.git']);
  });

  it.each([
    'https://github.com/web-infra-dev/midscene-example.git',
    'ssh://git@github.com/web-infra-dev/midscene-example.git',
  ])('accepts an official checkout with remote %s', (remote) => {
    const target = checkout(temp(), remote);
    expect(resolveExampleTarget(target)).toBe(target);
  });

  it('accepts a fork with the official upstream remote', () => {
    const target = checkout(
      temp(),
      'git@github.com:contributor/midscene-example.git',
    );
    git(
      target,
      'remote',
      'add',
      'upstream',
      'https://github.com/web-infra-dev/midscene-example',
    );
    expect(resolveExampleTarget(target)).toBe(target);
  });

  it('rejects missing directories, non-repositories, subdirectories and unrelated repositories before writing', () => {
    const root = temp();
    expect(() => resolveExampleTarget(join(root, 'missing'))).toThrow(
      'existing midscene-example checkout',
    );
    expect(() => resolveExampleTarget(root)).toThrow('not a Git checkout');
    const target = checkout(join(root, 'example'));
    mkdirSync(join(target, 'subdir'));
    expect(() => resolveExampleTarget(join(target, 'subdir'))).toThrow(
      'repository root',
    );
    git(
      target,
      'remote',
      'set-url',
      'origin',
      'https://github.com/web-infra-dev/midscene.git',
    );
    expect(() => resolveExampleTarget(target)).toThrow(
      'remote for web-infra-dev/midscene-example',
    );
    expect(readdirSync(target).sort()).toEqual(['.git', 'subdir']);
  });

  it('preserves the calling directory through the real pnpm sync command', async () => {
    const root = temp();
    const caller = join(root, 'caller');
    mkdirSync(caller);
    const target = checkout(join(root, 'midscene-example'));
    // Nested pnpm/tsx startup can exceed the default unit-test timeout under
    // CI coverage load. Bound the child separately so a hang still fails.
    const command = execFileAsync(
      'pnpm',
      [
        '--dir',
        resolve(__dirname, '../../..'),
        'run',
        'examples:sync',
        '--',
        '--target',
        '../midscene-example',
        '--version',
        'invalid',
      ],
      { cwd: caller, timeout: 20_000 },
    );
    // Reaching version validation proves target resolution and repository
    // validation succeeded; the invalid version prevents all writes.
    await expect(command).rejects.toMatchObject({
      stderr: expect.stringContaining('Pass the published Midscene version'),
    });
    expect(readdirSync(target)).toEqual(['.git']);
  }, 30_000);
});
