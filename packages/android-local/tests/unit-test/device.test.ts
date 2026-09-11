import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from '@rstest/core';

import type { DeviceAction } from '@midscene/core';
import { defineAction } from '@midscene/core/device';

import { LocalAndroidDevice } from '../../src/device';
import {
  type FakeCommandResponse,
  FakeCommandRunner,
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
    { match: ['command -v'], stdout: '/system/bin/command\n' },
    { match: ['dumpsys display'], stdout: dumpsysDisplay },
    { match: ['wm size'], stdout: wmSize },
    { match: ['wm density'], stdout: wmDensity },
    { match: ['screencap'], stdout: '' },
    { match: ['date +'], stdout: '2026-09-11T22:55:00\n' },
    { match: [], stdout: '' },
  ];
}

/**
 * Fake on-device filesystem for the transport's file channel: `.txt` reads
 * serve the dumpsys fixture, other reads serve a PNG.
 */
function createFixtureFileIo(image: Buffer = PNG_BYTES) {
  return {
    async read(filePath: string) {
      return filePath.endsWith('.txt')
        ? Buffer.from(dumpsysDisplay, 'utf8')
        : Buffer.from(image);
    },
    async remove() {
      return undefined;
    },
  };
}

async function createDevice(
  responses: FakeCommandResponse[] = deviceResponses(),
  options: { displayId?: number; customActions?: DeviceAction<any>[] } = {},
) {
  const runner = new FakeCommandRunner(responses);
  const transport = new RishTransport({
    rishPath: RISH,
    runner,
    displayCacheTtlMs: 0,
    displayId: options.displayId,
    fileIo: createFixtureFileIo(),
  });
  const device = await LocalAndroidDevice.create(transport, {
    displayId: options.displayId,
    customActions: options.customActions,
  });

  return { device, runner, transport };
}

/** Device whose shell has no `input` command (screenshot only). */
const noInputResponses = (): FakeCommandResponse[] => [
  { match: ['id -u'], stdout: '2000\n' },
  { match: ['command -v screencap'], stdout: '/system/bin/screencap\n' },
  { match: ['command -v input'], exitCode: 1 },
  { match: ['command -v am'], stdout: '/system/bin/am\n' },
  { match: ['dumpsys display'], stdout: dumpsysDisplay },
  { match: ['wm size'], stdout: wmSize },
  { match: ['wm density'], stdout: wmDensity },
];

describe('LocalAndroidDevice wiring', () => {
  test('probes capabilities on create and describes itself', async () => {
    const { device } = await createDevice();

    expect(device.interfaceType).toBe('android');
    expect(device.getCapabilities()).toMatchObject({
      backend: 'rish',
      uid: 2000,
      privileged: true,
    });
    expect(device.describe()).toBe(
      'AndroidLocalDevice(backend=rish, uid=2000)',
    );
  });

  test('includes the display id in its description when configured', async () => {
    const { device } = await createDevice(deviceResponses(), { displayId: 10 });

    expect(device.describe()).toContain('displayId=10');
  });

  test('returns the managed transport capabilities', async () => {
    const { device, transport } = await createDevice();

    expect(device.getCapabilities()?.backend).toBe(transport.backend);
  });
});

describe('LocalAndroidDevice screen access', () => {
  test('returns a PNG data URL', async () => {
    const { device } = await createDevice();

    const screenshot = await device.screenshotBase64();

    expect(screenshot).toBe(
      `data:image/png;base64,${PNG_BYTES.toString('base64')}`,
    );
  });

  test('targets the configured display', async () => {
    const { device, runner } = await createDevice(deviceResponses(), {
      displayId: 10,
    });

    await device.screenshotBase64();

    expect(
      runner.calls.some((call) => call.argv[3]?.includes('screencap -p -d 10')),
    ).toBe(true);
  });

  test('reports the screen size from the display info', async () => {
    const { device } = await createDevice();

    expect(await device.size()).toEqual({ width: 2560, height: 1600 });
  });

  test('exposes the default and virtual displays', async () => {
    const { device } = await createDevice();

    expect((await device.getDisplayInfo()).id).toBe(0);
    expect((await device.listDisplays()).map((display) => display.id)).toEqual([
      0, 10,
    ]);
  });
});

describe('LocalAndroidDevice action space', () => {
  test('refuses to build an action space before connecting', () => {
    const transport = new RishTransport({
      rishPath: RISH,
      runner: new FakeCommandRunner(deviceResponses()),
      fileIo: createFixtureFileIo(),
    });
    const device = new LocalAndroidDevice(transport);

    expect(() => device.actionSpace()).toThrow(/connect\(\)/);
  });

  test('registers the mobile actions the transport can serve', async () => {
    const { device } = await createDevice();

    const names = device.actionSpace().map((action) => action.name);

    for (const expected of [
      'Tap',
      'DoubleClick',
      'LongPress',
      'DragAndDrop',
      'Input',
      'KeyboardPress',
      'ClearInput',
      'CursorMove',
      'Scroll',
      'Swipe',
      'AndroidBackButton',
      'AndroidHomeButton',
      'AndroidRecentAppsButton',
    ]) {
      expect(names).toContain(expected);
    }
  });

  test('omits multi-touch actions the shell cannot express', async () => {
    const { device } = await createDevice();

    const names = device.actionSpace().map((action) => action.name);

    expect(names).not.toContain('Pinch');
  });

  test('keeps custom actions and drops input actions when the device has no input command', async () => {
    const customAction = defineAction({
      name: 'CustomProbe',
      description: 'probe',
      call: async () => 'ok',
    });
    const { device } = await createDevice(noInputResponses());
    const { device: deviceWithCustom } = await createDevice(
      noInputResponses(),
      {
        customActions: [customAction],
      },
    );

    expect(device.getCapabilities()?.input).toBe(false);
    expect(device.actionSpace()).toEqual([]);
    expect(deviceWithCustom.actionSpace().map((action) => action.name)).toEqual(
      ['CustomProbe'],
    );
  });
});

describe('LocalAndroidDevice input primitives', () => {
  test('taps through the transport', async () => {
    const { device, runner } = await createDevice();

    await device.inputPrimitives.pointer.tap({ x: 12, y: 34 });

    expect(runner.commands.at(-1)).toContain('input tap 12 34');
  });

  test('long-presses with the default duration', async () => {
    const { device, runner } = await createDevice();

    await device.inputPrimitives.pointer.longPress({ x: 12, y: 34 });

    expect(runner.commands.at(-1)).toContain('input swipe 12 34 12 34 2000');
  });

  test('presses mapped keys and rejects unmapped ones', async () => {
    const { device, runner } = await createDevice();

    await device.inputPrimitives.keyboard.keyboardPress('Enter');
    expect(runner.commands.at(-1)).toContain('input keyevent 66');

    await expect(
      device.inputPrimitives.keyboard.keyboardPress('Ctrl+A'),
    ).rejects.toThrow(/key combinations/);
    await expect(
      device.inputPrimitives.keyboard.keyboardPress('F13'),
    ).rejects.toThrow(/Unsupported key/);
  });

  test('types text through the transport', async () => {
    const { device, runner } = await createDevice();

    await device.inputPrimitives.keyboard.typeText('midscene');

    expect(runner.commands.at(-1)).toContain("input text 'midscene'");
  });

  test('clears a field with one batched keyevent call', async () => {
    const { device, runner } = await createDevice();

    await device.inputPrimitives.keyboard.clearInput();

    const lastCommand = runner.commands.at(-1) ?? '';
    const keycodes =
      lastCommand.split('keyevent ')[1]?.trim().split(' ').filter(Boolean) ??
      [];

    expect(keycodes).toHaveLength(201);
    expect(keycodes[0]).toBe('123');
    expect(keycodes[1]).toBe('67');
    expect(keycodes[2]).toBe('112');
  });

  test('drives the system buttons with Android keycodes', async () => {
    const { device, runner } = await createDevice();

    await device.inputPrimitives.system?.backButton?.();
    await device.inputPrimitives.system?.homeButton?.();
    await device.inputPrimitives.system?.recentAppsButton?.();

    expect(runner.commands.slice(-3)).toEqual([
      `sh ${RISH} -c input keyevent 4`,
      `sh ${RISH} -c input keyevent 3`,
      `sh ${RISH} -c input keyevent 187`,
    ]);
  });

  test('scrolls down by swiping upward across the viewport', async () => {
    const { device, runner } = await createDevice();

    await device.inputPrimitives.scroll?.scroll({ direction: 'down' });

    // 2560x1600 => start in the upper quarter, end below it after the drag.
    expect(runner.commands.at(-1)).toContain('input swipe 640 400 640 0 1000');
  });

  test('clamps a scroll that starts from an element centre', async () => {
    const { device, runner } = await createDevice();

    await device.inputPrimitives.scroll?.scroll({
      direction: 'up',
      distance: 200,
      locate: { center: [100, 100] } as never,
    });

    expect(runner.commands.at(-1)).toContain(
      'input swipe 100 100 100 300 1000',
    );
  });

  test('repeats the gesture for swipe with repeat', async () => {
    const { device, runner } = await createDevice();

    await device.inputPrimitives.touch?.swipe(
      { x: 10, y: 10 },
      { x: 10, y: 20 },
      { repeat: 3, duration: 120 },
    );

    expect(
      runner.commands.filter((command) =>
        command.includes('input swipe 10 10 10 20 120'),
      ),
    ).toHaveLength(3);
  });
});

describe('LocalAndroidDevice lifecycle', () => {
  test('reads the device-local time', async () => {
    const { device } = await createDevice();

    await expect(device.getDeviceLocalTimeString()).resolves.toBe(
      '2026-09-11T22:55:00',
    );
  });

  test('accepts a custom time format', async () => {
    const { device, runner } = await createDevice();

    await device.getDeviceLocalTimeString('%Y');

    expect(runner.commands.at(-1)).toContain('date +%Y');
  });

  test('fails loudly when UI-tree extraction is not available yet', async () => {
    const { device } = await createDevice();

    await expect(device.getUITree()).rejects.toThrow(/not implemented/);
  });

  test('closes the transport exactly once', async () => {
    const { device, transport } = await createDevice();

    await device.destroy();
    await device.destroy();

    const error = await transport.tap(1, 2).catch((caught: unknown) => caught);
    expect((error as { code?: string }).code).toBe('ServiceUnavailable');
  });
});
