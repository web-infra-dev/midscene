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
  vi,
} from 'vitest';
import { HarmonyAgent, agentFromHdcDevice } from '../../src/agent';
import { HarmonyDevice } from '../../src/device';
import * as Utils from '../../src/utils';

vi.mock('../../src/device');
vi.mock('../../src/utils');

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
        actionSpace: vi.fn().mockReturnValue([]),
        screenshotBase64: vi.fn(),
        size: vi.fn(),
        url: vi.fn(),
        launch: vi.fn(),
        destroy: vi.fn(),
        setAppNameMapping: vi.fn(),
      };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
  });

  describe('launch', () => {
    it('should call page.launch with the given uri', async () => {
      const validPngBase64 =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const mockPage = new HarmonyDevice('test-device');

      vi.spyOn(mockPage, 'screenshotBase64').mockResolvedValue(validPngBase64);
      vi.spyOn(mockPage, 'size').mockResolvedValue({ width: 375, height: 812 });
      vi.spyOn(mockPage, 'url').mockResolvedValue('https://example.com');

      const launchSpy = vi
        .spyOn(mockPage, 'launch')
        .mockResolvedValue(mockPage);

      vi.spyOn(mockPage, 'actionSpace').mockReturnValue([
        {
          name: 'Launch',
          paramSchema: undefined,
          call: async (param: any) => {
            return mockPage.launch(param);
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

  describe('agentFromHdcDevice', () => {
    let mockConnect: ReturnType<typeof vi.fn>;

    function setupMockDevice() {
      mockConnect = vi.fn().mockResolvedValue({});
      (HarmonyDevice as Mock).mockImplementation(() => ({
        connect: mockConnect,
        interfaceType: 'harmony',
        actionSpace: vi.fn().mockReturnValue([]),
        screenshotBase64: vi.fn(),
        size: vi.fn().mockResolvedValue({ width: 0, height: 0 }),
        url: vi.fn(),
        launch: vi.fn(),
        setAppNameMapping: vi.fn(),
      }));
    }

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
      const mockDevices = [{ deviceId: 'device-1' }, { deviceId: 'device-2' }];
      vi.spyOn(Utils, 'getConnectedDevices').mockResolvedValue(mockDevices);
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
