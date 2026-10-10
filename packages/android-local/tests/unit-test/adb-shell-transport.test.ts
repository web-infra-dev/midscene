import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from '@rstest/core';

import { AdbShellTransport } from '../../src/transport/adb-shell';
import {
  type FakeCommandResponse,
  FakeCommandRunner,
} from '../../src/transport/command-runner';

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
const SERIAL = 'emulator-5554';
const ADB = '/opt/android/platform-tools/adb';

function deviceResponses(): FakeCommandResponse[] {
  return [
    { match: ['id -u'], stdout: '2000\n' },
    { match: ['command -v screencap'], stdout: '/system/bin/screencap\n' },
    { match: ['command -v input'], stdout: '/system/bin/input\n' },
    { match: ['command -v am'], stdout: '/system/bin/am\n' },
    { match: ['dumpsys display'], stdout: dumpsysDisplay },
    { match: ['wm size'], stdout: wmSize },
    { match: ['wm density'], stdout: wmDensity },
    { match: ['screencap'], stdout: PNG_BYTES },
    { match: ['input'], stdout: '' },
  ];
}

function createTransport(
  responses: FakeCommandResponse[] = deviceResponses(),
  options: {
    serial?: string;
    displayId?: number;
    displayCacheTtlMs?: number;
  } = {},
) {
  const runner = new FakeCommandRunner(responses);
  const transport = new AdbShellTransport({
    adbPath: ADB,
    serial: options.serial === undefined ? SERIAL : options.serial,
    runner,
    displayCacheTtlMs: options.displayCacheTtlMs ?? 0,
    displayId: options.displayId,
  });

  return { runner, transport };
}

describe('AdbShellTransport argv construction', () => {
  test('targets the serial for every command', async () => {
    const { runner, transport } = createTransport();

    await transport.getCapabilities();

    for (const call of runner.calls) {
      expect(call.argv.slice(0, 3)).toEqual([ADB, '-s', SERIAL]);
    }
  });

  test('omits -s when no serial is configured', async () => {
    const runner = new FakeCommandRunner([{ match: ['input'], stdout: '' }]);
    const transport = new AdbShellTransport({ adbPath: ADB, runner });

    await transport.tap(1, 2);

    expect(runner.calls[0]?.argv).toEqual([ADB, 'shell', 'input tap 1 2']);
  });

  test('runs shell commands through `adb shell`', async () => {
    const { runner, transport } = createTransport();

    await transport.tap(10.4, 20.6);

    expect(runner.calls[0]?.argv).toEqual([
      ADB,
      '-s',
      SERIAL,
      'shell',
      'input tap 10 21',
    ]);
  });

  test('uses exec-out for screenshots so binary data is not mangled', async () => {
    const { runner, transport } = createTransport();

    const buffer = await transport.screenshot();

    expect(buffer.equals(PNG_BYTES)).toBe(true);
    expect(runner.calls[0]?.argv).toEqual([
      ADB,
      '-s',
      SERIAL,
      'exec-out',
      'screencap -p',
    ]);
  });

  test('targets a display for screenshots and input', async () => {
    const { runner, transport } = createTransport(deviceResponses(), {
      displayId: 7,
    });

    await transport.screenshot();
    await transport.tap(1, 2);

    expect(runner.calls[0]?.argv.at(-1)).toBe('screencap -p -d 7');
    expect(runner.calls[1]?.argv.at(-1)).toBe('input -d 7 tap 1 2');
  });

  test('never writes to the device filesystem', async () => {
    const { runner, transport } = createTransport();

    await transport.screenshot();
    await transport.getCapabilities();

    for (const command of runner.commands) {
      expect(command).not.toContain('mkdir');
      expect(command).not.toContain('midscene-channel');
      expect(command).not.toContain('base64');
    }
  });

  test('exposes the exact adb argv for diagnostics', () => {
    const { transport } = createTransport();

    expect(transport.describeCommand('id -u')).toBe(
      `'${ADB}' '-s' '${SERIAL}' 'shell' 'id -u'`,
    );
  });
});

describe('AdbShellTransport device semantics', () => {
  test('parses the display fixture like the other backends', async () => {
    const { transport } = createTransport();

    const displays = await transport.listDisplays();

    expect(displays.map((display) => display.id)).toEqual([0, 10]);
    expect(displays[0]).toMatchObject({
      name: 'Built-in Screen',
      width: 2560,
      height: 1600,
      isDefault: true,
    });
  });

  test('caches display queries within the TTL', async () => {
    const { runner, transport } = createTransport(deviceResponses(), {
      displayCacheTtlMs: 60_000,
    });

    await transport.listDisplays();
    const callsAfterFirst = runner.calls.length;
    await transport.listDisplays();

    expect(runner.calls.length).toBe(callsAfterFirst);
  });

  test('starts an activity, a deep link and a launcher intent', async () => {
    const { runner, transport } = createTransport([
      ...deviceResponses(),
      { match: ['am start'], stdout: '' },
      { match: ['monkey'], stdout: '' },
      { match: ['am force-stop'], stdout: '' },
    ]);

    await transport.startActivity({
      packageName: 'com.android.settings',
      activity: '.Settings',
    });
    await transport.startActivity({ uri: 'https://example.com' });
    await transport.startActivity({ packageName: 'com.example.app' });
    await transport.forceStop('com.example.app');

    const commands = runner.commands.map(
      (command) => command.split('shell ')[1],
    );
    expect(commands).toContain(
      "am start -W -n 'com.android.settings/.Settings'",
    );
    expect(commands).toContain(
      "am start -W -a android.intent.action.VIEW -d 'https://example.com'",
    );
    expect(commands).toContain(
      "monkey -p 'com.example.app' -c android.intent.category.LAUNCHER 1",
    );
    expect(commands).toContain("am force-stop 'com.example.app'");
  });

  test('reports ServiceUnavailable when adb itself cannot be started', async () => {
    const { transport } = createTransport([
      {
        match: [],
        failure: { kind: 'spawn-failed', message: 'adb: not found' },
      },
    ]);

    const error = await transport
      .getCapabilities()
      .catch((caught: unknown) => caught);

    expect((error as { code?: string }).code).toBe('ServiceUnavailable');
  });

  test('maps a non-zero shell exit to CommandFailed with diagnostics', async () => {
    const transport = new AdbShellTransport({
      adbPath: ADB,
      serial: SERIAL,
      runner: new FakeCommandRunner([
        { match: ['input tap'], exitCode: 1, stderr: 'SecurityException' },
      ]),
    });

    const error = await transport.tap(1, 2).catch((caught: unknown) => caught);

    expect((error as { code?: string }).code).toBe('CommandFailed');
    expect((error as Error).message).toContain('tap failed');
  });

  test('rejects every operation after close', async () => {
    const { transport } = createTransport();
    await transport.close();

    const error = await transport
      .runShell('id -u')
      .catch((caught: unknown) => caught);

    expect((error as { code?: string }).code).toBe('ServiceUnavailable');
  });

  test('validates the display id given at construction time', () => {
    expect(
      () =>
        new AdbShellTransport({
          runner: new FakeCommandRunner([]),
          displayId: -2,
        }),
    ).toThrow(/displayId/);
  });
});
