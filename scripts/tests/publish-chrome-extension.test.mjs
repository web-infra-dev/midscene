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

it.skipIf(!supported)(
  'handles OAuth responses without leaking credentials and only uploads after authentication',
  async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'chrome-oauth-'));
    try {
      await fs.writeFile(path.join(dir, 'extension.zip'), 'fixture');
      await fs.writeFile(
        path.join(dir, 'unzip'),
        '#!/bin/bash\nprintf \'{"version":"1.112"}\\n\'\n',
        { mode: 0o755 },
      );
      await fs.writeFile(
        path.join(dir, 'curl'),
        `#!/bin/bash
case "$*" in
  *https://oauth2.googleapis.com/token*) ;;
  *)
    if [[ "$MOCK_BODY" != '{"access_token":"valid-token"}' ]]; then
      echo 'unexpected upload' >&2; exit 99
    fi
    case "$*" in
      *"Authorization: Bearer valid-token"*) ;;
      *) echo 'missing access token' >&2; exit 98 ;;
    esac
    case "$*" in
      *:upload*) printf '{"uploadState":"SUCCEEDED"}' ;;
      *:publish*) printf '{}' ;;
      *:fetchStatus*) printf '{"submittedItemRevisionStatus":{"state":"PENDING_REVIEW","distributionChannels":[{"crxVersion":"1.112"}]}}' ;;
      *) exit 97 ;;
    esac
    exit 0
    ;;
esac
case "$*" in
  *--data-urlencode*) ;;
  *) exit 98 ;;
esac
if [[ "$MOCK_STATUS" == "transport" ]]; then
  exit 6
fi
printf '%s\\n%s' "$MOCK_BODY" "$MOCK_STATUS"
`,
        { mode: 0o755 },
      );
      for (const [status, body, expected] of [
        [
          '401',
          '{"error":"invalid_client","error_description":"secret-value"}',
          'invalid_client',
        ],
        ['400', '{"error":"invalid_grant"}', 'invalid_grant'],
        ['503', 'secret-value', 'HTTP 503'],
        ['200', '{"access_token":""}', 'non-empty access token'],
        ['200', '{"access_token":null}', 'non-empty access token'],
        ['401', '{"error":"secret-value"}', 'HTTP 401'],
        ['transport', '', 'before receiving an HTTP response'],
        [
          '200',
          '{"access_token":"valid-token"}',
          'Chrome Web Store submission accepted: version 1.112, state PENDING_REVIEW',
        ],
      ]) {
        const result = spawnSync(
          'bash',
          [script, '--zip-path', path.join(dir, 'extension.zip')],
          {
            encoding: 'utf8',
            env: {
              ...process.env,
              PATH: `${dir}:${process.env.PATH}`,
              CHROME_WEB_STORE_PUBLISHER_ID: 'fixture',
              CHROME_WEB_STORE_CLIENT_ID: 'fixture',
              CHROME_WEB_STORE_CLIENT_SECRET: 'secret-value',
              CHROME_WEB_STORE_REFRESH_TOKEN: 'fixture',
              MOCK_BODY: body,
              MOCK_STATUS: status,
              GITHUB_STEP_SUMMARY: path.join(dir, 'summary.md'),
            },
          },
        );
        const succeeds = body === '{"access_token":"valid-token"}';
        expect(result.status).toBe(succeeds ? 0 : 1);
        expect(result.stdout + result.stderr).toContain(expected);
        expect(result.stdout + result.stderr).not.toContain('secret-value');
        expect(result.stdout + result.stderr).not.toContain('valid-token');
        expect(result.stdout + result.stderr).not.toContain(
          'unexpected upload',
        );
      }
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  },
);
