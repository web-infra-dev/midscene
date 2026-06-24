import {
  MIDSCENE_MODEL_NAME,
  MIDSCENE_USE_DOUBAO_VISION,
  OPENAI_API_KEY,
  OPENAI_BASE_URL,
} from '@midscene/shared/env';
import {
  type Mock,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  rs,
} from '@rstest/core';
import { ADB } from 'appium-adb';
import { AndroidAgent, agentFromAdbDevice } from '../../src/agent';
import { AndroidDevice } from '../../src/device';
import * as Utils from '../../src/utils';

// TODO(rstest): drop { mock: true } when bare auto-automock lands — https://github.com/web-infra-dev/rspack/pull/14418
rs.mock('appium-adb', { mock: true });
rs.mock('../../src/device', { mock: true });
rs.mock('../../src/utils', { mock: true });

const MockedAndroidDevice = AndroidDevice as unknown as Mock;

const mockedModelConfig = {
  MIDSCENE_MODEL_NAME: 'mock',
  MIDSCENE_MODEL_API_KEY: 'mock',
  MIDSCENE_MODEL_BASE_URL: 'mock',
  MIDSCENE_MODEL_FAMILY: 'doubao-vision',
} as const;

describe('AndroidAgent', () => {
  beforeEach(() => {
    MockedAndroidDevice.mockImplementation(() => {
      return {
        interfaceType: 'android',
        actionSpace: rs.fn().mockReturnValue([]),
        screenshotBase64: rs.fn(),
        size: rs.fn(),
        getElementsInfo: rs.fn(),
        url: rs.fn(),
        launch: rs.fn(),
        destroy: rs.fn(),
        setAppNameMapping: rs.fn(),
      };
    });
  });

  afterEach(() => {
    rs.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create AndroidAgent successfully', () => {
      const mockPage = new AndroidDevice('test-device');
      expect(
        () =>
          new AndroidAgent(mockPage, {
            modelConfig: mockedModelConfig,
          }),
      ).not.toThrow();
    });
  });

  describe('launch', () => {
    it('should call page.launch with the given uri', async () => {
      // Create a valid 1x1 PNG image in base64 with data URI prefix
      const validPngBase64 =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const mockPage = new AndroidDevice('test-device');

      // Add necessary mocks for the device
      rs.spyOn(mockPage, 'screenshotBase64').mockResolvedValue(validPngBase64);
      rs.spyOn(mockPage, 'size').mockResolvedValue({ width: 375, height: 812 });
      rs.spyOn(mockPage, 'getElementsInfo').mockResolvedValue([]);
      rs.spyOn(mockPage, 'url').mockResolvedValue('https://example.com');

      const launchSpy = rs
        .spyOn(mockPage, 'launch')
        .mockResolvedValue(mockPage);

      // Mock actionSpace to call the actual device methods
      rs.spyOn(mockPage, 'actionSpace').mockReturnValue([
        {
          name: 'Launch',
          paramSchema: undefined,
          call: async (param: any) => {
            return mockPage.launch(param);
          },
        },
        {
          name: 'Terminate',
          paramSchema: undefined,
          call: async (param: any) => {
            return mockPage.terminate(param.uri);
          },
        },
        {
          name: 'RunAdbShell',
          paramSchema: undefined,
          call: async (param: any) => {
            // Mock implementation for runAdbShell if needed
            return '';
          },
        },
      ] as any);

      const agent = new AndroidAgent(mockPage, {
        modelConfig: mockedModelConfig,
      });

      const uri = 'https://example.com';

      await agent.launch(uri);

      // agent.launch(uri) converts string to { uri } object before calling device action
      expect(launchSpy).toHaveBeenCalledWith({ uri });
    });
  });

  describe('terminate', () => {
    it('should call page.terminate with the given uri', async () => {
      const validPngBase64 =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const mockPage = new AndroidDevice('test-device');
      rs.spyOn(mockPage, 'screenshotBase64').mockResolvedValue(validPngBase64);
      rs.spyOn(mockPage, 'size').mockResolvedValue({ width: 375, height: 812 });
      rs.spyOn(mockPage, 'getElementsInfo').mockResolvedValue([]);
      rs.spyOn(mockPage, 'url').mockResolvedValue('https://example.com');
      if (typeof (mockPage as any).terminate !== 'function') {
        (mockPage as any).terminate = rs.fn().mockResolvedValue(undefined);
      }
      const terminateSpy = rs
        .spyOn(mockPage as any, 'terminate')
        .mockResolvedValue(undefined);
      rs.spyOn(mockPage, 'actionSpace').mockReturnValue([
        { name: 'Launch', paramSchema: undefined, call: async () => {} },
        {
          name: 'Terminate',
          paramSchema: undefined,
          call: async (param: any) => mockPage.terminate(param.uri),
        },
        { name: 'RunAdbShell', paramSchema: undefined, call: async () => '' },
      ] as any);

      const agent = new AndroidAgent(mockPage, {
        modelConfig: mockedModelConfig,
      });

      await agent.terminate('com.android.settings');
      expect(terminateSpy).toHaveBeenCalledWith('com.android.settings');
    });
  });

  describe('runAdbShell', () => {
    it('should pass timeout options to adb.shell without changing action schema', async () => {
      const mockPage = new AndroidDevice('test-device');
      const shell = rs.fn().mockResolvedValue({
        stdout: 'adb-result',
        stderr: '',
      });
      (mockPage as any).getAdb = rs.fn().mockResolvedValue({
        shell,
        EXEC_OUTPUT_FORMAT: { FULL: 'full' },
      });

      const agent = new AndroidAgent(mockPage, {
        modelConfig: mockedModelConfig,
      });

      await expect(
        agent.runAdbShell('sleep 2', { timeout: 2_000 }),
      ).resolves.toBe('adb-result');
      expect(shell).toHaveBeenCalledWith('sleep 2', {
        timeout: 2_000,
        outputFormat: 'full',
      });
    });

    it('should return raw adb shell output when timeout options bypass action space', async () => {
      const mockPage = new AndroidDevice('test-device');
      const rawOutput = `Result: Parcel(
        0x00000000: fffffffd 00000008 006f004e 00690020 '........N.o. .i.'
        0x00000010: 00650074 0073006d 00000000 000003a4 't.e.m.s.........'
      )`;
      const shell = rs.fn().mockResolvedValue({
        stdout: rawOutput,
        stderr: '',
      });
      (mockPage as any).getAdb = rs.fn().mockResolvedValue({
        shell,
        EXEC_OUTPUT_FORMAT: { FULL: 'full' },
      });

      const agent = new AndroidAgent(mockPage, {
        modelConfig: mockedModelConfig,
      });

      await expect(
        agent.runAdbShell('service call clipboard 2', { timeout: 2_000 }),
      ).resolves.toBe(rawOutput);
      expect(shell).toHaveBeenCalledWith('service call clipboard 2', {
        timeout: 2_000,
        outputFormat: 'full',
      });
    });

    it('should throw when adb shell exits zero with stderr output', async () => {
      const mockPage = new AndroidDevice('test-device');
      const shell = rs.fn().mockResolvedValue({
        stdout: '',
        stderr: 'No shell command implementation.',
      });
      (mockPage as any).getAdb = rs.fn().mockResolvedValue({
        shell,
        EXEC_OUTPUT_FORMAT: { FULL: 'full' },
      });

      const agent = new AndroidAgent(mockPage, {
        modelConfig: mockedModelConfig,
      });

      await expect(
        agent.runAdbShell('cmd clipboard set-text "Tracking #: 5K672F4C"', {
          timeout: 2_000,
        }),
      ).rejects.toThrow(
        /RunAdbShell command returned stderr\.[\s\S]*No shell command implementation\./,
      );
    });

    it('should truncate stdout and stderr in adb shell stderr errors', async () => {
      const mockPage = new AndroidDevice('test-device');
      const shell = rs.fn().mockResolvedValue({
        stdout: 'o'.repeat(240),
        stderr: 'e'.repeat(240),
      });
      (mockPage as any).getAdb = rs.fn().mockResolvedValue({
        shell,
        EXEC_OUTPUT_FORMAT: { FULL: 'full' },
      });

      const agent = new AndroidAgent(mockPage, {
        modelConfig: mockedModelConfig,
      });

      await expect(
        agent.runAdbShell('cmd test', { timeout: 2_000 }),
      ).rejects.toThrow(`Stderr:
${'e'.repeat(200)}
...[stderr truncated, 40 more characters]
Stdout:
${'o'.repeat(200)}
...[stdout truncated, 40 more characters]`);
    });

    it('should return raw adb shell output from RunAdbShell action wrapper', async () => {
      const device = new AndroidDevice('test-device');
      const validPngBase64 =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const rawOutput = `Result: Parcel(
        0x00000000: fffffffd 00000008 006f004e 00690020 '........N.o. .i.'
        0x00000010: 00650074 0073006d 00000000 000003a4 't.e.m.s.........'
      )`;
      const runAdbShellCall = rs.fn().mockResolvedValue(rawOutput);
      rs.spyOn(device, 'screenshotBase64').mockResolvedValue(validPngBase64);
      rs.spyOn(device, 'size').mockResolvedValue({ width: 375, height: 812 });
      rs.spyOn(device, 'getElementsInfo').mockResolvedValue([]);
      rs.spyOn(device, 'url').mockResolvedValue('https://example.com');
      rs.spyOn(device, 'actionSpace').mockReturnValue([
        {
          name: 'RunAdbShell',
          paramSchema: undefined,
          call: runAdbShellCall,
        },
      ] as any);

      const agent = new AndroidAgent(device, {
        modelConfig: mockedModelConfig,
      });

      await expect(agent.runAdbShell('service call clipboard 2')).resolves.toBe(
        rawOutput,
      );
      expect(runAdbShellCall).toHaveBeenCalledWith(
        {
          command: 'service call clipboard 2',
        },
        expect.any(Object),
      );
    });
  });

  describe('agentFromAdbDevice', () => {
    beforeEach(() => {
      rs.stubEnv(MIDSCENE_USE_DOUBAO_VISION, 'true');
      rs.stubEnv(MIDSCENE_MODEL_NAME, 'mock');
      rs.stubEnv(OPENAI_API_KEY, 'mock');
      rs.stubEnv(OPENAI_BASE_URL, 'mock');
    });

    afterEach(() => {
      rs.unstubAllEnvs();
    });

    it('should use the first device if no deviceId is provided', async () => {
      const mockDevices = [{ udid: 'device-1' }, { udid: 'device-2' }];
      rs.spyOn(Utils, 'getConnectedDevices').mockResolvedValue(
        mockDevices as any,
      );
      const mockConnect = rs.fn().mockResolvedValue(new ADB());
      MockedAndroidDevice.mockImplementation((deviceId, options) => {
        return {
          connect: mockConnect,
          constructor: rs.fn(),
          interfaceType: 'android',
          actionSpace: rs.fn().mockReturnValue([]),
          screenshotBase64: rs.fn(),
          size: rs.fn().mockResolvedValue({ width: 0, height: 0 }),
          getElementsInfo: rs.fn(),
          url: rs.fn(),
          launch: rs.fn(),
          setAppNameMapping: rs.fn(),
        };
      });

      const agent = await agentFromAdbDevice();

      expect(Utils.getConnectedDevices).toHaveBeenCalled();
      expect(AndroidDevice).toHaveBeenCalledWith(
        'device-1',
        expect.any(Object),
      );
      expect(mockConnect).toHaveBeenCalled();
      expect(agent).toBeInstanceOf(AndroidAgent);
    });

    it('should use the specified deviceId', async () => {
      const mockConnect = rs.fn().mockResolvedValue(new ADB());
      MockedAndroidDevice.mockImplementation((deviceId, options) => {
        return {
          connect: mockConnect,
          constructor: rs.fn(),
          interfaceType: 'android',
          actionSpace: rs.fn().mockReturnValue([]),
          screenshotBase64: rs.fn(),
          size: rs.fn().mockResolvedValue({ width: 0, height: 0 }),
          getElementsInfo: rs.fn(),
          url: rs.fn(),
          launch: rs.fn(),
          setAppNameMapping: rs.fn(),
        };
      });

      const agent = await agentFromAdbDevice('test-device-id');

      expect(AndroidDevice).toHaveBeenCalledWith(
        'test-device-id',
        expect.any(Object),
      );
      expect(mockConnect).toHaveBeenCalled();
      expect(agent).toBeInstanceOf(AndroidAgent);
    });

    it('should pass options to AndroidDevice', async () => {
      const mockConnect = rs.fn().mockResolvedValue(new ADB());
      MockedAndroidDevice.mockImplementation((deviceId, options) => {
        return {
          connect: mockConnect,
          constructor: rs.fn(),
          interfaceType: 'android',
          actionSpace: rs.fn().mockReturnValue([]),
          screenshotBase64: rs.fn(),
          size: rs.fn().mockResolvedValue({ width: 0, height: 0 }),
          getElementsInfo: rs.fn(),
          url: rs.fn(),
          launch: rs.fn(),
          setAppNameMapping: rs.fn(),
        };
      });

      const options = {
        autoDismissKeyboard: false,
        androidAdbPath: '/path/to/adb',
        remoteAdbHost: 'localhost',
        remoteAdbPort: 5037,
        imeStrategy: 'yadb-for-non-ascii' as const,
      };

      await agentFromAdbDevice('test-device-id', options);

      expect(AndroidDevice).toHaveBeenCalledWith('test-device-id', options);
    });
  });
});
