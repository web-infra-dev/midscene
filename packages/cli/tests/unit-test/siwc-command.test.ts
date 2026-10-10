import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';
import chalk from 'chalk';
import {
  lockCredentials,
  readRegistration,
  saveRegistration,
} from '../../src/openai/credentials';
import { loginWithOpenAI } from '../../src/openai/login';
import { refreshOpenAICredentials } from '../../src/openai/refresh';
import { runSiwcCommand } from '../../src/siwc-command';

rs.mock('../../src/openai/login', () => ({ loginWithOpenAI: rs.fn() }));
rs.mock('../../src/openai/refresh', () => ({
  refreshOpenAICredentials: rs.fn(),
}));

let directory: string;
let path: string;
const credentials = {
  ext_agent_host_id: 'urn:uuid:test-host',
  client_id: 'oaiapp_test',
  subject: 'test-user',
  issuer: 'https://auth.openai.com',
  access_token: 'test-access',
  refresh_token: 'test-refresh',
  id_token: 'test-id',
  scopes: ['chatgpt.tokens.use.direct'],
  expires_at: 2000000000000,
};
const io = { stdout: rs.fn(), stderr: rs.fn() };
beforeEach(async () => {
  rs.resetAllMocks();
  directory = await mkdtemp(join(tmpdir(), 'siwc-test-'));
  path = join(directory, 'siwc.json');
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('model siwc command', () => {
  it('saves full credentials with private permissions and prints only the access token', async () => {
    rs.mocked(loginWithOpenAI).mockImplementation(async (options) => {
      expect((await readRegistration(path))?.ext_agent_host_id).toBe(
        options.hostId,
      );
      await options.onAuthorization('https://auth.openai.com/test');
      return { ...credentials, ext_agent_host_id: options.hostId! };
    });
    expect(await runSiwcCommand(['login', '--no-open'], io, path)).toBe(0);
    const saved = JSON.parse(await readFile(path, 'utf8'));
    expect(saved.credentials.access_token).toBe('test-access');
    expect(saved.access_token).toBeUndefined();
    expect(Number.isFinite(Date.parse(saved.created_at))).toBe(true);
    expect(Date.parse(saved.updated_at)).toBeGreaterThanOrEqual(
      Date.parse(saved.created_at),
    );
    expect(io.stdout).toHaveBeenCalledExactlyOnceWith(
      saved.credentials.access_token,
    );
    expect(io.stderr.mock.calls[0][0]).toBe(
      chalk.cyan.bold('🔄 Starting OpenAI SIWC login...'),
    );
    expect(io.stderr).toHaveBeenCalledWith(
      `\n${chalk.bold('Continue with ChatGPT:')}\nhttps://auth.openai.com/test\n\n${chalk.gray('Waiting for authorization...')}`,
    );
    expect(io.stderr.mock.calls.at(-1)?.[0]).toContain(
      `Full credentials are saved locally to:\n${chalk.cyan(path)}`,
    );
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(io.stderr.mock.calls.flat().join('\n')).toContain(
      'Midscene does not collect your credentials.',
    );
    expect(io.stderr.mock.calls.flat().join('\n')).not.toContain('test-access');
    await expect(stat(`${path}.lock`)).rejects.toThrow();
  });

  it('reuses the saved client and host on login', async () => {
    await saveRegistration(path, credentials);
    rs.mocked(loginWithOpenAI).mockResolvedValue(credentials);
    expect(await runSiwcCommand(['login', '--no-open'], io, path)).toBe(0);
    expect(loginWithOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: credentials.client_id,
        hostId: credentials.ext_agent_host_id,
      }),
    );
  });

  it('rotates stored credentials on refresh without opening login', async () => {
    const createdAt = '2026-01-01T00:00:00.000Z';
    await writeFile(
      path,
      JSON.stringify({
        created_at: createdAt,
        updated_at: createdAt,
        credentials,
      }),
    );
    const replacement = {
      ...credentials,
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      expires_at: Date.now() + 60 * 60_000,
    };
    rs.mocked(refreshOpenAICredentials).mockResolvedValue(replacement);
    expect(await runSiwcCommand(['refresh'], io, path)).toBe(0);
    expect(await readRegistration(path)).toEqual(replacement);
    const saved = JSON.parse(await readFile(path, 'utf8'));
    expect(saved.created_at).toBe(createdAt);
    expect(Date.parse(saved.updated_at)).toBeGreaterThan(Date.parse(createdAt));
    expect(io.stdout).toHaveBeenCalledExactlyOnceWith(replacement.access_token);
    expect(io.stderr).toHaveBeenCalledWith(
      `\nExpires at: ${new Intl.DateTimeFormat('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'long',
      }).format(replacement.expires_at)} (in 1 hour)`,
    );
    expect(loginWithOpenAI).not.toHaveBeenCalled();
  });

  it('keeps old credentials and redacts failure details', async () => {
    await saveRegistration(path, credentials);
    const original = await readFile(path, 'utf8');
    rs.mocked(refreshOpenAICredentials).mockRejectedValue(
      new Error('refresh_token=secret'),
    );
    expect(await runSiwcCommand(['refresh'], io, path)).toBe(1);
    expect(await readRegistration(path)).toEqual(credentials);
    expect(await readFile(path, 'utf8')).toBe(original);
    expect(io.stdout).not.toHaveBeenCalled();
    expect(io.stderr.mock.calls.flat().join('\n')).not.toContain(
      'refresh_token=secret',
    );
  });

  it('does not replace a saved account with a different identity', async () => {
    await saveRegistration(path, credentials);
    rs.mocked(loginWithOpenAI).mockResolvedValue({
      ...credentials,
      subject: 'other-user',
    });
    expect(await runSiwcCommand(['login', '--no-open'], io, path)).toBe(1);
    expect(await readRegistration(path)).toEqual(credentials);
  });

  it('rejects concurrent commands before reading or refreshing tokens', async () => {
    const unlock = await lockCredentials(path);
    try {
      expect(await runSiwcCommand(['refresh'], io, path)).toBe(1);
      expect(refreshOpenAICredentials).not.toHaveBeenCalled();
    } finally {
      await unlock();
    }
  });

  it('requires saved credentials for refresh', async () => {
    expect(await runSiwcCommand(['refresh'], io, path)).toBe(1);
    expect(refreshOpenAICredentials).not.toHaveBeenCalled();
  });

  it('rejects the old flat credentials format', async () => {
    await writeFile(path, JSON.stringify(credentials));
    await expect(readRegistration(path)).rejects.toThrow(
      'Invalid local SIWC credentials file.',
    );
  });

  it('rejects invalid options before authorization', async () => {
    for (const args of [
      ['login', '--port', '-1'],
      ['login', '--port'],
      ['login', '--port', '65536'],
      ['login', '--unknown'],
      ['refresh', '--no-open'],
      ['unknown'],
    ]) {
      expect(await runSiwcCommand(args, io, path)).toBe(1);
    }
    expect(loginWithOpenAI).not.toHaveBeenCalled();
  });

  it('shows help with no subcommand', async () => {
    expect(await runSiwcCommand([], io, path)).toBe(0);
    expect(await runSiwcCommand(['--help'], io, path)).toBe(0);
    expect(io.stdout.mock.calls.flat().join('\n')).toContain('siwc refresh');
    expect(loginWithOpenAI).not.toHaveBeenCalled();
  });
});
