import { afterEach, describe, expect, it, rs } from '@rstest/core';
import { RelayError } from 'screen-relay';
import {
  MIDSCENE_SCREEN_RELAY_TOKEN,
  MIDSCENE_SCREEN_RELAY_URL,
  type ScreenRelayCapabilities,
  ScreenRelayDevice,
  agentForScreenRelay,
  normalizeScreenRelayKey,
  parseScreenRelayTarget,
  readPngDimensions,
  sanitizeScreenRelayCliArgs,
} from '../../src';
import * as clientModule from '../../src/client';
import type {
  ScreenRelayClient,
  ScreenRelayInputEvent,
} from '../../src/client';

function makeMinimalPngHeader(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(24);
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(buf.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return buf;
}

function makeCapabilities(
  overrides?: Partial<ScreenRelayCapabilities>,
): ScreenRelayCapabilities {
  return {
    version: 1,
    backend: 'x11',
    width: 1000,
    height: 500,
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
    ...overrides,
  };
}

function createFakeClient(opts?: {
  capabilities?: Partial<ScreenRelayCapabilities>;
  screenshotSize?: { width: number; height: number };
  onInputError?: Error;
  previousClipboard?: string;
}) {
  const caps = makeCapabilities(opts?.capabilities);
  const pngWidth = opts?.screenshotSize?.width ?? caps.width;
  const pngHeight = opts?.screenshotSize?.height ?? caps.height;
  const pngBytes = makeMinimalPngHeader(pngWidth, pngHeight);

  const client: ScreenRelayClient = {
    status: rs.fn(async () => ({ ok: true })),
    capabilities: rs.fn(async () => caps),
    screenshot: rs.fn(async () => pngBytes),
    click: rs.fn(async () => {
      if (opts?.onInputError) throw opts.onInputError;
      return { events: 2 };
    }),
    move: rs.fn(async () => {
      if (opts?.onInputError) throw opts.onInputError;
      return { events: 1 };
    }),
    scroll: rs.fn(async () => {
      if (opts?.onInputError) throw opts.onInputError;
      return { events: 1 };
    }),
    key: rs.fn(async () => {
      if (opts?.onInputError) throw opts.onInputError;
      return { events: 2 };
    }),
    type: rs.fn(async () => {
      if (opts?.onInputError) throw opts.onInputError;
      return { events: 1 };
    }),
    input: rs.fn(async (_events: ScreenRelayInputEvent[]) => {
      if (opts?.onInputError) throw opts.onInputError;
      return { events: _events.length };
    }),
    clipboard: rs.fn(async () => opts?.previousClipboard ?? ''),
    setClipboard: rs.fn(async () => {}),
  };

  rs.spyOn(clientModule, 'createDefaultScreenRelayClient').mockReturnValue(
    client,
  );

  return { client, caps };
}

describe('target parsing and helpers', () => {
  const origUrl = process.env[MIDSCENE_SCREEN_RELAY_URL];
  const origToken = process.env[MIDSCENE_SCREEN_RELAY_TOKEN];

  afterEach(() => {
    if (origUrl === undefined) {
      delete process.env[MIDSCENE_SCREEN_RELAY_URL];
    } else {
      process.env[MIDSCENE_SCREEN_RELAY_URL] = origUrl;
    }
    if (origToken === undefined) {
      delete process.env[MIDSCENE_SCREEN_RELAY_TOKEN];
    } else {
      process.env[MIDSCENE_SCREEN_RELAY_TOKEN] = origToken;
    }
  });

  it('extracts #token= from Viewer URL and normalizes to pure origin', () => {
    const resolved = parseScreenRelayTarget({
      url: 'http://127.0.0.1:18080/viewer?foo=1#token=abc123',
    });
    expect(resolved).toEqual({
      url: 'http://127.0.0.1:18080',
      token: 'abc123',
    });
  });

  it('prefers explicit token over URL token and falls back to env', () => {
    expect(
      parseScreenRelayTarget({
        url: 'http://127.0.0.1:8080/?token=from-query',
        token: 'explicit-token',
      }),
    ).toEqual({
      url: 'http://127.0.0.1:8080',
      token: 'explicit-token',
    });

    process.env[MIDSCENE_SCREEN_RELAY_URL] = 'http://10.0.0.5:8080/';
    process.env[MIDSCENE_SCREEN_RELAY_TOKEN] = 'env-token';
    expect(parseScreenRelayTarget()).toEqual({
      url: 'http://10.0.0.5:8080',
      token: 'env-token',
    });
  });

  it('rejects invalid or non-http URLs', () => {
    expect(() => parseScreenRelayTarget({ url: 'not-a-url' })).toThrow(
      /Invalid screen-relay URL/,
    );
    expect(() =>
      parseScreenRelayTarget({ url: 'ws://127.0.0.1:8080' }),
    ).toThrow(/Unsupported screen-relay URL protocol/);
  });

  it('reads PNG dimensions from IHDR header', () => {
    expect(readPngDimensions(makeMinimalPngHeader(1920, 1080))).toEqual({
      width: 1920,
      height: 1080,
    });
    expect(readPngDimensions(new Uint8Array([1, 2, 3]))).toBeUndefined();
  });

  it('normalizes key combos without injecting Shift or breaking literal +', () => {
    expect(normalizeScreenRelayKey('Control+A')).toBe('Control+a');
    expect(normalizeScreenRelayKey('Command+C')).toBe('Meta+c');
    expect(normalizeScreenRelayKey('Option+Del')).toBe('Alt+Delete');
    expect(normalizeScreenRelayKey('Control++')).toBe('Control++');
    expect(normalizeScreenRelayKey('+')).toBe('+');
    expect(normalizeScreenRelayKey(' ')).toBe('Space');
    expect(normalizeScreenRelayKey('A')).toBe('A');
    expect(() => normalizeScreenRelayKey('   ')).toThrow(/cannot be empty/);
  });

  it('strips --token and URL #token= from CLI argv before logging', () => {
    expect(
      sanitizeScreenRelayCliArgs([
        'connect',
        '--url',
        'http://127.0.0.1:8080/#token=secret-hash',
      ]),
    ).toEqual({
      sanitizedArgv: ['connect', '--url', 'http://127.0.0.1:8080'],
      extractedToken: 'secret-hash',
    });

    expect(
      sanitizeScreenRelayCliArgs([
        'act',
        '--url=http://127.0.0.1:8080/?token=q-tok',
        '--token',
        'flag-tok',
        '--prompt',
        'click',
      ]),
    ).toEqual({
      sanitizedArgv: [
        'act',
        '--url=http://127.0.0.1:8080',
        '--prompt',
        'click',
      ],
      extractedToken: 'flag-tok',
    });
  });
});

describe('ScreenRelayDevice', () => {
  afterEach(() => {
    rs.restoreAllMocks();
  });

  it('connects, reports sanitized description, and updates size from PNG header', async () => {
    createFakeClient({
      capabilities: { backend: 'macos', width: 1000, height: 500 },
      screenshotSize: { width: 2000, height: 1000 },
    });

    const device = new ScreenRelayDevice({
      url: 'http://127.0.0.1:8080/#token=secret-token',
    });

    const caps = await device.connect();
    expect(caps.backend).toBe('macos');
    expect(device.getCapabilities()).toEqual(caps);
    expect(device.describe()).not.toContain('secret-token');
    expect(device.describe()).toContain('http://127.0.0.1:8080');

    const dataUrl = await device.screenshotBase64();
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(await device.size()).toEqual({ width: 2000, height: 1000 });
  });

  it('dynamically prunes actionSpace based on capabilities.input', async () => {
    createFakeClient({
      capabilities: {
        input: {
          keyboard: false,
          pointer: true,
          buttons: false,
          wheel: false,
        },
      },
    });

    const device = new ScreenRelayDevice();
    const beforeNames = device.actionSpace().map((a) => a.name);
    expect(beforeNames).toContain('Tap');
    expect(beforeNames).toContain('DragAndDrop');
    expect(beforeNames).toContain('Swipe');
    expect(beforeNames).not.toContain('LongPress');
    expect(beforeNames).toContain('Input');
    expect(beforeNames).toContain('Scroll');

    await device.connect();
    const afterNames = device.actionSpace().map((a) => a.name);
    expect(afterNames).toEqual(['Hover']);
  });

  it('normalizes coordinates, focuses locate target on Input, and handles Scroll directions', async () => {
    const { client } = createFakeClient({
      capabilities: { backend: 'macos', width: 1000, height: 500 },
    });
    const device = new ScreenRelayDevice();
    await device.connect();

    const actions = new Map(device.actionSpace().map((a) => [a.name, a]));

    await actions.get('Input')?.call({
      value: 'café',
      mode: 'replace',
      locate: {
        center: [500, 250],
        rect: { left: 400, top: 230, width: 200, height: 40 },
      },
    });
    expect(client.click).toHaveBeenCalledWith(0.5, 0.5, { button: 'left' });
    expect(client.key).toHaveBeenCalledWith('Meta+a', 'Backspace');
    expect(client.type).toHaveBeenCalledWith('café');
    expect(client.setClipboard).not.toHaveBeenCalled();

    await actions.get('Scroll')?.call({
      scrollType: 'singleAction',
      distance: 240,
    });
    expect(client.scroll).toHaveBeenCalledWith(0.5, 0.5, { dx: 0, dy: 2 });

    await actions.get('Scroll')?.call({
      scrollType: 'scrollToLeft',
    });
    expect(client.scroll).toHaveBeenCalledWith(0.5, 0.5, { dx: -24, dy: 0 });

    await actions.get('Scroll')?.call({
      scrollType: 'scrollToRight',
    });
    expect(client.scroll).toHaveBeenCalledWith(0.5, 0.5, { dx: 24, dy: 0 });
  });

  it('uses clipboard paste + restore for CJK text when ime is false, and on unsupported_input', async () => {
    const { client } = createFakeClient({
      capabilities: { backend: 'x11', ime: false, clipboard: true },
      previousClipboard: 'old-clip',
    });

    const device = new ScreenRelayDevice();
    await device.connect();

    const inputAction = device.actionSpace().find((a) => a.name === 'Input');
    await inputAction?.call({
      value: '北京天气',
      mode: 'typeOnly',
    });

    expect(client.type).not.toHaveBeenCalled();
    expect(client.setClipboard).toHaveBeenNthCalledWith(1, '北京天气');
    expect(client.key).toHaveBeenCalledWith('Control+v');
    expect(client.setClipboard).toHaveBeenNthCalledWith(2, 'old-clip');
  });

  it('uses a short-lived /control session for DragAndDrop and releases + closes on error', async () => {
    const { client } = createFakeClient();
    const sentEvents: ScreenRelayInputEvent[] = [];
    const closeSpy = rs.fn(() => {});
    client.openControlSession = rs.fn(async () => ({
      input: rs.fn(async (event: ScreenRelayInputEvent) => {
        sentEvents.push(event);
        if (sentEvents.length === 4) {
          throw new RelayError('control_taken', 'Viewer took control');
        }
      }),
      close: closeSpy,
    }));

    const device = new ScreenRelayDevice();
    await device.connect();

    const dragAction = device
      .actionSpace()
      .find((a) => a.name === 'DragAndDrop');

    await expect(
      dragAction?.call({
        from: {
          center: [100, 100],
          rect: { left: 0, top: 0, width: 10, height: 10 },
        },
        to: {
          center: [500, 250],
          rect: { left: 0, top: 0, width: 10, height: 10 },
        },
      }),
    ).rejects.toThrow(/input control is currently held/);

    expect(client.openControlSession).toHaveBeenCalledTimes(1);
    expect(sentEvents[0]?.type).toBe('pointerMove');
    expect(sentEvents[1]?.type).toBe('buttonDown');
    expect(sentEvents[sentEvents.length - 1]?.type).toBe('buttonUp');
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('does not send buttonUp when DragAndDrop fails before buttonDown succeeds', async () => {
    const { client } = createFakeClient();
    const sentEvents: ScreenRelayInputEvent[] = [];
    const closeSpy = rs.fn(() => {});
    client.openControlSession = rs.fn(async () => ({
      input: rs.fn(async (event: ScreenRelayInputEvent) => {
        sentEvents.push(event);
        if (event.type === 'buttonDown') {
          throw new RelayError('control_taken', 'Viewer took control');
        }
      }),
      close: closeSpy,
    }));

    const device = new ScreenRelayDevice();
    await device.connect();

    const dragAction = device
      .actionSpace()
      .find((a) => a.name === 'DragAndDrop');

    await expect(
      dragAction?.call({
        from: {
          center: [100, 100],
          rect: { left: 0, top: 0, width: 10, height: 10 },
        },
        to: {
          center: [500, 250],
          rect: { left: 0, top: 0, width: 10, height: 10 },
        },
      }),
    ).rejects.toThrow(/input control is currently held/);

    expect(sentEvents.map((e) => e.type)).toEqual([
      'pointerMove',
      'buttonDown',
    ]);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects non-positive or non-finite timeoutMs in ScreenRelayDevice constructor', () => {
    expect(() => new ScreenRelayDevice({ timeoutMs: 0 })).toThrow(
      /Invalid timeoutMs/,
    );
    expect(() => new ScreenRelayDevice({ timeoutMs: -100 })).toThrow(
      /Invalid timeoutMs/,
    );
    expect(() => new ScreenRelayDevice({ timeoutMs: Number.NaN })).toThrow(
      /Invalid timeoutMs/,
    );
    expect(
      () => new ScreenRelayDevice({ timeoutMs: Number.POSITIVE_INFINITY }),
    ).toThrow(/Invalid timeoutMs/);
  });

  it('rejects connect when screenshot capability is unavailable', async () => {
    createFakeClient({
      capabilities: { screenshot: '' },
    });
    const device = new ScreenRelayDevice();
    await expect(device.connect()).rejects.toThrow(
      /does not expose screenshot capability/,
    );
  });

  it('creates and destroys agent via agentForScreenRelay', async () => {
    createFakeClient();
    const agent = await agentForScreenRelay({
      url: 'http://127.0.0.1:8080',
      generateReport: false,
    });
    expect(agent.interface.getCapabilities()?.backend).toBe('x11');
    await agent.destroy();
    await expect(agent.interface.size()).rejects.toThrow(/has been destroyed/);
    await expect(agent.interface.connect()).rejects.toThrow(
      /has been destroyed/,
    );
  });

  it('throws when size or screenshotBase64 is called before connect()', async () => {
    createFakeClient();
    const device = new ScreenRelayDevice();
    await expect(device.size()).rejects.toThrow(/not connected/);
    await expect(device.screenshotBase64()).rejects.toThrow(/not connected/);
  });

  it('covers DoubleClick, RightClick, MiddleClick, Hover, Swipe, KeyboardPress, ClearInput, and customActions', async () => {
    const { client } = createFakeClient({
      capabilities: { backend: 'x11', width: 1000, height: 500 },
    });
    const sessionEvents: ScreenRelayInputEvent[] = [];
    const closeSpy = rs.fn(() => {});
    client.openControlSession = rs.fn(async () => ({
      input: rs.fn(async (event: ScreenRelayInputEvent) => {
        sessionEvents.push(event);
      }),
      close: closeSpy,
    }));

    const customActionCalled = rs.fn(async () => {});
    const device = new ScreenRelayDevice({
      customActions: [
        {
          name: 'CustomPing',
          description: 'Custom test action',
          call: customActionCalled,
        },
      ],
    });
    await device.connect();

    const actions = new Map(device.actionSpace().map((a) => [a.name, a]));
    const target = {
      center: [250, 125] as [number, number],
      rect: { left: 240, top: 115, width: 20, height: 20 },
    };

    await actions.get('DoubleClick')?.call({ locate: target });
    expect(client.click).toHaveBeenCalledTimes(2);

    await actions.get('RightClick')?.call({ locate: target });
    expect(client.click).toHaveBeenCalledWith(0.25, 0.25, { button: 'right' });

    await actions.get('MiddleClick')?.call({ locate: target });
    expect(client.click).toHaveBeenCalledWith(0.25, 0.25, { button: 'middle' });

    await actions.get('Hover')?.call({ locate: target });
    expect(client.move).toHaveBeenCalledWith(0.25, 0.25);

    await actions.get('KeyboardPress')?.call({ keyName: 'Control+A' });
    expect(client.key).toHaveBeenCalledWith('Control+a');

    await actions.get('ClearInput')?.call({ locate: target });
    expect(client.key).toHaveBeenCalledWith('Control+a', 'Backspace');

    await actions.get('Swipe')?.call({
      start: target,
      end: {
        center: [750, 125],
        rect: { left: 740, top: 115, width: 20, height: 20 },
      },
      duration: 60,
      repeat: 2,
    });
    expect(client.openControlSession).toHaveBeenCalledTimes(2);
    expect(closeSpy).toHaveBeenCalledTimes(2);
    expect(sessionEvents.some((e) => e.type === 'buttonDown')).toBe(true);
    expect(sessionEvents.some((e) => e.type === 'buttonUp')).toBe(true);

    await actions.get('CustomPing')?.call({});
    expect(customActionCalled).toHaveBeenCalledTimes(1);
  });
});
