import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from '@rstest/core';

import {
  type FakeCommandResponse,
  FakeCommandRunner,
  joinShellCommand,
} from '../../src/transport/command-runner';
import { RishTransport } from '../../src/transport/rish';

const fixtureDir = path.join(__dirname, 'fixtures');
const dumpsysDisplay = fs.readFileSync(
  path.join(fixtureDir, 'dumpsys-display.txt'),
  'utf8',
);
const wmSize = fs.readFileSync(path.join(fixtureDir, 'wm-size.txt'), 'utf8');
const wmDensity = fs.readFileSync(
  path.join(fixtureDir, 'wm-density.txt'),
  'utf8',
);

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const RISH = '/data/local/tmp/rish';

function deviceResponses(): FakeCommandResponse[] {
  return [
    { match: ['id -u'], stdout: '2000\n' },
    { match: ['command -v screencap'], stdout: '/system/bin/screencap\n' },
    { match: ['command -v input'], stdout: '/system/bin/input\n' },
    { match: ['command -v am'], stdout: '/system/bin/am\n' },
    { match: ['dumpsys display'], stdout: dumpsysDisplay },
    { match: ['wm size'], stdout: wmSize },
    { match: ['wm density'], stdout: wmDensity },
  ];
}

function createTransport(
  responses: FakeCommandResponse[],
  options: { displayId?: number; displayCacheTtlMs?: number } = {},
) {
  const runner = new FakeCommandRunner(responses);
  const transport = new RishTransport({
    rishPath: RISH,
    runner,
    displayCacheTtlMs: options.displayCacheTtlMs ?? 0,
    displayId: options.displayId,
  });

  return { runner, transport };
}

/** Assert the exact rish argv of one recorded call. */
function expectRishCommand(
  runner: FakeCommandRunner,
  index: number,
  command: string,
) {
  expect(runner.calls[index]?.argv).toEqual(['sh', RISH, '-c', command]);
}

describe('RishTransport capability probing', () => {
  test('detects the shell uid, available commands and multiple displays', async () => {
    const { runner, transport } = createTransport(deviceResponses());

    const capabilities = await transport.getCapabilities();

    expect(capabilities.backend).toBe('rish');
    expect(capabilities.shell).toBe(true);
    expect(capabilities.screenshot).toBe(true);
    expect(capabilities.input).toBe(true);
    expect(capabilities.appManagement).toBe(true);
    expect(capabilities.multiDisplay).toBe(true);
    expect(capabilities.textInput).toBe('ascii-only');
    expect(capabilities.privileged).toBe(true);
    expect(capabilities.uid).toBe(2000);
    // The probe must go through rish, never a local shell.
    expectRishCommand(runner, 0, 'id -u');
  });

  test('caches the probe result', async () => {
    const { runner, transport } = createTransport(deviceResponses());

    await transport.getCapabilities();
    const callsAfterFirstProbe = runner.calls.length;
    await transport.getCapabilities();

    expect(runner.calls.length).toBe(callsAfterFirstProbe);
  });

  test('shares one in-flight probe between concurrent callers', async () => {
    const { runner, transport } = createTransport(
      deviceResponses().map((response) => ({ ...response, delayMs: 5 })),
    );

    await Promise.all([
      transport.getCapabilities(),
      transport.getCapabilities(),
    ]);

    expect(
      runner.commands.filter((command) => command.includes('id -u')),
    ).toHaveLength(1);
  });

  test('flags an unprivileged uid instead of pretending to be adb shell', async () => {
    const { transport } = createTransport([
      { match: ['id -u'], stdout: '10123\n' },
      { match: ['command -v'], stdout: '/system/bin/whatever\n' },
      { match: ['dumpsys display'], stdout: dumpsysDisplay },
      { match: ['wm size'], stdout: wmSize },
      { match: ['wm density'], stdout: wmDensity },
    ]);

    const capabilities = await transport.getCapabilities();

    expect(capabilities.privileged).toBe(false);
    expect(capabilities.uid).toBe(10123);
  });

  test('treats missing commands as unsupported capabilities', async () => {
    const { transport } = createTransport([
      { match: ['id -u'], stdout: '2000\n' },
      { match: ['command -v'], exitCode: 1 },
      { match: ['dumpsys display'], stdout: dumpsysDisplay },
      { match: ['wm size'], stdout: wmSize },
      { match: ['wm density'], stdout: wmDensity },
    ]);

    const capabilities = await transport.getCapabilities();

    expect(capabilities.screenshot).toBe(false);
    expect(capabilities.input).toBe(false);
    expect(capabilities.appManagement).toBe(false);
  });

  test('reports ServiceUnavailable when rish cannot be started at all', async () => {
    const { transport } = createTransport([
      {
        match: [],
        failure: { kind: 'spawn-failed', message: 'rish: not found' },
      },
    ]);

    const error = await transport
      .getCapabilities()
      .catch((caught: unknown) => caught);

    expect((error as { code?: string }).code).toBe('ServiceUnavailable');
    expect((error as Error).message).toContain('rish: not found');
  });
});

describe('RishTransport health check', () => {
  test('reports a healthy shell channel', async () => {
    const { transport } = createTransport(deviceResponses());

    const health = await transport.healthCheck();

    expect(health.ok).toBe(true);
    expect(health.uid).toBe(2000);
    expect(health.details).toBeUndefined();
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test('never throws when rish is broken', async () => {
    const { transport } = createTransport([
      { match: ['id -u'], exitCode: 1, stderr: 'shizuku service not running' },
    ]);

    const health = await transport.healthCheck();

    expect(health.ok).toBe(false);
    expect(health.details).toContain('ServiceUnavailable');
  });

  test('reports a closed transport as unhealthy', async () => {
    const { transport } = createTransport(deviceResponses());
    await transport.close();

    const health = await transport.healthCheck();

    expect(health.ok).toBe(false);
    expect(health.details).toBe('transport is closed');
  });
});

describe('RishTransport screenshot', () => {
  test('fetches PNG bytes through the base64 pipe without touching disk', async () => {
    const { runner, transport } = createTransport([
      { match: ['| base64 -w0'], stdout: `${PNG_BYTES.toString('base64')}\n` },
    ]);

    const buffer = await transport.screenshot();

    expect(buffer.equals(PNG_BYTES)).toBe(true);
    expectRishCommand(runner, 0, 'screencap -p | base64 -w0');
    expect(runner.commands[0]).not.toContain('> ');
  });

  test('targets the requested display', async () => {
    const { runner, transport } = createTransport([
      { match: ['| base64 -w0'], stdout: PNG_BYTES.toString('base64') },
    ]);

    await transport.screenshot({ displayId: 10 });

    expectRishCommand(runner, 0, 'screencap -p -d 10 | base64 -w0');
  });

  test('uses the transport default display when the caller omits it', async () => {
    const { runner, transport } = createTransport(
      [{ match: ['| base64 -w0'], stdout: PNG_BYTES.toString('base64') }],
      { displayId: 1 },
    );

    await transport.screenshot();

    expectRishCommand(runner, 0, 'screencap -p -d 1 | base64 -w0');
  });

  test('accepts a JPEG payload', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const { transport } = createTransport([
      { match: ['| base64 -w0'], stdout: jpeg.toString('base64') },
    ]);

    const buffer = await transport.screenshot();

    expect(buffer.equals(jpeg)).toBe(true);
  });

  test('falls back to a binary pipe when base64 output is not an image', async () => {
    const { runner, transport } = createTransport([
      { match: ['| base64 -w0'], stdout: 'this is not an image' },
      { match: /screencap -p$/, stdout: PNG_BYTES },
    ]);

    const buffer = await transport.screenshot();

    expect(buffer.equals(PNG_BYTES)).toBe(true);
    expect(runner.calls).toHaveLength(2);
    expectRishCommand(runner, 1, 'screencap -p');
  });

  test('fails with ScreenshotFailed and keeps diagnostics when every path fails', async () => {
    const { transport } = createTransport([
      { match: ['| base64 -w0'], exitCode: 1, stderr: 'permission denied' },
      { match: /screencap -p$/, exitCode: 1, stderr: 'permission denied' },
    ]);

    const error = await transport
      .screenshot()
      .catch((caught: unknown) => caught);

    expect((error as { code?: string }).code).toBe('ScreenshotFailed');
    expect((error as Error).message).toContain('permission denied');
  });

  test('surfaces a timeout instead of falling back blindly', async () => {
    const { runner, transport } = createTransport([
      { match: ['screencap'], failure: { kind: 'timeout' } },
    ]);

    const error = await transport
      .screenshot({ timeoutMs: 5 })
      .catch((caught: unknown) => caught);

    expect((error as { code?: string }).code).toBe('Timeout');
    expect(runner.calls).toHaveLength(1);
  });

  test('rejects an invalid display id', async () => {
    const { transport } = createTransport([]);

    const error = await transport
      .screenshot({ displayId: -1 })
      .catch((caught: unknown) => caught);

    expect((error as { code?: string }).code).toBe('InvalidArgument');
  });
});

describe('RishTransport display information', () => {
  test('returns the default display from dumpsys output', async () => {
    const { transport } = createTransport(deviceResponses());

    const display = await transport.getDisplayInfo();

    expect(display.id).toBe(0);
    expect(display.name).toBe('Built-in Screen');
    expect(display.width).toBe(2560);
    expect(display.height).toBe(1600);
    expect(display.density).toBe(320);
    expect(display.isDefault).toBe(true);
    expect(display.isVirtual).toBe(false);
  });

  test('lists virtual displays alongside the internal one', async () => {
    const { transport } = createTransport(deviceResponses());

    const displays = await transport.listDisplays();

    expect(displays.map((display) => display.id)).toEqual([0, 10]);
    expect(displays[1].isVirtual).toBe(true);
  });

  test('rejects an unknown display id with the available ids', async () => {
    const { transport } = createTransport(deviceResponses());

    const error = await transport
      .getDisplayInfo({ displayId: 99 })
      .catch((caught: unknown) => caught);

    expect((error as { code?: string }).code).toBe('InvalidArgument');
    expect((error as Error).message).toContain('0, 10');
  });

  test('caches display queries within the TTL', async () => {
    const { runner, transport } = createTransport(deviceResponses(), {
      displayCacheTtlMs: 60_000,
    });

    await transport.listDisplays();
    const callsAfterFirst = runner.calls.length;
    await transport.listDisplays();
    await transport.getDisplayInfo({ displayId: 10 });

    expect(runner.calls.length).toBe(callsAfterFirst);
  });

  test('reports CommandFailed when dumpsys itself fails', async () => {
    const { transport } = createTransport([
      { match: ['dumpsys display'], exitCode: 1, stderr: 'died' },
      { match: ['wm size'], stdout: wmSize },
      { match: ['wm density'], stdout: wmDensity },
    ]);

    const error = await transport
      .getDisplayInfo()
      .catch((caught: unknown) => caught);

    expect((error as { code?: string }).code).toBe('CommandFailed');
  });
});

describe('RishTransport input commands', () => {
  test('taps in device pixels', async () => {
    const { runner, transport } = createTransport([{ match: [], stdout: '' }]);

    await transport.tap(10.4, 20.6);

    expect(runner.calls).toHaveLength(1);
    expectRishCommand(runner, 0, 'input tap 10 21');
  });

  test('turns a duration into a long press', async () => {
    const { runner, transport } = createTransport([{ match: [], stdout: '' }]);

    await transport.tap(10, 20, { durationMs: 1500 });

    expectRishCommand(runner, 0, 'input swipe 10 20 10 20 1500');
  });

  test('swipes with an explicit duration and display', async () => {
    const { runner, transport } = createTransport([{ match: [], stdout: '' }]);

    await transport.swipe(
      { x: 10, y: 20 },
      { x: 30, y: 40 },
      {
        displayId: 1,
        durationMs: 120,
      },
    );

    expectRishCommand(runner, 0, 'input -d 1 swipe 10 20 30 40 120');
  });

  test('defaults the swipe duration', async () => {
    const { runner, transport } = createTransport([{ match: [], stdout: '' }]);

    await transport.swipe({ x: 1, y: 2 }, { x: 3, y: 4 });

    expectRishCommand(runner, 0, 'input swipe 1 2 3 4 300');
  });

  test('sends one or many keycodes in a single call', async () => {
    const { runner, transport } = createTransport([{ match: [], stdout: '' }]);

    await transport.keyEvent(3);
    await transport.keyEvent([4, 3, 187]);

    expectRishCommand(runner, 0, 'input keyevent 3');
    expectRishCommand(runner, 1, 'input keyevent 4 3 187');
  });

  test('sends ASCII text as one quoted argument', async () => {
    const { runner, transport } = createTransport([{ match: [], stdout: '' }]);

    await transport.inputText('hello world');

    expectRishCommand(runner, 0, "input text 'hello world'");
  });

  test('splits newlines and commits each line with ENTER', async () => {
    const { runner, transport } = createTransport([{ match: [], stdout: '' }]);

    await transport.inputText('line1\nline2');

    expectRishCommand(runner, 0, "input text 'line1'");
    expectRishCommand(runner, 1, 'input keyevent 66');
    expectRishCommand(runner, 2, "input text 'line2'");
  });

  test('refuses non-ASCII text instead of typing nothing', async () => {
    const { runner, transport } = createTransport([{ match: [], stdout: '' }]);

    for (const value of ['中文', 'café', '🙂']) {
      const error = await transport
        .inputText(value)
        .catch((caught: unknown) => caught);
      expect((error as { code?: string }).code).toBe('NotSupported');
    }

    expect(runner.commands).toHaveLength(0);
  });

  test('reports a failed input command with the command that failed', async () => {
    const { transport } = createTransport([
      { match: ['input tap'], exitCode: 1, stderr: 'SecurityException' },
    ]);

    const error = await transport.tap(1, 2).catch((caught: unknown) => caught);

    expect((error as { code?: string }).code).toBe('CommandFailed');
    expect((error as { exitCode?: number }).exitCode).toBe(1);
    expect((error as Error).message).toContain('tap failed');
  });

  test('rejects invalid arguments before spawning anything', async () => {
    const { runner, transport } = createTransport([]);

    const failures = await Promise.all([
      transport.tap(Number.NaN, 0).catch((caught: unknown) => caught),
      transport.keyEvent(0).catch((caught: unknown) => caught),
      transport.keyEvent([]).catch((caught: unknown) => caught),
      transport
        .inputText('ok', { displayId: 1.5 })
        .catch((caught: unknown) => caught),
    ]);

    for (const failure of failures) {
      expect((failure as { code?: string }).code).toBe('InvalidArgument');
    }
    expect(runner.calls).toHaveLength(0);
  });
});

describe('RishTransport app management', () => {
  test('starts an explicit activity', async () => {
    const { runner, transport } = createTransport([{ match: [], stdout: '' }]);

    await transport.startActivity({
      packageName: 'com.android.settings',
      activity: '.Settings',
    });

    expect(runner.calls[0]?.argv[3]).toBe(
      "am start -W -n 'com.android.settings/.Settings'",
    );
  });

  test('starts a deep link with the target package', async () => {
    const { runner, transport } = createTransport([{ match: [], stdout: '' }]);

    await transport.startActivity({
      packageName: 'com.example.app',
      uri: 'example://open?id=1',
    });

    expect(runner.calls[0]?.argv[3]).toBe(
      "am start -W -a android.intent.action.VIEW -d 'example://open?id=1' -p 'com.example.app'",
    );
  });

  test('falls back to the launcher when only a package is known', async () => {
    const { runner, transport } = createTransport([{ match: [], stdout: '' }]);

    await transport.startActivity({ packageName: 'com.example.app' });

    expect(runner.calls[0]?.argv[3]).toBe(
      "monkey -p 'com.example.app' -c android.intent.category.LAUNCHER 1",
    );
  });

  test('force-stops a package', async () => {
    const { runner, transport } = createTransport([{ match: [], stdout: '' }]);

    await transport.forceStop('com.example.app');

    expect(runner.calls[0]?.argv[3]).toBe("am force-stop 'com.example.app'");
  });

  test('rejects an empty package name', async () => {
    const { transport } = createTransport([]);

    const startError = await transport
      .startActivity({ packageName: '' })
      .catch((caught: unknown) => caught);
    const stopError = await transport
      .forceStop('  ')
      .catch((caught: unknown) => caught);

    expect((startError as { code?: string }).code).toBe('InvalidArgument');
    expect((stopError as { code?: string }).code).toBe('InvalidArgument');
  });
});

describe('RishTransport shell and lifecycle', () => {
  test('returns stdout, stderr and the exit code', async () => {
    const { transport } = createTransport([
      { match: ['getprop'], stdout: '12\n', stderr: 'warn', exitCode: 0 },
    ]);

    const result = await transport.runShell('getprop ro.build.version.release');

    expect(result.stdout).toBe('12\n');
    expect(result.stderr).toBe('warn');
    expect(result.exitCode).toBe(0);
  });

  test('can return binary stdout as base64', async () => {
    const { transport } = createTransport([
      { match: ['screencap'], stdout: PNG_BYTES },
    ]);

    const result = await transport.runShell('screencap -p', { binary: true });

    expect(result.stdout).toBe(PNG_BYTES.toString('base64'));
  });

  test('rejects every operation after close', async () => {
    const { transport } = createTransport(deviceResponses());
    await transport.close();

    const failures = await Promise.all([
      transport.tap(1, 2).catch((caught: unknown) => caught),
      transport.getCapabilities().catch((caught: unknown) => caught),
      transport.listDisplays().catch((caught: unknown) => caught),
      transport.runShell('id -u').catch((caught: unknown) => caught),
    ]);

    for (const failure of failures) {
      expect((failure as { code?: string }).code).toBe('ServiceUnavailable');
    }
  });

  test('exposes the exact rish argv for diagnostics', () => {
    const { transport } = createTransport([]);

    expect(transport.describeCommand('id -u')).toBe(
      joinShellCommand(['sh', RISH, '-c', 'id -u']),
    );
  });

  test('validates the display id given at construction time', () => {
    expect(
      () =>
        new RishTransport({ runner: new FakeCommandRunner([]), displayId: -3 }),
    ).toThrow(/displayId/);
  });
});
