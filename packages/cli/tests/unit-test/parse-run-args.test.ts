import { parseRunArgs } from '@/commands/run';
import { describe, expect, test } from 'vitest';

(global as any).__VERSION__ = '0.0.0-test';

describe('parseRunArgs', () => {
  test('should parse path argument', async () => {
    const { path, files } = await parseRunArgs(['path/to/script.yml']);
    expect(path).toBe('path/to/script.yml');
    expect(files).toBeUndefined();
  });

  test('should parse --files argument', async () => {
    const { path, files } = await parseRunArgs([
      '--files', 'file1.yml', 'file2.yml',
    ]);
    expect(path).toBeUndefined();
    expect(files).toEqual(['file1.yml', 'file2.yml']);
  });

  test('should parse --config argument', async () => {
    const { options } = await parseRunArgs(['--config', 'config.yml']);
    expect(options.config).toBe('config.yml');
  });

  test('should parse all boolean and value flags', async () => {
    const { options } = await parseRunArgs([
      '--headed',
      '--keep-window',
      '--continue-on-error',
      '--share-browser-context',
      '--dotenv-override',
      '--dotenv-debug',
      '--concurrent', '3',
      '--summary', 'report.json',
    ]);
    expect(options.headed).toBe(true);
    expect(options['keep-window']).toBe(true);
    expect(options['continue-on-error']).toBe(true);
    expect(options['share-browser-context']).toBe(true);
    expect(options['dotenv-override']).toBe(true);
    expect(options['dotenv-debug']).toBe(true);
    expect(options.concurrent).toBe(3);
    expect(options.summary).toBe('report.json');
  });

  test('should parse nested web and android options in camelCase', async () => {
    const { options } = await parseRunArgs([
      '--web.userAgent', 'test-ua',
      '--web.viewportWidth', '1024',
      '--web.viewportHeight', '768',
      '--android.deviceId', 'test-device',
    ]);
    expect(options.web).toEqual({
      'user-agent': 'test-ua',
      userAgent: 'test-ua',
      'viewport-width': 1024,
      viewportWidth: 1024,
      'viewport-height': 768,
      viewportHeight: 768,
    });
    expect(options.android).toEqual({
      'device-id': 'test-device',
      deviceId: 'test-device',
    });
  });

  test('should parse nested web and android options in kebab-case', async () => {
    const { options } = await parseRunArgs([
      '--web.user-agent', 'test-ua-kebab',
      '--web.viewport-width', '1280',
      '--web.viewport-height', '1024',
      '--android.device-id', 'test-device-kebab',
    ]);
    expect(options.web).toEqual({
      'user-agent': 'test-ua-kebab',
      userAgent: 'test-ua-kebab',
      'viewport-width': 1280,
      viewportWidth: 1280,
      'viewport-height': 1024,
      viewportHeight: 1024,
    });
    expect(options.android).toEqual({
      'device-id': 'test-device-kebab',
      deviceId: 'test-device-kebab',
    });
  });

  test('should handle mixed arguments', async () => {
    const { path, files, options } = await parseRunArgs([
      '--config', 'config.yml',
      '--files', 'a.yml', 'b.yml',
      '--concurrent', '5',
      'some/path.yml',
    ]);
    expect(path).toBe('some/path.yml');
    expect(files).toEqual(['a.yml', 'b.yml']);
    expect(options.config).toBe('config.yml');
    expect(options.concurrent).toBe(5);
  });

  test('should not set boolean flags if they are not provided', async () => {
    const { options } = await parseRunArgs([]);
    expect(options.headed).toBeUndefined();
    expect(options['keep-window']).toBeUndefined();
    expect(options['continue-on-error']).toBeUndefined();
    expect(options['share-browser-context']).toBeUndefined();
    expect(options['dotenv-override']).toBeUndefined();
    expect(options['dotenv-debug']).toBeUndefined();
    expect(options.concurrent).toBeUndefined();
  });

  test('should override default values with command-line arguments', async () => {
    const { options } = await parseRunArgs([
      '--headed',
      '--keep-window',
      '--continue-on-error',
      '--no-share-browser-context',
      '--dotenv-override',
      '--dotenv-debug',
      '--concurrent', '10',
    ]);
    expect(options.headed).toBe(true);
    expect(options['keep-window']).toBe(true);
    expect(options['continue-on-error']).toBe(true);
    expect(options['share-browser-context']).toBe(false);
    expect(options['dotenv-override']).toBe(true);
    expect(options['dotenv-debug']).toBe(true);
    expect(options.concurrent).toBe(10);
  });

  test('should auto-parse iOS device options', async () => {
    const { options } = await parseRunArgs([
      '--ios.device-id', '00008110-001234567890',
      '--ios.wda-port', '8100',
      '--ios.wda-host', '192.168.1.100',
      '--ios.use-wda', 'true',
      '--ios.auto-dismiss-keyboard', 'true',
    ]);
    expect(options.ios).toEqual({
      'device-id': '00008110-001234567890',
      deviceId: '00008110-001234567890',
      'wda-port': 8100,
      wdaPort: 8100,
      'wda-host': '192.168.1.100',
      wdaHost: '192.168.1.100',
      'use-wda': 'true',
      useWda: 'true',
      'auto-dismiss-keyboard': 'true',
      autoDismissKeyboard: 'true',
    });
  });

  test('should auto-parse Android device options with advanced parameters', async () => {
    const { options } = await parseRunArgs([
      '--android.device-id', 'emulator-5554',
      '--android.android-adb-path', '/custom/path/to/adb',
      '--android.ime-strategy', 'yadb-for-non-ascii',
      '--android.remote-adb-host', '192.168.1.100',
      '--android.remote-adb-port', '5037',
      '--android.screenshot-resize-scale', '0.5',
      '--android.auto-dismiss-keyboard', 'true',
      '--android.keyboard-dismiss-strategy', 'esc-first',
    ]);
    expect(options.android).toEqual({
      'device-id': 'emulator-5554',
      deviceId: 'emulator-5554',
      'android-adb-path': '/custom/path/to/adb',
      androidAdbPath: '/custom/path/to/adb',
      'ime-strategy': 'yadb-for-non-ascii',
      imeStrategy: 'yadb-for-non-ascii',
      'remote-adb-host': '192.168.1.100',
      remoteAdbHost: '192.168.1.100',
      'remote-adb-port': 5037,
      remoteAdbPort: 5037,
      'screenshot-resize-scale': 0.5,
      screenshotResizeScale: 0.5,
      'auto-dismiss-keyboard': 'true',
      autoDismissKeyboard: 'true',
      'keyboard-dismiss-strategy': 'esc-first',
      keyboardDismissStrategy: 'esc-first',
    });
  });

  test('should handle mixed web, android, and ios parameters', async () => {
    const { options } = await parseRunArgs([
      '--web.user-agent', 'Custom Agent',
      '--web.viewport-width', '1920',
      '--android.device-id', 'test-android',
      '--android.ime-strategy', 'always-yadb',
      '--ios.wda-port', '8100',
      '--ios.device-id', 'test-ios',
    ]);

    expect(options.web).toEqual({
      'user-agent': 'Custom Agent',
      userAgent: 'Custom Agent',
      'viewport-width': 1920,
      viewportWidth: 1920,
    });

    expect(options.android).toEqual({
      'device-id': 'test-android',
      deviceId: 'test-android',
      'ime-strategy': 'always-yadb',
      imeStrategy: 'always-yadb',
    });

    expect(options.ios).toEqual({
      'wda-port': 8100,
      wdaPort: 8100,
      'device-id': 'test-ios',
      deviceId: 'test-ios',
    });
  });

  test('should handle camelCase parameters and convert to both formats', async () => {
    const { options } = await parseRunArgs([
      '--android.imeStrategy', 'yadb-for-non-ascii',
      '--android.autoDismissKeyboard', 'true',
      '--ios.wdaPort', '8100',
      '--ios.useWda', 'true',
    ]);

    expect(options.android).toEqual({
      'ime-strategy': 'yadb-for-non-ascii',
      imeStrategy: 'yadb-for-non-ascii',
      'auto-dismiss-keyboard': 'true',
      autoDismissKeyboard: 'true',
    });

    expect(options.ios).toEqual({
      'wda-port': 8100,
      wdaPort: 8100,
      'use-wda': 'true',
      useWda: 'true',
    });
  });

  test('should not create device objects when no device parameters provided', async () => {
    const { options } = await parseRunArgs(['--headed', '--concurrent', '5']);
    expect(options.web).toBeUndefined();
    expect(options.android).toBeUndefined();
    expect(options.ios).toBeUndefined();
  });
});
