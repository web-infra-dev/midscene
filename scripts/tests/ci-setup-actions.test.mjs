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
  fs.writeFileSync(githubPath, '');
  fs.writeFileSync(
    path.join(bin, 'corepack'),
    `#!/usr/bin/env bash
set -eu
printf '%s\\n' "$*" >> "$COREPACK_CALLS"
if [[ "$1" == "$FAIL_COREPACK_AT" ]]; then exit 9; fi
if [[ "$1" == enable ]]; then
  cat > "$3/pnpm" <<'PNPM'
#!/usr/bin/env bash
printf '%s\\n' "$PNPM_VERSION"
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
    options: {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        PNPM_VERSION: version,
        RUNNER_TEMP: path.join(root, 'runner temp'),
        GITHUB_PATH: githubPath,
        COREPACK_CALLS: calls,
        FAIL_COREPACK_AT: failAt,
      },
    },
  };
};

describe('CI tool setup', () => {
  it.each(['9.3.0', '10.27.0'])(
    'activates pinned pnpm %s and exposes its shim to later steps',
    (version) => {
      const { root, calls, githubPath, options } = fixture(version);
      expect(execFileSync('bash', [setupScript], options).trim()).toBe(version);
      const pnpmBin = path.join(root, 'runner temp/midscene-pnpm/bin');
      expect(
        fs.readFileSync(calls, 'utf8').split('\n').filter(Boolean),
      ).toEqual([
        `enable --install-directory ${pnpmBin} pnpm`,
        `install --global pnpm@${version}`,
      ]);
      expect(fs.readFileSync(githubPath, 'utf8')).toBe(`${pnpmBin}\n`);
    },
  );

  it('fails the setup step when package-manager installation fails', () => {
    const { githubPath, options } = fixture('9.3.0', 'install');
    expect(spawnSync('bash', [setupScript], options).status).toBe(9);
    expect(fs.readFileSync(githubPath, 'utf8')).toBe('');
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
