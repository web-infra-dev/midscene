import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { formatReleaseNotes } from '../../../scripts/format-release-notes.mjs';

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

const loadDiscordNotificationScript = async () => {
  const workflow = await fs.readFile(
    path.join(repositoryRoot, '.github/workflows/release.yml'),
    'utf8',
  );
  const match = workflow.match(
    / {4}- name: Publish release notification to Discord[\s\S]*?\n {6}run: \|\n([\s\S]*?)\n {4}- name: Summarize Discord notification failure/,
  );
  if (!match) {
    throw new Error('Could not find the Discord release notification script');
  }
  return match[1].replace(/^ {8}/gm, '');
};

const createNotificationHarness = async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), 'midscene-release-notification-'),
  );
  temporaryDirectories.push(root);
  const binDirectory = path.join(root, 'bin');
  const curlCommandLog = path.join(root, 'curl-command.log');
  const curlLog = path.join(root, 'curl.log');
  const curlPayloadLog = path.join(root, 'curl-payload.log');
  const summaryPath = path.join(root, 'summary.md');
  await fs.mkdir(binDirectory);

  await writeExecutable(
    path.join(binDirectory, 'gh'),
    `#!/usr/bin/env bash
set -euo pipefail
echo "The notification script must not depend on gh." >&2
exit 99
`,
  );
  await writeExecutable(
    path.join(binDirectory, 'curl'),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%q ' "$@" >> "$CURL_COMMAND_LOG"
printf '\\n' >> "$CURL_COMMAND_LOG"

if [[ " $* " == *" https://api.github.com/repos/web-infra-dev/midscene/releases/tags/"* ]]; then
  jq -cn \\
    --arg body "\${MOCK_RELEASE_BODY-}" \\
    --arg published_at "\${MOCK_RELEASE_PUBLISHED_AT-2026-08-04T12:25:00Z}" \\
    '{
      name: "Midscene.js v1.2.3",
      tag_name: "v1.2.3",
      draft: false,
      html_url: "https://github.com/web-infra-dev/midscene/releases/tag/v1.2.3",
      published_at: $published_at,
      body: (if $body == "" then null else $body end)
    }'
  exit 0
fi

if [[ " $* " == *" https://api.github.com/repos/web-infra-dev/midscene/releases/generate-notes"* ]]; then
  cat >/dev/null
  jq -cn \\
    --arg body "\${MOCK_GENERATED_NOTES_BODY-* feat(core): support external groups by @example in https://github.com/web-infra-dev/midscene/pull/1}" \\
    '{body: $body}'
  exit 0
fi

request_config="$(cat)"
printf '%s' "$request_config" >> "$CURL_LOG"
printf '\\n' >> "$CURL_LOG"
arguments=("$@")
for ((index = 0; index < \${#arguments[@]}; index += 1)); do
  if [[ "\${arguments[$index]}" == "--data" ]]; then
    printf '%s\\n' "\${arguments[$((index + 1))]}" >> "$CURL_PAYLOAD_LOG"
  fi
done

if [[ "$request_config" == *"discord.com/api/webhooks/"* ]]; then
  if [[ " $* " == *" --request POST "* ]]; then
    printf '%s\\n' '{"id":"message-id","channel_id":"channel-id"}'
  else
    printf '%s\\n' '{"guild_id":"guild-id"}'
  fi
  exit 0
fi

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
    curlCommandLog,
    curlLog,
    curlPayloadLog,
    env: {
      ...process.env,
      CURL_COMMAND_LOG: curlCommandLog,
      CURL_LOG: curlLog,
      CURL_PAYLOAD_LOG: curlPayloadLog,
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
  it('publishes ordered generated notes as part of the GitHub Release', async () => {
    const workflow = await fs.readFile(
      path.join(repositoryRoot, '.github/workflows/release.yml'),
      'utf8',
    );
    const releaseUpload = workflow.match(
      /- name: Upload Release Assets[\s\S]*?\n\s+env:/,
    )?.[0];

    expect(workflow).toContain('- name: Generate ordered Release notes');
    expect(releaseUpload).toContain(
      'body_path: ${{ runner.temp }}/release-notes.md',
    );
    expect(releaseUpload).not.toContain('generate_release_notes: true');
  });

  it('delivers to every JSON webhook target', async () => {
    const script = await loadFeishuNotificationScript();
    const harness = await createNotificationHarness();
    const targets = Array.from({ length: 4 }, (_, index) => ({
      url: `https://open.feishu.cn/open-apis/bot/v2/hook/external-${index + 1}`,
      secret: `secret-${index + 1}`,
    }));

    execFileSync('bash', ['-c', script], {
      env: {
        ...harness.env,
        FEISHU_WEBHOOK_TARGETS_JSON: JSON.stringify(targets),
      },
      stdio: 'pipe',
    });

    const curlLog = await fs.readFile(harness.curlLog, 'utf8');
    for (const target of targets) {
      expect(curlLog).toContain(`url = "${target.url}"`);
    }
    expect(curlLog.match(/^url = /gm)).toHaveLength(targets.length);

    const curlCommandLog = await fs.readFile(harness.curlCommandLog, 'utf8');
    expect(curlCommandLog).toContain('/releases/tags/v1.2.3');
    expect(curlCommandLog).toContain('/releases/generate-notes');

    const payloads = (await fs.readFile(harness.curlPayloadLog, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(payloads).toHaveLength(targets.length);
    expect(payloads[0].card.body.elements[0].content).toContain('**Features**');
  }, 15_000);

  it('uses published release notes without generating them again', async () => {
    const script = await loadFeishuNotificationScript();
    const harness = await createNotificationHarness();

    execFileSync('bash', ['-c', script], {
      env: {
        ...harness.env,
        FEISHU_WEBHOOK_TARGETS_JSON: JSON.stringify([
          {
            url: 'https://open.feishu.cn/open-apis/bot/v2/hook/existing-notes',
            secret: 'existing-notes-secret',
          },
        ]),
        MOCK_RELEASE_BODY:
          '* fix(core): preserve release notes by @example in https://github.com/web-infra-dev/midscene/pull/2',
      },
      stdio: 'pipe',
    });

    const curlCommandLog = await fs.readFile(harness.curlCommandLog, 'utf8');
    expect(curlCommandLog).toContain('/releases/tags/v1.2.3');
    expect(curlCommandLog).not.toContain('/releases/generate-notes');

    const payload = JSON.parse(
      (await fs.readFile(harness.curlPayloadLog, 'utf8')).trim(),
    );
    expect(payload.card.body.elements[0].content).toContain('**Fixes**');
    expect(payload.card.body.elements[0].content).toContain('PR #2');
  });

  it('rejects incomplete release metadata before delivery', async () => {
    const script = await loadFeishuNotificationScript();
    const harness = await createNotificationHarness();

    const result = spawnSync('bash', ['-c', script], {
      encoding: 'utf8',
      env: {
        ...harness.env,
        FEISHU_WEBHOOK_TARGETS_JSON: JSON.stringify([
          {
            url: 'https://open.feishu.cn/open-apis/bot/v2/hook/incomplete-release',
            secret: 'incomplete-release-secret',
          },
        ]),
        MOCK_RELEASE_PUBLISHED_AT: '',
      },
    });

    expect(result.status).not.toBe(0);
    await expect(
      fs.readFile(harness.curlPayloadLog, 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

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

describe('GitHub Release notes ordering', () => {
  it('uses the same feature-first category order as notifications', () => {
    const notes = [
      '<!-- generated -->',
      '## Other Changes',
      '* docs(site): refresh docs by @example in https://github.com/web-infra-dev/midscene/pull/4',
      '* fix(core): second fix by @example in https://github.com/web-infra-dev/midscene/pull/3',
      '* feat(web): first feature by @example in https://github.com/web-infra-dev/midscene/pull/2',
      '* fix(ai): first fix by @example in https://github.com/web-infra-dev/midscene/pull/1',
      '* release entry with an unexpected format',
      '**Full Changelog**: https://github.com/web-infra-dev/midscene/compare/v1.0.0...v1.1.0',
    ].join('\n');

    const formatted = formatReleaseNotes(notes);

    expect(formatted.indexOf('## Features')).toBeLessThan(
      formatted.indexOf('## Fixes'),
    );
    expect(formatted.indexOf('## Fixes')).toBeLessThan(
      formatted.indexOf('## Documentation'),
    );
    expect(formatted.indexOf('second fix')).toBeLessThan(
      formatted.indexOf('first fix'),
    );
    expect(formatted).toContain('## Other Changes');
    expect(formatted.match(/^\* /gm)).toHaveLength(5);
    expect(formatted).toMatch(/\*\*Full Changelog\*\*: .*$/);
  });

  it('places breaking changes and maintenance in explicit categories', () => {
    const notes = [
      '* chore: update dependencies by @example in https://github.com/web-infra-dev/midscene/pull/3',
      '* feat(core)!: change API by @example in https://github.com/web-infra-dev/midscene/pull/2',
      '* ci(workflow): adjust release by @example in https://github.com/web-infra-dev/midscene/pull/1',
    ].join('\n');

    const formatted = formatReleaseNotes(notes);

    expect(formatted).toContain('## Breaking Changes');
    expect(formatted).toContain('## CI & Chore');
    expect(formatted.match(/^\* /gm)).toHaveLength(3);
  });

  it('leaves a body without generated change entries unchanged', () => {
    expect(formatReleaseNotes('Manual release notes')).toBe(
      'Manual release notes',
    );
  });
});

describe.skipIf(!supportsReleaseShell)('Discord release notification', () => {
  it('fetches release metadata and generates notes without gh', async () => {
    const script = await loadDiscordNotificationScript();
    const harness = await createNotificationHarness();

    execFileSync('bash', ['-c', script], {
      env: {
        ...harness.env,
        DISCORD_WEBHOOK_URL:
          'https://discord.com/api/webhooks/webhook-id/webhook-token',
      },
      stdio: 'pipe',
    });

    const curlCommandLog = await fs.readFile(harness.curlCommandLog, 'utf8');
    expect(curlCommandLog).toContain('/releases/tags/v1.2.3');
    expect(curlCommandLog).toContain('/releases/generate-notes');

    const payload = JSON.parse(
      (await fs.readFile(harness.curlPayloadLog, 'utf8')).trim(),
    );
    expect(payload.embeds[0].description).toContain('**Features**');
  });
});
