import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from '@rstest/core';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const setupScript = path.join(
  repositoryRoot,
  '.github/actions/setup-node-pnpm/setup-pnpm.sh',
);
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

const fixture = (version = '9.3.0', failAt = '') => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'midscene-ci-setup-'));
  roots.push(root);
  const bin = path.join(root, 'tools');
  fs.mkdirSync(bin);
  const calls = path.join(root, 'corepack.log');
  const githubPath = path.join(root, 'github-path');
  const githubEnv = path.join(root, 'github-env');
  fs.writeFileSync(githubPath, '');
  fs.writeFileSync(githubEnv, '');
  fs.writeFileSync(
    path.join(bin, 'corepack'),
    `#!/usr/bin/env bash
set -eu
printf '%s\\n' "$*" >> "$COREPACK_CALLS"
if [[ "$1" == "$FAIL_COREPACK_AT" ]]; then exit 9; fi
if [[ "$1" == enable ]]; then
  cat > "$3/pnpm" <<'PNPM'
#!/usr/bin/env bash
if [[ "\${COREPACK_ENABLE_PROJECT_SPEC:-}" != 0 ]]; then exit 8; fi
printf '%s\\n' "\${FAKE_PNPM_VERSION:-$PNPM_VERSION}"
PNPM
  chmod +x "$3/pnpm"
fi
`,
    { mode: 0o755 },
  );
  return {
    root,
    calls,
    githubPath,
    githubEnv,
    options: {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        PNPM_VERSION: version,
        RUNNER_TEMP: path.join(root, 'runner temp'),
        GITHUB_PATH: githubPath,
        GITHUB_ENV: githubEnv,
        COREPACK_CALLS: calls,
        FAIL_COREPACK_AT: failAt,
      },
    },
  };
};

describe('CI tool setup', () => {
  it.each(['9.3.0', '9.15.9', '10.27.0'])(
    'activates pinned pnpm %s and exposes its shim to later steps',
    (version) => {
      const { root, calls, githubPath, githubEnv, options } = fixture(version);
      expect(execFileSync('bash', [setupScript], options).trim()).toBe(version);
      const pnpmBin = path.join(root, 'runner temp/midscene-pnpm/bin');
      expect(
        fs.readFileSync(calls, 'utf8').split('\n').filter(Boolean),
      ).toEqual([
        `enable --install-directory ${pnpmBin} pnpm`,
        `install --global pnpm@${version}`,
      ]);
      expect(fs.readFileSync(githubPath, 'utf8')).toBe(`${pnpmBin}\n`);
      expect(fs.readFileSync(githubEnv, 'utf8')).toBe(
        'COREPACK_ENABLE_PROJECT_SPEC=0\n',
      );
    },
  );

  it('fails the setup step when package-manager installation fails', () => {
    const { githubPath, githubEnv, options } = fixture('9.3.0', 'install');
    expect(spawnSync('bash', [setupScript], options).status).toBe(9);
    expect(fs.readFileSync(githubPath, 'utf8')).toBe('');
    expect(fs.readFileSync(githubEnv, 'utf8')).toBe('');
  });

  it('rejects an unexpected pnpm version before exposing it to later steps', () => {
    const { githubPath, githubEnv, options } = fixture('9.15.9');
    options.env.FAKE_PNPM_VERSION = '9.3.0';
    const result = spawnSync('bash', [setupScript], options);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Expected pnpm 9.15.9, received 9.3.0');
    expect(fs.readFileSync(githubPath, 'utf8')).toBe('');
    expect(fs.readFileSync(githubEnv, 'utf8')).toBe('');
  });

  it('uses the shared setup instead of the blocked pnpm action in workflows', () => {
    const directory = path.join(repositoryRoot, '.github/workflows');
    for (const name of fs.readdirSync(directory)) {
      if (!/\.ya?ml$/.test(name)) continue;
      const source = fs.readFileSync(path.join(directory, name), 'utf8');
      expect(source).not.toMatch(/\buses:\s*pnpm\/action-setup@/);
    }
  });

  it('keeps transitive shared setup actions GitHub-owned and SHA-pinned', () => {
    const visited = new Set();
    const visit = (relativePath) => {
      if (visited.has(relativePath)) return;
      visited.add(relativePath);
      const source = fs.readFileSync(
        path.join(repositoryRoot, relativePath, 'action.yml'),
        'utf8',
      );
      for (const [, action] of source.matchAll(/\buses:\s*(\S+)/g)) {
        if (action.startsWith('./')) visit(action);
        else expect(action).toMatch(/^actions\/[\w/-]+@[a-f0-9]{40}$/);
      }
    };
    visit('.github/actions/setup-node-pnpm');
    visit('.github/actions/setup-puppeteer-browser');
  });
});
