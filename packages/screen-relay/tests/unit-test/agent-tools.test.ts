import { afterEach, describe, expect, it, rs } from '@rstest/core';
import {
  type ScreenRelayCapabilities,
  ScreenRelayMidsceneTools,
} from '../../src';
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

describe('ScreenRelayMidsceneTools', () => {
  afterEach(() => {
    rs.restoreAllMocks();
  });

  it('registers platform tools and handles connect, capabilities, and disconnect', async () => {
    const client = makeFakeClient('x11');
    const spy = rs
      .spyOn(clientModule, 'createDefaultScreenRelayClient')
      .mockReturnValue(client);

    const tools = new ScreenRelayMidsceneTools();
    await tools.initTools();

    const defs = new Map(tools.getToolDefinitions().map((d) => [d.name, d]));
    expect(defs.has('screen_relay_connect')).toBe(true);
    expect(defs.has('screen_relay_capabilities')).toBe(true);
    expect(defs.has('screen_relay_disconnect')).toBe(true);

    const connectRes = await defs.get('screen_relay_connect')?.handler({
      url: 'http://127.0.0.1:18080/#token=secret-tok',
    });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'http://127.0.0.1:18080',
        token: 'secret-tok',
      }),
    );
    const connectText = connectRes?.content.find((c) => c.type === 'text');
    expect(
      connectText && 'text' in connectText ? connectText.text : '',
    ).toContain('ScreenRelay (http://127.0.0.1:18080, x11, 1280x720)');
    expect(
      connectText && 'text' in connectText ? connectText.text : '',
    ).not.toContain('secret-tok');

    const capsRes = await defs.get('screen_relay_capabilities')?.handler({});
    const capsText = capsRes?.content.find((c) => c.type === 'text');
    expect(
      JSON.parse(capsText && 'text' in capsText ? capsText.text : '{}'),
    ).toMatchObject({ backend: 'x11', width: 1280, height: 720 });

    const disconnectRes = await defs
      .get('screen_relay_disconnect')
      ?.handler({});
    expect(disconnectRes?.isError).not.toBe(true);
  });

  it('rebuilds the agent when connection init args change', async () => {
    const firstClient = makeFakeClient('x11');
    const secondClient = makeFakeClient('macos');
    const spy = rs
      .spyOn(clientModule, 'createDefaultScreenRelayClient')
      .mockImplementation((opts) =>
        opts.url === 'http://127.0.0.1:18081' ? secondClient : firstClient,
      );

    const tools = new ScreenRelayMidsceneTools();
    await tools.initTools();
    spy.mockClear();
    const capsTool = tools
      .getToolDefinitions()
      .find((d) => d.name === 'screen_relay_capabilities');

    const firstRes = await capsTool?.handler({
      url: 'http://127.0.0.1:18080',
    });
    const firstText = firstRes?.content.find((c) => c.type === 'text');
    expect(
      JSON.parse(firstText && 'text' in firstText ? firstText.text : '{}')
        .backend,
    ).toBe('x11');

    const secondRes = await capsTool?.handler({
      url: 'http://127.0.0.1:18081',
    });
    const secondText = secondRes?.content.find((c) => c.type === 'text');
    expect(
      JSON.parse(secondText && 'text' in secondText ? secondText.text : '{}')
        .backend,
    ).toBe('macos');

    expect(spy).toHaveBeenCalledTimes(2);

    await tools
      .getToolDefinitions()
      .find((d) => d.name === 'screen_relay_disconnect')
      ?.handler({});
  });
});
