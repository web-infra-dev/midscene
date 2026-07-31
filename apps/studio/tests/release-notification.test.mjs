import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const temporaryDirectories = [];
const supportsReleaseShell =
  process.platform !== 'win32' &&
  spawnSync('bash', ['--version']).status === 0 &&
  spawnSync('jq', ['--version']).status === 0;

const writeExecutable = async (filePath, content) => {
  await fs.writeFile(filePath, content, { mode: 0o755 });
};

const loadFeishuNotificationScript = async () => {
  const workflow = await fs.readFile(
    path.join(repositoryRoot, '.github/workflows/release.yml'),
    'utf8',
  );
  const match = workflow.match(
    / {4}- name: Publish release notification to Feishu[\s\S]*?\n {6}run: \|\n([\s\S]*?)\n {4}- name: Summarize Feishu notification failure/,
  );
  if (!match) {
    throw new Error('Could not find the Feishu release notification script');
  }
  return match[1].replace(/^ {8}/gm, '');
};

const createNotificationHarness = async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), 'midscene-release-notification-'),
  );
  temporaryDirectories.push(root);
  const binDirectory = path.join(root, 'bin');
  const curlLog = path.join(root, 'curl.log');
  const summaryPath = path.join(root, 'summary.md');
  await fs.mkdir(binDirectory);

  await writeExecutable(
    path.join(binDirectory, 'gh'),
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1 $2" == "release view" ]]; then
  printf '%s\\n' '{"name":"Midscene.js v1.2.3","url":"https://github.com/web-infra-dev/midscene/releases/tag/v1.2.3"}'
else
  printf '%s\\n' '{"body":"* feat(core): support external groups by @example in https://github.com/web-infra-dev/midscene/pull/1"}'
fi
`,
  );
  await writeExecutable(
    path.join(binDirectory, 'curl'),
    `#!/usr/bin/env bash
set -euo pipefail
cat >> "$CURL_LOG"
printf '\\n' >> "$CURL_LOG"
printf '%s\\n' '{"code":0,"msg":"success"}'
`,
  );
  await writeExecutable(
    path.join(binDirectory, 'openssl'),
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "dgst" ]]; then
  printf 'digest'
else
  cat >/dev/null
  printf 'test-signature'
fi
`,
  );

  return {
    curlLog,
    env: {
      ...process.env,
      CURL_LOG: curlLog,
      FEISHU_WEBHOOK_SECRET: '',
      FEISHU_WEBHOOK_SECRET_2: '',
      FEISHU_WEBHOOK_URL: '',
      FEISHU_WEBHOOK_URL_2: '',
      GH_TOKEN: 'test-token',
      GITHUB_REPOSITORY: 'web-infra-dev/midscene',
      GITHUB_STEP_SUMMARY: summaryPath,
      PATH: `${binDirectory}${path.delimiter}${process.env.PATH}`,
      RELEASE_TARGET: 'main',
      RELEASE_VERSION: 'v1.2.3',
    },
  };
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { force: true, recursive: true })),
  );
});

describe.skipIf(!supportsReleaseShell)('Feishu release notification', () => {
  it('delivers to every legacy and JSON webhook target', async () => {
    const script = await loadFeishuNotificationScript();
    const harness = await createNotificationHarness();
    const jsonTargets = Array.from({ length: 4 }, (_, index) => ({
      url: `https://open.feishu.cn/open-apis/bot/v2/hook/external-${index + 1}`,
      secret: `secret-${index + 1}`,
    }));
    const legacyTarget = {
      url: 'https://open.feishu.cn/open-apis/bot/v2/hook/legacy',
      secret: 'legacy-secret',
    };
    const targets = [legacyTarget, ...jsonTargets];

    execFileSync('bash', ['-c', script], {
      env: {
        ...harness.env,
        FEISHU_WEBHOOK_SECRET: legacyTarget.secret,
        FEISHU_WEBHOOK_TARGETS_JSON: JSON.stringify(jsonTargets),
        FEISHU_WEBHOOK_URL: legacyTarget.url,
      },
      stdio: 'pipe',
    });

    const curlLog = await fs.readFile(harness.curlLog, 'utf8');
    for (const target of targets) {
      expect(curlLog).toContain(`url = "${target.url}"`);
    }
    expect(curlLog.match(/^url = /gm)).toHaveLength(targets.length);
  }, 15_000);

  it('rejects malformed JSON target configuration before delivery', async () => {
    const script = await loadFeishuNotificationScript();
    const harness = await createNotificationHarness();

    const result = spawnSync('bash', ['-c', script], {
      encoding: 'utf8',
      env: {
        ...harness.env,
        FEISHU_WEBHOOK_TARGETS_JSON: JSON.stringify([
          { url: 'https://open.feishu.cn/open-apis/bot/v2/hook/incomplete' },
        ]),
      },
    });

    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain(
      'FEISHU_WEBHOOK_TARGETS_JSON must be a JSON array',
    );
    await expect(fs.readFile(harness.curlLog, 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});
