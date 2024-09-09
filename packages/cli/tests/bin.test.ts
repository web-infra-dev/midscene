import { randomUUID } from 'node:crypto';
import { existsSync, unlinkSync } from 'node:fs';
import { execa } from 'execa';
import { describe, expect, test, vi } from 'vitest';

const cliBin = require.resolve('../bin/midscene');
vi.setConfig({
  testTimeout: 30 * 1000,
});
describe.skipIf(process.platform !== 'darwin')('bin', () => {
  test('error order', async () => {
    const params = [
      '--query',
      '{name: string, status: string}[], service status of github page',
      '--url',
      'https://www.baidu.com/',
    ];
    expect(async () => {
      await execa(cliBin, params);
    }).rejects.toThrowError();
  });

  test('basic action', async () => {
    const randomFileName = `status-${randomUUID()}.json`;
    const params = [
      '--url',
      'https://www.githubstatus.com/',
      '--query-output',
      randomFileName,
      '--query',
      '{name: string, status: string}[], service status of github page',
    ];
    const { failed } = await execa(cliBin, params);
    expect(failed).toBe(false);

    expect(existsSync(randomFileName)).toBeTruthy();
    unlinkSync(randomFileName);
  });
});
