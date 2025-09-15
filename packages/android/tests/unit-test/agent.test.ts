import {
  MIDSCENE_MODEL_NAME,
  MIDSCENE_USE_DOUBAO_VISION,
  OPENAI_API_KEY,
  OPENAI_BASE_URL,
} from '@midscene/shared/env';
import { ADB } from 'appium-adb';
import {
  type Mock,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AndroidAgent, agentFromAdbDevice } from '../../src/agent';
import { AndroidDevice } from '../../src/device';
import * as Utils from '../../src/utils';

vi.mock('appium-adb');
vi.mock('../../src/device');
vi.mock('../../src/utils');

const mockedModelConfigFnResult = {
  MIDSCENE_MODEL_NAME: 'mock',
  MIDSCENE_OPENAI_API_KEY: 'mock',
  MIDSCENE_OPENAI_BASE_URL: 'mock',
  MIDSCENE_VL_MODE: 'doubao-vision',
} as const;

describe('AndroidAgent', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create AndroidAgent successfully', () => {
      const mockPage = new AndroidDevice('test-device');
      expect(
        () =>
          new AndroidAgent(mockPage, {
            modelConfig: () => mockedModelConfigFnResult,
          }),
      ).not.toThrow();
    });
  });

  describe('launch', () => {
    it('should call page.launch with the given uri', async () => {
      const mockPage = new AndroidDevice('test-device');
      const agent = new AndroidAgent(mockPage, {
        modelConfig: () => mockedModelConfigFnResult,
      });
      const launchSpy = vi.spyOn(mockPage, 'launch');
      const uri = 'https://example.com';

      await agent.launch(uri);

      expect(launchSpy).toHaveBeenCalledWith(uri);
    });
  });

  describe('agentFromAdbDevice', () => {
    beforeEach(() => {
      vi.stubEnv(MIDSCENE_USE_DOUBAO_VISION, 'true');
      vi.stubEnv(MIDSCENE_MODEL_NAME, 'mock');
      vi.stubEnv(OPENAI_API_KEY, 'mock');
      vi.stubEnv(OPENAI_BASE_URL, 'mock');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('should use the first device if no deviceId is provided', async () => {
      const mockDevices = [{ udid: 'device-1' }, { udid: 'device-2' }];
      vi.spyOn(Utils, 'getConnectedDevices').mockResolvedValue(
        mockDevices as any,
      );
      const mockConnect = vi.fn().mockResolvedValue(new ADB());
      (AndroidDevice as Mock).mockImplementation((deviceId, options) => {
        return {
          connect: mockConnect,
          constructor: vi.fn(),
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
      const mockConnect = vi.fn().mockResolvedValue(new ADB());
      (AndroidDevice as Mock).mockImplementation((deviceId, options) => {
        return {
          connect: mockConnect,
          constructor: vi.fn(),
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
      const mockConnect = vi.fn().mockResolvedValue(new ADB());
      (AndroidDevice as Mock).mockImplementation((deviceId, options) => {
        return {
          connect: mockConnect,
          constructor: vi.fn(),
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
