import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from '@rstest/core';

const script = fileURLToPath(
  new URL('../publish-chrome-extension.sh', import.meta.url),
);
const supported =
  process.platform !== 'win32' && spawnSync('jq', ['--version']).status === 0;
const credentials = {
  client_id: 'client&+with spaces',
  client_secret: 'secret-value&+with spaces',
  refresh_token: 'refresh&+with spaces',
};
const cases = [
  {
    name: 'diagnoses invalid client credentials',
    status: '401',
    body: '{"error":"invalid_client","error_description":"secret-value"}',
    exitCode: 1,
    message: 'invalid_client',
  },
  {
    name: 'diagnoses revoked grants',
    status: '400',
    body: '{"error":"invalid_grant"}',
    exitCode: 1,
    message: 'invalid_grant',
  },
  {
    name: 'hides non-JSON error responses',
    status: '503',
    body: 'secret-value',
    exitCode: 1,
    message: 'HTTP 503',
  },
  {
    name: 'rejects empty access tokens',
    status: '200',
    body: '{"access_token":""}',
    exitCode: 1,
    message: 'non-empty access token',
  },
  {
    name: 'rejects null access tokens',
    status: '200',
    body: '{"access_token":null}',
    exitCode: 1,
    message: 'non-empty access token',
  },
  {
    name: 'rejects malformed successful responses',
    status: '200',
    body: 'secret-value',
    exitCode: 1,
    message: 'non-empty access token',
  },
  {
    name: 'hides unknown error codes',
    status: '401',
    body: '{"error":"secret-value"}',
    exitCode: 1,
    message: 'HTTP 401',
  },
  {
    name: 'diagnoses transport failures',
    status: 'transport',
    body: '',
    exitCode: 1,
    message: 'before receiving an HTTP response',
  },
  {
    name: 'encodes credentials and submits after authentication',
    status: '200',
    body: '{ "access_token": "valid-token" }',
    exitCode: 0,
    message:
      'Chrome Web Store submission accepted: version 1.112, state PENDING_REVIEW',
  },
];

for (const scenario of cases) {
  it.skipIf(!supported)(scenario.name, async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'chrome-oauth-'));
    try {
      await fs.writeFile(path.join(dir, 'extension.zip'), 'fixture');
      await fs.writeFile(path.join(dir, 'calls'), '');
      await fs.writeFile(
        path.join(dir, 'unzip'),
        '#!/bin/bash\nprintf \'{"version":"1.112"}\\n\'\n',
        { mode: 0o755 },
      );
      await fs.writeFile(
        path.join(dir, 'curl'),
        `#!/bin/bash
case "$*" in
  *https://oauth2.googleapis.com/token*)
    printf '%s\\0' "$@" > "$MOCK_DIR/token-args"
    printf 'token\\n' >> "$MOCK_DIR/calls"
    if [[ "$MOCK_STATUS" == "transport" ]]; then exit 6; fi
    printf '%s\\n%s' "$MOCK_BODY" "$MOCK_STATUS"
    ;;
  *)
    case "$*" in
      *"Authorization: Bearer valid-token"*) ;;
      *) echo 'missing access token' >&2; exit 98 ;;
    esac
    case "$*" in
      *:upload*)
        printf 'upload\\n' >> "$MOCK_DIR/calls"
        printf '{"uploadState":"SUCCEEDED"}' ;;
      *:publish*)
        printf 'publish\\n' >> "$MOCK_DIR/calls"
        printf '{}' ;;
      *:fetchStatus*)
        printf 'status\\n' >> "$MOCK_DIR/calls"
        printf '{"submittedItemRevisionStatus":{"state":"PENDING_REVIEW","distributionChannels":[{"crxVersion":"1.112"}]}}' ;;
      *) exit 97 ;;
    esac
    ;;
esac
`,
        { mode: 0o755 },
      );
      const result = spawnSync(
        'bash',
        [script, '--zip-path', path.join(dir, 'extension.zip')],
        {
          encoding: 'utf8',
          timeout: 10_000,
          env: {
            ...process.env,
            PATH: `${dir}:${process.env.PATH}`,
            CHROME_WEB_STORE_PUBLISHER_ID: 'fixture',
            CHROME_WEB_STORE_CLIENT_ID: credentials.client_id,
            CHROME_WEB_STORE_CLIENT_SECRET: credentials.client_secret,
            CHROME_WEB_STORE_REFRESH_TOKEN: credentials.refresh_token,
            MOCK_BODY: scenario.body,
            MOCK_STATUS: scenario.status,
            MOCK_DIR: dir,
            GITHUB_STEP_SUMMARY: path.join(dir, 'summary.md'),
          },
        },
      );
      expect(result.status).toBe(scenario.exitCode);
      const output = result.stdout + result.stderr;
      expect(output).toContain(scenario.message);
      for (const secret of [
        ...Object.values(credentials),
        'secret-value',
        'valid-token',
      ]) {
        expect(output).not.toContain(secret);
      }
      const calls = (await fs.readFile(path.join(dir, 'calls'), 'utf8'))
        .trim()
        .split('\n');
      expect(calls).toEqual(
        scenario.exitCode === 0
          ? ['token', 'upload', 'publish', 'status']
          : ['token'],
      );
      const args = (await fs.readFile(path.join(dir, 'token-args'), 'utf8'))
        .split('\0')
        .slice(0, -1);
      for (const [name, value] of Object.entries({
        ...credentials,
        grant_type: 'refresh_token',
      })) {
        const index = args.indexOf(`${name}=${value}`);
        expect(index).toBeGreaterThan(0);
        expect(args[index - 1]).toBe('--data-urlencode');
      }
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
}
