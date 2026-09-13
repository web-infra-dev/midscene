import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from '@rstest/core';

import {
  type FakeCommandResponse,
  FakeCommandRunner,
  joinShellCommand,
} from '../../src/transport/command-runner';
import { ShellTransport } from '../../src/transport/shell';

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
const FILE_CHANNEL_DIR = '/storage/emulated/0/Android/data/app/files/channel';

function deviceResponses(): FakeCommandResponse[] {
  return [
    { match: ['id -u'], stdout: '2000\n' },
    { match: ['command -v screencap'], stdout: '/system/bin/screencap\n' },
    { match: ['command -v input'], stdout: '/system/bin/input\n' },
    { match: ['command -v am'], stdout: '/system/bin/am\n' },
    { match: ['dumpsys display'], stdout: dumpsysDisplay },
    { match: ['wm size'], stdout: wmSize },
    { match: ['wm density'], stdout: wmDensity },
    { match: ['mkdir -p'], stdout: '' },
    { match: ['rm -f'], stdout: '' },
  ];
}

/**
 * Fake on-device filesystem for the file channel.
 *
 * Reads are scripted per suffix (`.txt` -> command text, other -> image bytes)
 * and every read/removal is recorded so tests can assert the transient file is
 * cleaned up.
 */
function createFixtureFileIo(options: { image?: Buffer; text?: string } = {}) {
  const image = options.image ?? PNG_BYTES;
  const text = options.text ?? dumpsysDisplay;
  const reads: string[] = [];

  return {
    reads,
    io: {
      async read(filePath: string) {
        reads.push(filePath);
        return filePath.endsWith('.txt')
          ? Buffer.from(text, 'utf8')
          : Buffer.from(image);
      },
    },
  };
}

/** Responses for the file-channel path: mkdir + screencap succeed, bytes come from the fake FS. */
function screenResponses(): FakeCommandResponse[] {
  return [
    { match: ['mkdir -p'], stdout: '' },
    { match: ['rm -f'], stdout: '' },
    { match: ['screencap'], stdout: '' },
  ];
}

interface CreateTransportOptions {
  displayId?: number;
  displayCacheTtlMs?: number;
  fileIo?: { read(filePath: string): Promise<Buffer> };
}

function createTransport(
  responses: FakeCommandResponse[],
  options: CreateTransportOptions = {},
) {
  const runner = new FakeCommandRunner(responses);
  const fileIo = options.fileIo ?? createFixtureFileIo().io;
  const transport = new ShellTransport({
    runner,
    fileChannelDir: FILE_CHANNEL_DIR,
    displayCacheTtlMs: options.displayCacheTtlMs ?? 0,
    displayId: options.displayId,
    fileIo,
  });

  return { runner, transport };
}

/**
 * Assert the exact argv of one recorded call.
 *
 * The transport always asks for `sh -c <command>`; reaching a shell uid is the
 * runner's job (the bridge posts the payload to the Shizuku user service).
 */
function expectCommand(
  runner: FakeCommandRunner,
  index: number,
  command: string,
) {
  expect(runner.calls[index]?.argv).toEqual(['sh', '-c', command]);
}

/** The shell payload of one recorded call, without the `sh -c` wrapper. */
function payloadOf(
  runner: FakeCommandRunner,
  index: number,
): string | undefined {
  return runner.calls[index]?.argv[2];
}

describe('ShellTransport capability probing', () => {
  test('detects the shell uid, available commands and multiple displays', async () => {
    const { runner, transport } = createTransport(deviceResponses());

    const capabilities = await transport.getCapabilities();

    expect(capabilities.backend).toBe('shizuku-userservice');
    expect(capabilities.shell).toBe(true);
    expect(capabilities.screenshot).toBe(true);
    expect(capabilities.input).toBe(true);
    expect(capabilities.appManagement).toBe(true);
    expect(capabilities.multiDisplay).toBe(true);
    expect(capabilities.textInput).toBe('ascii-only');
    expect(capabilities.privileged).toBe(true);
    expect(capabilities.uid).toBe(2000);
    // The probe must go through the shell runner, never a local shell.
    expectCommand(runner, 0, 'id -u');
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

  test('leaves environment handling to the runner', async () => {
    const { runner, transport } = createTransport(deviceResponses());

    await transport.getCapabilities();

    // The transport no longer decides how a shell is reached: it passes only a
    // timeout, and the injected runner owns environment and working directory.
    expect(runner.calls.length).toBeGreaterThan(0);
    for (const call of runner.calls) {
      expect(call.options?.unsetEnv).toBeUndefined();
      expect(call.options?.cwd).toBeUndefined();
    }
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

  test('reports ServiceUnavailable when the runner cannot start a shell at all', async () => {
    const { runner, transport } = createTransport([
      {
        match: [],
        failure: { kind: 'spawn-failed', message: 'sh: not found' },
      },
    ]);

    const error = await transport
      .getCapabilities()
      .catch((caught: unknown) => caught);

    expect((error as { code?: string }).code).toBe('ServiceUnavailable');
    expect((error as Error).message).toContain('Unable to determine the uid');
    expect(
      String((error as { cause?: { message?: string } }).cause?.message),
    ).toContain('sh: not found');
    // The uid probe retries once before giving up.
    expect(runner.calls).toHaveLength(2);
  });

  test('probes capabilities sequentially so heavyweight commands do not compete', async () => {
    const inner = new FakeCommandRunner(
      deviceResponses().map((response) => ({ ...response, delayMs: 5 })),
    );
    let active = 0;
    let peak = 0;
    const trackingRunner = {
      async run(
        argv: string[],
        options?: Parameters<FakeCommandRunner['run']>[1],
      ) {
        active += 1;
        peak = Math.max(peak, active);
        try {
          return await inner.run(argv, options);
        } finally {
          active -= 1;
        }
      },
    };
    const transport = new ShellTransport({
      runner: trackingRunner,
      fileChannelDir: FILE_CHANNEL_DIR,
      displayCacheTtlMs: 0,
      fileIo: createFixtureFileIo().io,
    });

    await transport.getCapabilities();

    expect(peak).toBe(1);
    expect(inner.calls.length).toBeGreaterThan(5);
  });

  test('retries a capability probe that failed transiently', async () => {
    const inner = new FakeCommandRunner(deviceResponses());
    let inputAttempts = 0;
    const flakyRunner = {
      async run(
        argv: string[],
        options?: Parameters<FakeCommandRunner['run']>[1],
      ) {
        const command = argv[argv.length - 1] ?? '';
        if (command.startsWith('command -v input')) {
          inputAttempts += 1;
          if (inputAttempts === 1) {
            return {
              exitCode: 1,
              signal: null,
              stdout: Buffer.alloc(0),
              stderr: 'transient app_process failure',
              durationMs: 1,
            };
          }
        }

        return await inner.run(argv, options);
      },
    };
    const transport = new ShellTransport({
      runner: flakyRunner,
      fileChannelDir: FILE_CHANNEL_DIR,
      displayCacheTtlMs: 0,
    });

    const capabilities = await transport.getCapabilities();

    expect(inputAttempts).toBe(2);
    expect(capabilities.input).toBe(true);
  });
});

describe('ShellTransport health check', () => {
  test('reports a healthy shell channel', async () => {
    const { transport } = createTransport(deviceResponses());

    const health = await transport.healthCheck();

    expect(health.ok).toBe(true);
    expect(health.uid).toBe(2000);
    expect(health.details).toBeUndefined();
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test('never throws when the shell channel is broken', async () => {
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

describe('ShellTransport screenshot', () => {
  test('captures through the on-device file channel and cleans up', async () => {
    const fileIo = createFixtureFileIo();
    const { runner, transport } = createTransport(screenResponses(), {
      fileIo: fileIo.io,
    });

    const buffer = await transport.screenshot();

    expect(buffer.equals(PNG_BYTES)).toBe(true);
    expect(runner.commands[0]).toContain('mkdir -p');
    expect(runner.commands[0]).toContain(FILE_CHANNEL_DIR);
    // Fixed path per purpose, removed by the shell inside the same command.
    expect(runner.calls[1]?.command).toBe(
      `sh -c rm -f '${FILE_CHANNEL_DIR}/shot.png' && screencap -p '${FILE_CHANNEL_DIR}/shot.png'`,
    );
    expect(fileIo.reads).toEqual([`${FILE_CHANNEL_DIR}/shot.png`]);
  });

  test('does not pipe pixels through the command stream on the happy path and prepares the channel once', async () => {
    const { runner, transport } = createTransport(screenResponses());

    await transport.screenshot();
    await transport.screenshot();

    // chmod/touch are best-effort on FUSE volumes, so the prep command tolerates
    // their failure and is asserted by intent rather than by exact text.
    const mkdirCalls = runner.commands.filter((command) =>
      command.includes('mkdir -p'),
    );
    expect(mkdirCalls).toHaveLength(1);
    for (const command of runner.commands) {
      expect(command).not.toContain('base64');
      // `|| true` (tolerating chmod on FUSE) is fine; piping pixels is not.
      expect(command).not.toMatch(/\|\s*(base64|cat|xxd)/);
    }
  });

  test('targets the requested display', async () => {
    const { runner, transport } = createTransport(screenResponses());

    await transport.screenshot({ displayId: 10 });

    expect(runner.calls[1]?.command).toContain("screencap -p -d 10 '");
    expect(runner.calls[1]?.command).toContain(`${FILE_CHANNEL_DIR}/shot.png`);
  });

  test('uses the transport default display when the caller omits it', async () => {
    const { runner, transport } = createTransport(screenResponses(), {
      displayId: 1,
    });

    await transport.screenshot();

    expect(runner.calls[1]?.command).toContain('screencap -p -d 1');
  });

  test('accepts a JPEG payload', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const fileIo = createFixtureFileIo({ image: jpeg });
    const { transport } = createTransport(screenResponses(), {
      fileIo: fileIo.io,
    });

    const buffer = await transport.screenshot();

    expect(buffer.equals(jpeg)).toBe(true);
  });

  test('falls back to the command stream when the file channel is unusable', async () => {
    const fileIo = createFixtureFileIo();
    fileIo.io.read = async () => {
      throw new Error('EACCES: permission denied');
    };
    const { runner, transport } = createTransport(
      [
        { match: ['mkdir -p'], stdout: '' },
        { match: ['| base64 -w0'], stdout: PNG_BYTES.toString('base64') },
        { match: ['screencap'], stdout: '' },
      ],
      { fileIo: fileIo.io },
    );

    const buffer = await transport.screenshot();

    expect(buffer.equals(PNG_BYTES)).toBe(true);
    // mkdir + (rm -f && screencap) + the base64 pipe fallback
    expect(runner.commands).toHaveLength(3);
    expect(runner.commands.at(-1)).toContain('base64');
  });

  test('fails with ScreenshotFailed when every channel fails', async () => {
    const fileIo = createFixtureFileIo();
    fileIo.io.read = async () => Buffer.from('not an image');
    const { transport } = createTransport(
      [
        { match: ['mkdir -p'], stdout: '' },
        { match: ['| base64 -w0'], stdout: 'still-not-an-image' },
        { match: ['screencap'], stdout: '' },
      ],
      { fileIo: fileIo.io },
    );

    const error = await transport
      .screenshot()
      .catch((caught: unknown) => caught);

    expect((error as { code?: string }).code).toBe('ScreenshotFailed');
    expect((error as Error).message).toContain('without a PNG/JPEG header');
  });

  test('surfaces a timeout instead of falling back blindly', async () => {
    const { runner, transport } = createTransport([
      { match: ['mkdir -p'], stdout: '' },
      { match: ['screencap'], failure: { kind: 'timeout' } },
    ]);

    const error = await transport
      .screenshot({ timeoutMs: 5 })
      .catch((caught: unknown) => caught);

    expect((error as { code?: string }).code).toBe('Timeout');
    // mkdir + (rm -f && screencap); the pipe fallback is skipped by design.
    expect(runner.commands).toHaveLength(2);
  });

  test('reports a non-zero screencap as a failure', async () => {
    const { transport } = createTransport([
      { match: ['mkdir -p'], stdout: '' },
      { match: ['| base64 -w0'], exitCode: 1, stderr: 'permission denied' },
      { match: ['screencap'], exitCode: 1, stderr: 'permission denied' },
    ]);

    const error = await transport
      .screenshot()
      .catch((caught: unknown) => caught);

    expect((error as { code?: string }).code).toBe('ScreenshotFailed');
    expect((error as Error).message).toContain('permission denied');
  });

  test('rejects an invalid display id', async () => {
    const { transport } = createTransport(screenResponses());

    const error = await transport
      .screenshot({ displayId: -1 })
      .catch((caught: unknown) => caught);

    expect((error as { code?: string }).code).toBe('InvalidArgument');
  });
});

describe('ShellTransport display information', () => {
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
      { match: ['mkdir -p'], stdout: '' },
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

describe('ShellTransport input commands', () => {
  test('taps in device pixels', async () => {
    const { runner, transport } = createTransport([{ match: [], stdout: '' }]);

    await transport.tap(10.4, 20.6);

    expect(runner.calls).toHaveLength(1);
    expectCommand(runner, 0, 'input tap 10 21');
  });

  test('turns a duration into a long press', async () => {
    const { runner, transport } = createTransport([{ match: [], stdout: '' }]);

    await transport.tap(10, 20, { durationMs: 1500 });

    expectCommand(runner, 0, 'input swipe 10 20 10 20 1500');
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

    expectCommand(runner, 0, 'input -d 1 swipe 10 20 30 40 120');
  });

  test('defaults the swipe duration', async () => {
    const { runner, transport } = createTransport([{ match: [], stdout: '' }]);

    await transport.swipe({ x: 1, y: 2 }, { x: 3, y: 4 });

    expectCommand(runner, 0, 'input swipe 1 2 3 4 300');
  });

  test('sends one or many keycodes in a single call', async () => {
    const { runner, transport } = createTransport([{ match: [], stdout: '' }]);

    await transport.keyEvent(3);
    await transport.keyEvent([4, 3, 187]);

    expectCommand(runner, 0, 'input keyevent 3');
    expectCommand(runner, 1, 'input keyevent 4 3 187');
  });

  test('sends ASCII text as one quoted argument', async () => {
    const { runner, transport } = createTransport([{ match: [], stdout: '' }]);

    await transport.inputText('hello world');

    expectCommand(runner, 0, "input text 'hello world'");
  });

  test('splits newlines and commits each line with ENTER', async () => {
    const { runner, transport } = createTransport([{ match: [], stdout: '' }]);

    await transport.inputText('line1\nline2');

    expectCommand(runner, 0, "input text 'line1'");
    expectCommand(runner, 1, 'input keyevent 66');
    expectCommand(runner, 2, "input text 'line2'");
  });

  test('refuses non-ASCII text when the yadb helper is absent', async () => {
    // No response for the yadb probe: the helper is treated as missing.
    const { runner, transport } = createTransport([
      { match: ['test -f'], stdout: '' },
    ]);

    for (const value of ['中文', 'café', '🙂']) {
      const error = await transport
        .inputText(value)
        .catch((caught: unknown) => caught);
      expect((error as { code?: string }).code).toBe('NotSupported');
    }

    // Nothing was typed: only the capability probes ran.
    expect(
      runner.commands.some((command) => command.includes(' input text')),
    ).toBe(false);
  });

  test('routes non-ASCII text through yadb when it is provisioned', async () => {
    const { runner, transport } = createTransport([
      { match: ['test -f'], stdout: 'yes\n' },
      { match: ['app_process'], stdout: '' },
    ]);

    await transport.inputText('中文输入测试 hello');

    const yadbCommand = runner.calls.at(-1)?.command ?? '';
    expect(yadbCommand).toContain('com.ysbing.yadb.Main');
    expect(yadbCommand).toContain("'中文输入测试 hello'");
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

describe('ShellTransport app management', () => {
  test('starts an explicit activity', async () => {
    const { runner, transport } = createTransport([{ match: [], stdout: '' }]);

    await transport.startActivity({
      packageName: 'com.android.settings',
      activity: '.Settings',
    });

    expect(payloadOf(runner, 0)).toBe(
      "am start -W -n 'com.android.settings/.Settings'",
    );
  });

  test('starts a deep link with the target package', async () => {
    const { runner, transport } = createTransport([{ match: [], stdout: '' }]);

    await transport.startActivity({
      packageName: 'com.example.app',
      uri: 'example://open?id=1',
    });

    expect(payloadOf(runner, 0)).toBe(
      "am start -W -a android.intent.action.VIEW -d 'example://open?id=1' -p 'com.example.app'",
    );
  });

  test('falls back to the launcher when only a package is known', async () => {
    const { runner, transport } = createTransport([{ match: [], stdout: '' }]);

    await transport.startActivity({ packageName: 'com.example.app' });

    expect(payloadOf(runner, 0)).toBe(
      "monkey -p 'com.example.app' -c android.intent.category.LAUNCHER 1",
    );
  });

  test('force-stops a package', async () => {
    const { runner, transport } = createTransport([{ match: [], stdout: '' }]);

    await transport.forceStop('com.example.app');

    expect(payloadOf(runner, 0)).toBe("am force-stop 'com.example.app'");
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

describe('ShellTransport shell and lifecycle', () => {
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

  test('exposes the exact argv for diagnostics', () => {
    const { transport } = createTransport([]);

    expect(transport.describeCommand('id -u')).toBe(
      joinShellCommand(['sh', '-c', 'id -u']),
    );
  });

  test('validates the display id given at construction time', () => {
    expect(
      () =>
        new ShellTransport({
          runner: new FakeCommandRunner([]),
          fileChannelDir: FILE_CHANNEL_DIR,
          displayId: -3,
        }),
    ).toThrow(/displayId/);
  });

  test('requires the file channel directory: there is no safe default', () => {
    expect(
      () =>
        new ShellTransport({
          runner: new FakeCommandRunner([]),
        } as unknown as ConstructorParameters<typeof ShellTransport>[0]),
    ).toThrow(/fileChannelDir/);
  });
});
