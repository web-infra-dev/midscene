import type {
  AndroidDeviceInputOpt,
  AndroidDeviceOpt,
  IOSDeviceInputOpt,
  IOSDeviceOpt,
} from '@/device';
import type {
  MidsceneYamlScriptAndroidEnv,
  MidsceneYamlScriptIOSEnv,
} from '@/yaml';
import { describe, expect, test } from 'vitest';

describe('Device Options Type Definitions', () => {
  describe('AndroidDeviceOpt', () => {
    test('should include all required Android device options', () => {
      const options: AndroidDeviceOpt = {
        androidAdbPath: '/custom/path/to/adb',
        remoteAdbHost: '192.168.1.100',
        remoteAdbPort: 5037,
        imeStrategy: 'yadb-for-non-ascii',
        displayId: 1,
        usePhysicalDisplayIdForScreenshot: true,
        usePhysicalDisplayIdForDisplayLookup: true,
        screenshotResizeScale: 0.5,
        alwaysRefreshScreenInfo: true,
        autoDismissKeyboard: true,
        keyboardDismissStrategy: 'esc-first',
      };

      // Type check - this will fail at compile time if types are incorrect
      expect(options).toBeDefined();
    });

    test('should work with partial options', () => {
      const options: Partial<AndroidDeviceOpt> = {
        androidAdbPath: '/custom/path/to/adb',
      };

      expect(options).toBeDefined();
    });

    test('AndroidDeviceInputOpt should include keyboard options', () => {
      const inputOptions: AndroidDeviceInputOpt = {
        autoDismissKeyboard: true,
        keyboardDismissStrategy: 'back-first',
      };

      expect(inputOptions).toBeDefined();
    });
  });

  describe('IOSDeviceOpt', () => {
    test('should include all required iOS device options', () => {
      const options: IOSDeviceOpt = {
        deviceId: '00008110-000123456789ABCD',
        wdaPort: 8100,
        wdaHost: 'localhost',
        useWDA: true,
        autoDismissKeyboard: true,
      };

      // Type check - this will fail at compile time if types are incorrect
      expect(options).toBeDefined();
    });

    test('should work with partial options', () => {
      const options: Partial<IOSDeviceOpt> = {
        wdaPort: 8100,
      };

      expect(options).toBeDefined();
    });

    test('IOSDeviceInputOpt should include keyboard options', () => {
      const inputOptions: IOSDeviceInputOpt = {
        autoDismissKeyboard: true,
      };

      expect(inputOptions).toBeDefined();
    });
  });

  describe('YAML Environment Types', () => {
    test('MidsceneYamlScriptAndroidEnv should include all AndroidDeviceOpt except customActions', () => {
      const yamlConfig: MidsceneYamlScriptAndroidEnv = {
        // From AndroidDeviceOpt
        deviceId: 'emulator-5554',
        androidAdbPath: '/custom/path/to/adb',
        remoteAdbHost: '192.168.1.100',
        remoteAdbPort: 5037,
        imeStrategy: 'yadb-for-non-ascii',
        displayId: 1,
        usePhysicalDisplayIdForScreenshot: true,
        usePhysicalDisplayIdForDisplayLookup: true,
        screenshotResizeScale: 0.5,
        alwaysRefreshScreenInfo: true,
        autoDismissKeyboard: true,
        keyboardDismissStrategy: 'esc-first',

        // YAML-specific
        launch: 'com.example.app',

        // From MidsceneYamlScriptConfig
        output: './output',
        unstableLogContent: true,
      };

      // @ts-expect-error - customActions should not be allowed in YAML config
      const invalidConfig: MidsceneYamlScriptAndroidEnv = {
        customActions: [],
      };

      expect(yamlConfig).toBeDefined();
      expect(invalidConfig).toBeDefined(); // Runtime check, TS will error
    });

    test('MidsceneYamlScriptIOSEnv should include all IOSDeviceOpt except customActions', () => {
      const yamlConfig: MidsceneYamlScriptIOSEnv = {
        // From IOSDeviceOpt
        deviceId: '00008110-000123456789ABCD',
        wdaPort: 8100,
        wdaHost: 'localhost',
        useWDA: true,
        autoDismissKeyboard: true,

        // YAML-specific
        launch: 'com.example.app',

        // From MidsceneYamlScriptConfig
        output: './output',
        unstableLogContent: true,
      };

      // @ts-expect-error - customActions should not be allowed in YAML config
      const invalidConfig: MidsceneYamlScriptIOSEnv = {
        customActions: [],
      };

      expect(yamlConfig).toBeDefined();
      expect(invalidConfig).toBeDefined(); // Runtime check, TS will error
    });

    test('should work with minimal YAML config', () => {
      const androidMinimal: MidsceneYamlScriptAndroidEnv = {
        deviceId: 'test-device',
      };

      const iosMinimal: MidsceneYamlScriptIOSEnv = {
        wdaPort: 8100,
      };

      expect(androidMinimal).toBeDefined();
      expect(iosMinimal).toBeDefined();
    });
  });

  describe('Type Compatibility', () => {
    test('AndroidDeviceOpt should be assignable to agent function parameter', () => {
      const options: AndroidDeviceOpt = {
        androidAdbPath: '/path/to/adb',
        displayId: 1,
      };

      // This simulates what happens in agentFromAdbDevice
      const processOptions = (opts?: AndroidDeviceOpt) => {
        expect(opts).toBeDefined();
      };

      processOptions(options);
    });

    test('IOSDeviceOpt should be assignable to agent function parameter', () => {
      const options: IOSDeviceOpt = {
        wdaPort: 8100,
        deviceId: 'test-device',
      };

      // This simulates what happens in agentFromWebDriverAgent
      const processOptions = (opts?: IOSDeviceOpt) => {
        expect(opts).toBeDefined();
      };

      processOptions(options);
    });

    test('YAML config should be compatible with device options', () => {
      const yamlAndroidConfig: MidsceneYamlScriptAndroidEnv = {
        androidAdbPath: '/path/to/adb',
        displayId: 1,
        launch: 'com.example.app',
      };

      // Simulate spread operator usage in create-yaml-player
      const deviceOptions: Partial<AndroidDeviceOpt> = {
        ...yamlAndroidConfig,
      };

      expect(deviceOptions.androidAdbPath).toBe('/path/to/adb');
      expect(deviceOptions.displayId).toBe(1);
    });
  });

  describe('IME Strategy Types', () => {
    test('should only accept valid imeStrategy values', () => {
      const validStrategies: Array<AndroidDeviceOpt['imeStrategy']> = [
        'always-yadb',
        'yadb-for-non-ascii',
        undefined,
      ];

      validStrategies.forEach((strategy) => {
        const options: AndroidDeviceOpt = {
          imeStrategy: strategy,
        };
        expect(options).toBeDefined();
      });
    });

    test('should only accept valid keyboardDismissStrategy values', () => {
      const validStrategies: Array<
        AndroidDeviceOpt['keyboardDismissStrategy']
      > = ['esc-first', 'back-first', undefined];

      validStrategies.forEach((strategy) => {
        const options: AndroidDeviceOpt = {
          keyboardDismissStrategy: strategy,
        };
        expect(options).toBeDefined();
      });
    });
  });
});
