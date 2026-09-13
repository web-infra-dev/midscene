import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from '@rstest/core';

import { LocalAndroidDevice } from '../../src/device';
import {
  type FakeCommandResponse,
  FakeCommandRunner,
} from '../../src/transport/command-runner';
import { ShellTransport } from '../../src/transport/shell';
import {
  buildYadbKeyboardClearCommand,
  buildYadbPinchCommand,
} from '../../src/transport/text-input';

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
const YADB = '/data/local/tmp/yadb';

function createFixtureFileIo() {
  return {
    async read(filePath: string) {
      return filePath.endsWith('.txt')
        ? Buffer.from(dumpsysDisplay, 'utf8')
        : PNG_BYTES;
    },
  };
}

function createTransport(
  yadbPresent: boolean,
  responses: FakeCommandResponse[] = [],
) {
  const runner = new FakeCommandRunner([
    { match: ['id -u'], stdout: '2000\n' },
    { match: ['command -v'], stdout: '/system/bin/x\n' },
    { match: ['test -f'], stdout: yadbPresent ? 'yes\n' : '' },
    { match: ['dumpsys display'], stdout: dumpsysDisplay },
    { match: ['wm size'], stdout: wmSize },
    { match: ['wm density'], stdout: wmDensity },
    { match: ['mkdir -p'], stdout: '' },
    { match: ['rm -f'], stdout: '' },
    { match: ['app_process'], stdout: '' },
    ...responses,
  ]);

  return {
    runner,
    transport: new ShellTransport({
      yadbPath: YADB,
      runner,
      fileChannelDir: FILE_CHANNEL_DIR,
      displayCacheTtlMs: 0,
      fileIo: createFixtureFileIo(),
    }),
  };
}

describe('yadb gesture commands', () => {
  test('builds a pinch command with rounded geometry', () => {
    const command = buildYadbPinchCommand(
      YADB,
      { x: 100.4, y: 200.6 },
      { startDistance: 100, endDistance: 400.2, duration: 500.5 },
    );

    expect(command).toBe(
      'app_process -Djava.class.path=/data/local/tmp/yadb /data/local/tmp com.ysbing.yadb.Main -pinch 100 201 100 400 501',
    );
  });

  test('builds a keyboard-clear command', () => {
    expect(buildYadbKeyboardClearCommand(YADB)).toContain('-keyboardClear');
  });
});

describe('transport pinch capability', () => {
  test('reports gestures when the helper is present', async () => {
    const { transport } = createTransport(true);

    const capabilities = await transport.getCapabilities();

    expect(capabilities.gestures).toBe(true);
    expect(capabilities.textInput).toBe('full');
  });

  test('reports no gestures without the helper', async () => {
    const { transport } = createTransport(false);

    const capabilities = await transport.getCapabilities();

    expect(capabilities.gestures).toBe(false);
    expect(capabilities.textInput).toBe('ascii-only');
  });

  test('runs yadb for a pinch', async () => {
    const { runner, transport } = createTransport(true);

    await transport.pinch?.(
      { x: 1280, y: 800 },
      { startDistance: 200, endDistance: 600, duration: 400 },
    );

    const command = runner.calls.at(-1)?.command ?? '';
    expect(command).toContain(
      'com.ysbing.yadb.Main -pinch 1280 800 200 600 400',
    );
  });

  test('fails loudly when pinch needs a missing helper', async () => {
    const { transport } = createTransport(false);

    const error = await transport
      .pinch?.(
        { x: 1, y: 2 },
        { startDistance: 10, endDistance: 20, duration: 30 },
      )
      .catch((caught: unknown) => caught);

    expect((error as { code?: string }).code).toBe('NotSupported');
    expect((error as Error).message).toContain('adb push');
  });
});

describe('device action space gestures', () => {
  async function createDevice(yadbPresent: boolean) {
    const { transport } = createTransport(yadbPresent);
    return await LocalAndroidDevice.create(transport, { displayId: 0 });
  }

  test('registers Pinch when the backend can inject multi-touch', async () => {
    const device = await createDevice(true);

    expect(device.actionSpace().map((action) => action.name)).toContain(
      'Pinch',
    );
  });

  test('omits Pinch when the backend cannot inject multi-touch', async () => {
    const device = await createDevice(false);

    const names = device.actionSpace().map((action) => action.name);
    expect(names).not.toContain('Pinch');
    expect(names).toContain('Tap');
  });
});

describe('RunAdbShell parity action', () => {
  test('is registered when the backend can run shell commands', async () => {
    const { transport } = createTransport(true);
    const device = await LocalAndroidDevice.create(transport, {
      displayId: 0,
      exposeRunAdbShellAction: true,
    });

    expect(device.actionSpace().map((action) => action.name)).toContain(
      'RunAdbShell',
    );
    expect(
      device.actionSpace().find((action) => action.name === 'RunAdbShell')
        ?.interfaceAlias,
    ).toBe('runAdbShell');
  });

  test('is hidden by default', async () => {
    const { transport } = createTransport(true);
    const device = await LocalAndroidDevice.create(transport, { displayId: 0 });

    expect(device.actionSpace().map((action) => action.name)).not.toContain(
      'RunAdbShell',
    );
  });

  test('returns the command output', async () => {
    const { transport, runner } = createTransport(true, [
      { match: ['getprop'], stdout: 'Pixel\n' },
    ]);
    const device = await LocalAndroidDevice.create(transport, {
      displayId: 0,
      exposeRunAdbShellAction: true,
    });
    const action = device
      .actionSpace()
      .find((candidate) => candidate.name === 'RunAdbShell');

    const output = await action?.call({ command: 'getprop ro.product.model' });

    expect(output).toBe('Pixel\n');
    expect(runner.commands.at(-1)).toContain('getprop ro.product.model');
  });

  test('throws when the shell command fails', async () => {
    const { transport } = createTransport(true, [
      {
        match: ['false'],
        stdout: '',
        stderr: 'permission denied',
        exitCode: 1,
      },
    ]);
    const device = await LocalAndroidDevice.create(transport, {
      displayId: 0,
      exposeRunAdbShellAction: true,
    });
    const action = device
      .actionSpace()
      .find((item) => item.name === 'RunAdbShell');

    await expect(action?.call({ command: 'false' })).rejects.toThrow(/exit 1/);
  });
});
