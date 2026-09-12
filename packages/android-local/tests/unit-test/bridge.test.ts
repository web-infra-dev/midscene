import { describe, expect, test } from '@rstest/core';
import {
  ExecBridgeCommandRunner,
  bridgeFromEnv,
  commandFromArgv,
  createBridgeFileIo,
} from '../../src/transport/bridge';

describe('exec bridge runner', () => {
  test('unwraps the launcher argv the transports build', () => {
    // `sh <rish> -c <command>`; the bridge runs the payload directly as shell.
    expect(
      commandFromArgv(['sh', '/data/local/tmp/rish', '-c', 'screencap -p']),
    ).toBe('screencap -p');
  });

  test('posts the command and maps the JSON envelope', async () => {
    const requests: { url: string; body: unknown; token?: string }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      requests.push({
        url: String(url),
        body: init.body,
        token: (init.headers as Record<string, string>)['x-midscene-token'],
      });
      return {
        ok: true,
        status: 200,
        json: async () => ({ exitCode: 0, stdout: '2000\n', stderr: '' }),
        text: async () => '',
        arrayBuffer: async () => new ArrayBuffer(0),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const runner = new ExecBridgeCommandRunner({
      url: 'http://127.0.0.1:9999/',
      token: 'secret',
      fetchImpl,
    });
    const result = await runner.run(
      ['sh', '/data/local/tmp/rish', '-c', 'id -u'],
      { timeoutMs: 5000 },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString('utf8')).toBe('2000\n');
    expect(result.signal).toBeNull();
    expect(requests[0].url).toBe('http://127.0.0.1:9999/exec?timeout=5000');
    expect(requests[0].body).toBe('id -u');
    expect(requests[0].token).toBe('secret');
  });

  test('surfaces a rejected command instead of returning empty output', async () => {
    const fetchImpl = (async () =>
      ({
        ok: false,
        status: 403,
        text: async () => 'forbidden',
      }) as unknown as Response) as unknown as typeof fetch;
    const runner = new ExecBridgeCommandRunner({
      url: 'http://127.0.0.1:9999',
      token: 'wrong',
      fetchImpl,
    });

    await expect(runner.run(['sh', 'rish', '-c', 'id -u'])).rejects.toThrow(
      /HTTP 403/,
    );
  });

  test('reads channel files through the shell as raw bytes', async () => {
    const fetchImpl = (async () =>
      ({
        ok: true,
        status: 200,
        arrayBuffer: async () => {
          const buffer = Buffer.from('PNG-BYTES');
          return buffer.buffer.slice(
            buffer.byteOffset,
            buffer.byteOffset + buffer.byteLength,
          );
        },
      }) as unknown as Response) as unknown as typeof fetch;

    const runner = new ExecBridgeCommandRunner({
      url: 'http://127.0.0.1:9999',
      token: 'secret',
      fetchImpl,
    });
    const io = createBridgeFileIo(runner);

    expect(
      (await io.read('/data/local/tmp/midscene-channel/shot.png')).toString(
        'utf8',
      ),
    ).toBe('PNG-BYTES');
  });

  test('bridgeFromEnv needs both url and token', () => {
    expect(bridgeFromEnv({} as NodeJS.ProcessEnv)).toBeUndefined();
    expect(
      bridgeFromEnv({ MIDSCENE_EXEC_BRIDGE_URL: 'u' } as NodeJS.ProcessEnv),
    ).toBeUndefined();
    expect(
      bridgeFromEnv({
        MIDSCENE_EXEC_BRIDGE_URL: 'http://127.0.0.1:1',
        MIDSCENE_EXEC_BRIDGE_TOKEN: 't',
      } as NodeJS.ProcessEnv),
    ).toEqual({ url: 'http://127.0.0.1:1', token: 't' });
  });
});
