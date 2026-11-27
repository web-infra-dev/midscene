import { runToolsCLI } from '@midscene/shared/cli';
import { afterEach, describe, expect, it, rs } from '@rstest/core';
import {
  ScreenRelayAgent,
  type ScreenRelayCapabilities,
  ScreenRelayDevice,
  sanitizeScreenRelayCliArgs,
} from '../../src';
import { ScreenRelayMidsceneTools } from '../../src/agent-tools';
import * as clientModule from '../../src/client';
import type { ScreenRelayClient } from '../../src/client';

function makeMinimalPngHeader(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(24);
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(buf.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return buf;
}

function makeFakeClient(backend = 'x11'): ScreenRelayClient {
  const caps: ScreenRelayCapabilities = {
    version: 1,
    backend,
    width: 1280,
    height: 720,
    fps: 60,
    input: {
      keyboard: true,
      pointer: true,
      buttons: true,
      wheel: true,
    },
    screenshot: '/screenshot.png',
    control: '/control',
    wayland: false,
    max_input_pending: 32,
    input_endpoint: '/input',
    max_input_batch: 256,
    cursor: false,
    audio: false,
    clipboard: true,
    resize: false,
    ime: false,
  };

  return {
    status: rs.fn(async () => ({ ok: true })),
    capabilities: rs.fn(async () => caps),
    screenshot: rs.fn(async () => makeMinimalPngHeader(1280, 720)),
    click: rs.fn(async () => ({ events: 2 })),
    move: rs.fn(async () => ({ events: 1 })),
    scroll: rs.fn(async () => ({ events: 1 })),
    key: rs.fn(async () => ({ events: 2 })),
    type: rs.fn(async () => ({ events: 1 })),
    input: rs.fn(async () => ({ events: 1 })),
    clipboard: rs.fn(async () => ''),
    setClipboard: rs.fn(async () => {}),
  };
}

describe('screen-relay CLI', () => {
  const url = 'http://127.0.0.1:18081';
  function run(rawArgv: string[]) {
    const { sanitizedArgv: argv, extractedToken } =
      sanitizeScreenRelayCliArgs(rawArgv);
    const tools = new ScreenRelayMidsceneTools(argv, extractedToken);
    return runToolsCLI(tools, 'midscene-screen-relay', {
      argv,
      version: 'test',
    }).finally(() => tools.destroy());
  }

  afterEach(() => {
    rs.restoreAllMocks();
    rs.unstubAllEnvs();
  });

  it('prints offline help, subcommand help, and version without creating a client', async () => {
    rs.stubEnv('MIDSCENE_SCREEN_RELAY_URL', url);
    const client = makeFakeClient();
    const createClient = rs
      .spyOn(clientModule, 'createDefaultScreenRelayClient')
      .mockReturnValue(client);
    const output = rs.spyOn(console, 'log').mockImplementation(() => {});

    for (const argv of [[], ['-h'], ['--help']]) {
      output.mockClear();
      await run(argv);
      const text = output.mock.calls.flat().join('\n');
      expect(text).toContain('Usage: midscene-screen-relay');
      expect(text).toMatch(/^ {2}scroll /m);
      expect(text).toMatch(/^ {2}status /m);
    }

    await run(['--version']);
    await run(['tap', '--help']);
    await run(['status', '--help']);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('filters root help for an explicit URL using relay capabilities', async () => {
    const client = makeFakeClient();
    const capabilities = await client.capabilities();
    capabilities.input.buttons = false;
    capabilities.input.wheel = false;
    const createClient = rs
      .spyOn(clientModule, 'createDefaultScreenRelayClient')
      .mockReturnValue(client);
    const connect = rs.spyOn(ScreenRelayDevice.prototype, 'connect');
    const output = rs.spyOn(console, 'log').mockImplementation(() => {});

    await run(['--verbose', '--help', '--url', `${url}/#token=viewer-token`]);

    expect(createClient).toHaveBeenCalledExactlyOnceWith({
      url,
      token: 'viewer-token',
      timeout: 15_000,
    });
    expect(client.capabilities).toHaveBeenCalledTimes(2);
    expect(connect).not.toHaveBeenCalled();
    expect(client.status).not.toHaveBeenCalled();
    const help = output.mock.calls.flat().join('\n');
    expect(help).toMatch(/^ {2}hover /m);
    expect(help).toMatch(/^ {2}status /m);
    expect(help).toMatch(/^ {2}playground /m);
    expect(help).not.toMatch(/^ {2}(tap|scroll) /m);
  });

  it('connects the Playground factory to the requested relay and surfaces connection errors', async () => {
    const client = makeFakeClient();
    rs.spyOn(client, 'capabilities').mockRejectedValue(
      new Error('relay unavailable'),
    );
    const createClient = rs
      .spyOn(clientModule, 'createDefaultScreenRelayClient')
      .mockReturnValue(client);
    rs.stubEnv('MIDSCENE_SCREEN_RELAY_URL', 'http://localhost:8080');
    rs.stubEnv('MIDSCENE_SCREEN_RELAY_TOKEN', 'env-token');
    await run(['playground', '--help']);
    expect(client.capabilities).not.toHaveBeenCalled();
    await expect(
      run(['playground', '--no-open', '--url', url]),
    ).rejects.toThrow('relay unavailable');
    expect(createClient).toHaveBeenLastCalledWith(
      expect.objectContaining({ url, token: 'env-token' }),
    );
  });

  it('validates options before connecting and connects once to dispatch an action', async () => {
    const client = makeFakeClient();
    rs.spyOn(clientModule, 'createDefaultScreenRelayClient').mockReturnValue(
      client,
    );
    const destroySpy = rs.spyOn(ScreenRelayDevice.prototype, 'destroy');
    const dispatch = rs
      .spyOn(ScreenRelayAgent.prototype, 'callActionInActionSpace')
      .mockResolvedValue(undefined);

    await expect(run(['tap', '--unknown-flag', '--url', url])).rejects.toThrow(
      /Unknown option/,
    );
    expect(client.capabilities).not.toHaveBeenCalled();

    destroySpy.mockClear();
    await run(['keyboardpress', '--key-name', 'Enter', '--url', url]);
    expect(dispatch).toHaveBeenCalledWith('KeyboardPress', {
      keyName: 'Enter',
    });
    expect(client.capabilities).toHaveBeenCalledTimes(1);

    expect(destroySpy).toHaveBeenCalledTimes(1);
  });

  it('refuses unsupported actions at execution time without invoking the input endpoint', async () => {
    rs.stubEnv('MIDSCENE_MODEL_NAME', 'test-model');
    rs.stubEnv('MIDSCENE_MODEL_API_KEY', 'test-key');
    rs.stubEnv('MIDSCENE_MODEL_BASE_URL', 'http://127.0.0.1:1/v1');
    rs.stubEnv('MIDSCENE_MODEL_FAMILY', 'qwen3-vl');
    const client = makeFakeClient();
    const caps = await client.capabilities();
    caps.input.wheel = false;
    rs.spyOn(clientModule, 'createDefaultScreenRelayClient').mockReturnValue(
      client,
    );
    const output = rs.spyOn(console, 'log').mockImplementation(() => {});
    const errOutput = rs.spyOn(console, 'error').mockImplementation(() => {});

    await run(['scroll', '--direction', 'down', '--url', url]);
    expect(client.scroll).not.toHaveBeenCalled();
    expect(output.mock.calls.flat().join('\n')).toContain(
      "Action type 'Scroll' is not in the current action space",
    );
    expect(errOutput).toHaveBeenCalled();
  });

  it('resolves status URL from --url or MIDSCENE_SCREEN_RELAY_URL and outputs the upstream status structure', async () => {
    const client = makeFakeClient();
    const caps = await client.capabilities();
    caps.screenshot = '';
    const metrics = { frames_encoded: 42 };
    rs.spyOn(client, 'status').mockResolvedValue(metrics);
    const factory = rs
      .spyOn(clientModule, 'createDefaultScreenRelayClient')
      .mockReturnValue(client);
    const output = rs.spyOn(console, 'log').mockImplementation(() => {});

    rs.stubEnv('MIDSCENE_SCREEN_RELAY_URL', '');
    for (const argv of [['status'], ['status', '--url=']]) {
      await expect(run(argv)).rejects.toThrow('Missing required option: --url');
    }
    expect(factory).not.toHaveBeenCalled();

    rs.stubEnv('MIDSCENE_SCREEN_RELAY_URL', 'http://localhost:8080');
    rs.stubEnv('MIDSCENE_SCREEN_RELAY_TOKEN', 'env-token');
    await expect(run(['status', '--url='])).rejects.toThrow(
      'Missing required option: --url',
    );
    expect(factory).not.toHaveBeenCalled();

    await run(['status']);
    expect(factory).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: 'http://localhost:8080',
        token: 'env-token',
        timeout: 15_000,
      }),
    );
    expect(JSON.parse(output.mock.calls.flat().join('\n'))).toEqual({
      session: {
        url: 'http://localhost:8080',
        state: 'ready',
        capabilities: caps,
        metrics,
      },
    });

    output.mockClear();
    await run([
      'status',
      '--url',
      `${url}/#token=viewer-token`,
      '--timeout-ms',
      '2345',
    ]);
    expect(factory).toHaveBeenLastCalledWith(
      expect.objectContaining({ url, token: 'viewer-token', timeout: 2345 }),
    );
    expect(JSON.parse(output.mock.calls.flat().join('\n'))).toEqual({
      session: { url, state: 'ready', capabilities: caps, metrics },
    });
    expect(client.capabilities).toHaveBeenCalledTimes(3);
    expect(client.status).toHaveBeenCalledTimes(2);
    expect(client.screenshot).not.toHaveBeenCalled();
    expect(client.scroll).not.toHaveBeenCalled();
  });
});
