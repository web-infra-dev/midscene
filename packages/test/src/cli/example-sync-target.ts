import { execFileSync } from 'node:child_process';
import { realpathSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const expectedRemote =
  /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)web-infra-dev\/midscene-example(?:\.git)?\/?$/;

/** Resolve from pnpm's original caller and verify the destination checkout. */
export function resolveExampleTarget(
  targetArg: string,
  callerDirectory = process.env.INIT_CWD ?? process.cwd(),
): string {
  const requested = resolve(callerDirectory, targetArg);
  let target: string;
  try {
    target = realpathSync(requested);
    if (!statSync(target).isDirectory()) throw new Error('Not a directory');
  } catch {
    throw new Error(
      `Example target must be an existing midscene-example checkout: ${requested}`,
    );
  }

  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: target,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  let repositoryRoot: string;
  try {
    repositoryRoot = realpathSync(git('rev-parse', '--show-toplevel'));
  } catch {
    throw new Error(`Example target is not a Git checkout: ${target}`);
  }
  if (repositoryRoot !== target) {
    throw new Error(
      `Example target must be the repository root: ${repositoryRoot}`,
    );
  }
  const remotes = git('remote').split('\n').filter(Boolean);
  const matches = remotes.some((name) =>
    git('remote', 'get-url', '--all', name)
      .split('\n')
      .some((url) => expectedRemote.test(url)),
  );
  if (!matches) {
    throw new Error(
      `Example target must have a remote for web-infra-dev/midscene-example: ${target}. For a fork, add the official repository as an upstream remote.`,
    );
  }
  return target;
}
