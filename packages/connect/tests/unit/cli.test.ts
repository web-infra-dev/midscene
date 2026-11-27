import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from '@rstest/core';

describe('playground help', () => {
  it.each(['--help', '-h'])('prints help offline with %s', (flag) => {
    const cli = path.resolve(__dirname, '../../bin/midscene-connect');
    const output = execFileSync(process.execPath, [cli, 'playground', flag], {
      encoding: 'utf8',
      env: { ...process.env, MIDSCENE_CONNECT_URL: 'invalid-url' },
      timeout: 10_000,
    });

    expect(output).toContain('Usage: midscene-connect playground [options]');
    for (const option of ['--url', '--token', '--port', '--no-open']) {
      expect(output).toContain(option);
    }
  });
});
