import * as Env from '@midscene/shared/env';
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
import * as Utils from '../../src/agent';
import { AndroidDevice } from '../../src/device';

vi.mock('appium-adb');
vi.mock('../../src/device');
vi.mock('../../src/agent');
vi.mock('@midscene/shared/env');

describe('AndroidAgent', () => {
  let vlLocateModeSpy: any;

  beforeEach(() => {
    vlLocateModeSpy = vi.spyOn(Env, 'vlLocateMode');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should throw an error if vlLocateMode is false', () => {
      vlLocateModeSpy.mockReturnValue(false);
      const mockPage = new AndroidDevice('test-device');
      expect(() => new AndroidAgent(mockPage)).toThrow(
        'Android Agent only supports vl-model. https://midscenejs.com/choose-a-model.html',
      );
    });

    it('should not throw an error if vlLocateMode is true', () => {
      vlLocateModeSpy.mockReturnValue(true);
      const mockPage = new AndroidDevice('test-device');
      expect(() => new AndroidAgent(mockPage)).not.toThrow();
    });
  });

  describe('launch', () => {
    it('should call page.launch with the given uri', async () => {
      vlLocateModeSpy.mockReturnValue(true);
      const mockPage = new AndroidDevice('test-device');
      const agent = new AndroidAgent(mockPage);
      const launchSpy = vi.spyOn(mockPage, 'launch');
      const uri = 'https://example.com';

      await agent.launch(uri);

      expect(launchSpy).toHaveBeenCalledWith(uri);
    });
  });

  describe('agentFromAdbDevice', () => {
    it('should use the first device if no deviceId is provided', async () => {
      vlLocateModeSpy.mockReturnValue(true);
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
      vlLocateModeSpy.mockReturnValue(true);
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
      vlLocateModeSpy.mockReturnValue(true);
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
