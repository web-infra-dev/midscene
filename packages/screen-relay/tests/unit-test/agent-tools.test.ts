import { runToolsCLI } from '@midscene/shared/cli';
import { afterEach, describe, expect, it, rs } from '@rstest/core';
import {
  ScreenRelayAgent,
  type ScreenRelayCapabilities,
  ScreenRelayDevice,
} from '../../src';
import {
  ScreenRelayMidsceneTools,
  normalizeScreenRelayHelpArgv,
} from '../../src/agent-tools';
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

describe('screen-relay CLI command discovery', () => {
  const url = 'http://127.0.0.1:18081';
  function run(rawArgv: string[]) {
    const argv = normalizeScreenRelayHelpArgv(rawArgv);
    const tools = new ScreenRelayMidsceneTools(argv);
    return runToolsCLI(tools, 'midscene-screen-relay', {
      argv,
      version: 'test',
    }).finally(() => tools.destroy());
  }

  afterEach(() => {
    rs.restoreAllMocks();
    rs.unstubAllEnvs();
  });

  it('prints offline help, subcommand help, and version without network calls when no URL is set', async () => {
    rs.stubEnv('MIDSCENE_SCREEN_RELAY_URL', '');
    const client = makeFakeClient();
    rs.spyOn(clientModule, 'createDefaultScreenRelayClient').mockReturnValue(
      client,
    );
    const output = rs.spyOn(console, 'log').mockImplementation(() => {});

    for (const argv of [[], ['-h'], ['--help'], ['tap', '--help']]) {
      output.mockClear();
      await run(argv);
      const text = output.mock.calls.flat().join('\n');
      expect(text).toContain('Usage: midscene-screen-relay');
    }

    rs.stubEnv('MIDSCENE_SCREEN_RELAY_URL', url);
    await run(['--version']);
    await run(['tap', '--help']);
    expect(client.capabilities).not.toHaveBeenCalled();
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

  it('reuses the discovered device to dispatch supported actions and cleans up on validation failure', async () => {
    const client = makeFakeClient();
    rs.spyOn(clientModule, 'createDefaultScreenRelayClient').mockReturnValue(
      client,
    );
    const destroySpy = rs.spyOn(ScreenRelayDevice.prototype, 'destroy');
    const dispatch = rs
      .spyOn(ScreenRelayAgent.prototype, 'callActionInActionSpace')
      .mockResolvedValue(undefined);

    await run(['keyboardpress', '--key-name', 'Enter', '--url', url]);
    expect(dispatch).toHaveBeenCalledWith('KeyboardPress', {
      keyName: 'Enter',
    });
    expect(client.capabilities).toHaveBeenCalledTimes(1);

    destroySpy.mockClear();
    await expect(run(['tap', '--unknown-flag', '--url', url])).rejects.toThrow(
      /Unknown option/,
    );
    expect(destroySpy).toHaveBeenCalled();
  });

  it('uses live capabilities for help regardless of flag order and rejects unavailable actions before execution', async () => {
    const client = makeFakeClient();
    const caps = await client.capabilities();
    caps.input.wheel = false;
    const factory = rs
      .spyOn(clientModule, 'createDefaultScreenRelayClient')
      .mockReturnValue(client);
    const destroySpy = rs.spyOn(ScreenRelayDevice.prototype, 'destroy');
    const output = rs.spyOn(console, 'log').mockImplementation(() => {});

    for (const argv of [
      [
        '--verbose',
        '--deep-locate',
        '--help',
        '--url',
        url,
        '--timeout-ms',
        '2345',
      ],
      ['--url', url, '--timeout-ms', '2345', '--help'],
    ]) {
      output.mockClear();
      destroySpy.mockClear();
      await run(argv);
      expect(factory).toHaveBeenLastCalledWith(
        expect.objectContaining({ url, timeout: 2345 }),
      );
      const help = output.mock.calls.flat().join('\n');
      expect(help).toMatch(/^ {2}tap /m);
      expect(help).not.toMatch(/^ {2}(scroll|capabilities) /m);
      expect(destroySpy).toHaveBeenCalled();
    }

    rs.stubEnv('MIDSCENE_SCREEN_RELAY_URL', url);
    await expect(run(['scroll', '--direction', 'down'])).rejects.toThrow(
      'does not support "scroll"',
    );
    expect(client.screenshot).not.toHaveBeenCalled();
    expect(client.scroll).not.toHaveBeenCalled();
  });
});
