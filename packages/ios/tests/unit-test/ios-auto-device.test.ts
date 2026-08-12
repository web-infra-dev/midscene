import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { IOSAutoDevice } from '../../src/ios-auto-device';

const mocks = vi.hoisted(() => ({
  execFileAsync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: Object.assign(vi.fn(), {
    [Symbol.for('nodejs.util.promisify.custom')]: mocks.execFileAsync,
  }),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

const mockedExecFile = vi.mocked(execFile);
const mockedExecFileAsync = vi.mocked(mocks.execFileAsync);

const ok = (data: unknown) => JSON.stringify({ status: 'ok', data });

describe('IOSAutoDevice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('connects using device display and info from doubaocli', async () => {
    mockedExecFileAsync
      .mockResolvedValueOnce({
        stdout: ok({ logicalViewport: { width: 393, height: 852 } }),
        stderr: '',
      } as any)
      .mockResolvedValueOnce({
        stdout: ok({
          target: { id: 'ios-udid', name: 'Test iPhone' },
          device: { model: 'iPhone 15' },
        }),
        stderr: '',
      } as any);
    const device = new IOSAutoDevice({ iosAutoCliPath: 'custom-doubaocli' });

    await device.connect();

    expect(mockedExecFile).not.toHaveBeenCalled();
    expect(mockedExecFileAsync).toHaveBeenNthCalledWith(
      1,
      'custom-doubaocli',
      ['ios-auto', 'device', 'display', '--json'],
      expect.any(Object),
    );
    expect(mockedExecFileAsync).toHaveBeenNthCalledWith(
      2,
      'custom-doubaocli',
      ['ios-auto', 'device', 'info', '--json'],
      expect.any(Object),
    );
    await expect(device.size()).resolves.toEqual({ width: 393, height: 852 });
    expect(device.describe()).toContain('UDID: ios-udid');
  });

  test('routes gestures and app lifecycle calls to ios-auto', async () => {
    mockedExecFileAsync.mockResolvedValue({
      stdout: ok({}),
      stderr: '',
    } as any);
    const device = new IOSAutoDevice();
    device.setAppNameMapping({ settings: 'com.apple.Preferences' });

    await device.inputPrimitives.pointer.tap({ x: 10.125, y: 20.5 });
    await device.inputPrimitives.touch.swipe(
      { x: 10, y: 20 },
      { x: 30, y: 40 },
      { duration: 321 },
    );
    await device.launch('Settings');
    await device.terminate('Settings');
    await device.launch('exampleapp://path');

    expect(mockedExecFileAsync).toHaveBeenNthCalledWith(
      1,
      'doubaocli',
      ['ios-auto', 'gesture', 'tap', '--point', '10.125,20.5', '--json'],
      expect.any(Object),
    );
    expect(mockedExecFileAsync).toHaveBeenNthCalledWith(
      2,
      'doubaocli',
      [
        'ios-auto',
        'gesture',
        'swipe',
        '--from',
        '10,20',
        '--to',
        '30,40',
        '--duration-ms',
        '321',
        '--json',
      ],
      expect.any(Object),
    );
    expect(mockedExecFileAsync).toHaveBeenNthCalledWith(
      3,
      'doubaocli',
      [
        'ios-auto',
        'app',
        'launch',
        '--app-id',
        'com.apple.Preferences',
        '--json',
      ],
      expect.any(Object),
    );
    expect(mockedExecFileAsync).toHaveBeenNthCalledWith(
      4,
      'doubaocli',
      [
        'ios-auto',
        'app',
        'terminate',
        '--app-id',
        'com.apple.Preferences',
        '--json',
      ],
      expect.any(Object),
    );
    expect(mockedExecFileAsync).toHaveBeenNthCalledWith(
      5,
      'doubaocli',
      ['ios-auto', 'app', 'open-url', '--url', 'exampleapp://path', '--json'],
      expect.any(Object),
    );
  });

  test('reads the screenshot artifact as a PNG data URI', async () => {
    mockedExecFileAsync.mockResolvedValue({
      stdout: ok({
        artifacts: [
          {
            kind: 'image',
            path: '/tmp/ios-auto-screenshot.png',
            mediaType: 'image/png',
          },
        ],
      }),
      stderr: '',
    } as any);
    vi.mocked(readFile).mockResolvedValue(Buffer.from('png-bytes'));
    const device = new IOSAutoDevice();

    const screenshot = await device.screenshotBase64();

    expect(mockedExecFileAsync).toHaveBeenCalledWith(
      'doubaocli',
      ['ios-auto', 'ui', 'screenshot', '--json'],
      expect.any(Object),
    );
    expect(readFile).toHaveBeenCalledWith('/tmp/ios-auto-screenshot.png');
    expect(screenshot).toBe(
      `data:image/png;base64,${Buffer.from('png-bytes').toString('base64')}`,
    );
  });

  test('surfaces structured ios-auto command failures', async () => {
    mockedExecFileAsync.mockResolvedValue({
      stdout: JSON.stringify({
        status: 'error',
        error: {
          code: 'IOS_UI_BDC_SERVER_UNAVAILABLE',
          message: 'BDC Server endpoint is unavailable',
          hint: 'Run doubaocli ios-auto bootstrap prepare',
        },
      }),
      stderr: '',
    } as any);
    const device = new IOSAutoDevice();

    await expect(device.screenshotBase64()).rejects.toThrow(
      'IOS_UI_BDC_SERVER_UNAVAILABLE: BDC Server endpoint is unavailable: Run doubaocli ios-auto bootstrap prepare',
    );
  });

  test('passes login-account doubaocli state paths to ios-auto commands', async () => {
    vi.stubEnv('DOUBAOCLI_TEST_HOME', '/tmp/midscene-test-home');
    vi.stubEnv('DOUBAOCLI_CONFIG_DIR', '');
    vi.stubEnv('DOUBAOCLI_DATABASE_DIR', '');
    mockedExecFileAsync.mockResolvedValue({
      stdout: ok({}),
      stderr: '',
    } as any);
    const device = new IOSAutoDevice();

    await device.home();

    expect(mockedExecFileAsync).toHaveBeenCalledWith(
      'doubaocli',
      ['ios-auto', 'device', 'home', '--json'],
      expect.objectContaining({
        env: expect.objectContaining({
          DOUBAOCLI_CONFIG_DIR: '/tmp/midscene-test-home',
          DOUBAOCLI_DATABASE_DIR: '/tmp/midscene-test-home/.doubaocli',
        }),
      }),
    );
  });

  test('does not override explicit doubaocli state paths', async () => {
    vi.stubEnv('DOUBAOCLI_TEST_HOME', '/tmp/midscene-test-home');
    vi.stubEnv('DOUBAOCLI_CONFIG_DIR', '/tmp/custom-config');
    vi.stubEnv('DOUBAOCLI_DATABASE_DIR', '/tmp/custom-database');
    mockedExecFileAsync.mockResolvedValue({
      stdout: ok({}),
      stderr: '',
    } as any);
    const device = new IOSAutoDevice();

    await device.home();

    expect(mockedExecFileAsync).toHaveBeenCalledWith(
      'doubaocli',
      ['ios-auto', 'device', 'home', '--json'],
      expect.objectContaining({
        env: expect.objectContaining({
          DOUBAOCLI_CONFIG_DIR: '/tmp/custom-config',
          DOUBAOCLI_DATABASE_DIR: '/tmp/custom-database',
        }),
      }),
    );
  });
});
