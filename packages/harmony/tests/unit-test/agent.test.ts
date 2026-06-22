import {
  MIDSCENE_MODEL_NAME,
  MIDSCENE_USE_DOUBAO_VISION,
  OPENAI_API_KEY,
  OPENAI_BASE_URL,
} from '@midscene/shared/env';
import { normalizeForComparison } from '@midscene/shared/utils';
import {
  type Mock,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  rs,
} from '@rstest/core';
import { HarmonyAgent, agentFromHdcDevice } from '../../src/agent';
import { HarmonyDevice } from '../../src/device';
import * as Utils from '../../src/utils';

// TODO(rstest): drop { mock: true } when bare auto-automock lands — https://github.com/web-infra-dev/rspack/pull/14418
rs.mock('../../src/device', { mock: true });
rs.mock('../../src/utils', { mock: true });

const mockedModelConfig = {
  MIDSCENE_MODEL_NAME: 'mock',
  MIDSCENE_MODEL_API_KEY: 'mock',
  MIDSCENE_MODEL_BASE_URL: 'mock',
  MIDSCENE_MODEL_FAMILY: 'doubao-vision',
} as const;

describe('HarmonyAgent', () => {
  beforeEach(() => {
    (HarmonyDevice as Mock).mockImplementation(() => {
      return {
        interfaceType: 'harmony',
        actionSpace: rs.fn().mockReturnValue([]),
        screenshotBase64: rs.fn(),
        size: rs.fn(),
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
    it('should create HarmonyAgent successfully', () => {
      const mockPage = new HarmonyDevice('test-device');
      expect(
        () =>
          new HarmonyAgent(mockPage, {
            modelConfig: mockedModelConfig,
          }),
      ).not.toThrow();
    });

    it('should inject default music app name mappings into device', () => {
      const mockPage = new HarmonyDevice('test-device');
      const setAppNameMappingSpy = rs.spyOn(mockPage, 'setAppNameMapping');

      new HarmonyAgent(mockPage, {
        modelConfig: mockedModelConfig,
      });

      expect(setAppNameMappingSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          [normalizeForComparison('华为音乐')]: 'com.huawei.hmsapp.music',
          [normalizeForComparison('Music')]: 'com.huawei.hmsapp.music',
        }),
      );
    });
  });

  describe('launch', () => {
    it('should call page.launch with the given uri', async () => {
      const validPngBase64 =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const mockPage = new HarmonyDevice('test-device');

      rs.spyOn(mockPage, 'screenshotBase64').mockResolvedValue(validPngBase64);
      rs.spyOn(mockPage, 'size').mockResolvedValue({ width: 375, height: 812 });

      const launchSpy = rs
        .spyOn(mockPage, 'launch')
        .mockResolvedValue(mockPage);

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
          name: 'RunHdcShell',
          paramSchema: undefined,
          call: async (param: any) => {
            return '';
          },
        },
      ] as any);

      const agent = new HarmonyAgent(mockPage, {
        modelConfig: mockedModelConfig,
      });

      const uri = 'https://example.com';

      await agent.launch(uri);

      expect(launchSpy).toHaveBeenCalledWith({ uri });
    });
  });

  describe('terminate', () => {
    it('should call page.terminate with the given uri', async () => {
      const validPngBase64 =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const mockPage = new HarmonyDevice('test-device');
      rs.spyOn(mockPage, 'screenshotBase64').mockResolvedValue(validPngBase64);
      rs.spyOn(mockPage, 'size').mockResolvedValue({ width: 375, height: 812 });
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
        { name: 'RunHdcShell', paramSchema: undefined, call: async () => '' },
      ] as any);

      const agent = new HarmonyAgent(mockPage, {
        modelConfig: mockedModelConfig,
      });

      await agent.terminate('com.huawei.hmos.settings');
      expect(terminateSpy).toHaveBeenCalledWith('com.huawei.hmos.settings');
    });
  });

  describe('agentFromHdcDevice', () => {
    let mockConnect: ReturnType<typeof rs.fn>;

    function setupMockDevice() {
      mockConnect = rs.fn().mockResolvedValue({});
      (HarmonyDevice as Mock).mockImplementation(() => ({
        connect: mockConnect,
        interfaceType: 'harmony',
        actionSpace: rs.fn().mockReturnValue([]),
        screenshotBase64: rs.fn(),
        size: rs.fn().mockResolvedValue({ width: 0, height: 0 }),
        url: rs.fn(),
        launch: rs.fn(),
        setAppNameMapping: rs.fn(),
      }));
    }

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
      const mockDevices = [{ deviceId: 'device-1' }, { deviceId: 'device-2' }];
      rs.spyOn(Utils, 'getConnectedDevices').mockResolvedValue(mockDevices);
      setupMockDevice();

      const agent = await agentFromHdcDevice();

      expect(Utils.getConnectedDevices).toHaveBeenCalled();
      expect(HarmonyDevice).toHaveBeenCalledWith(
        'device-1',
        expect.any(Object),
      );
      expect(mockConnect).toHaveBeenCalled();
      expect(agent).toBeInstanceOf(HarmonyAgent);
    });

    it('should use the specified deviceId', async () => {
      setupMockDevice();

      const agent = await agentFromHdcDevice('test-device-id');

      expect(HarmonyDevice).toHaveBeenCalledWith(
        'test-device-id',
        expect.any(Object),
      );
      expect(mockConnect).toHaveBeenCalled();
      expect(agent).toBeInstanceOf(HarmonyAgent);
    });

    it('should pass options to HarmonyDevice', async () => {
      setupMockDevice();

      const options = {
        autoDismissKeyboard: false,
        hdcPath: '/path/to/hdc',
      };

      await agentFromHdcDevice('test-device-id', options);

      expect(HarmonyDevice).toHaveBeenCalledWith('test-device-id', options);
    });
  });
});
