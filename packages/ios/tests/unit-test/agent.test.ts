import path from 'node:path';
import {
  MIDSCENE_IOS_DEVICE_CLASS_OVERRIDE,
  MIDSCENE_MODEL_NAME,
  MIDSCENE_USE_DOUBAO_VISION,
  OPENAI_API_KEY,
  OPENAI_BASE_URL,
} from '@midscene/shared/env';
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';
import { IOSAgent, agentFromWebDriverAgent } from '../../src/agent';
import { IOSDevice } from '../../src/device';

// Mock dependencies
rs.mock('../../src/device');

const MockedIOSDevice = rs.mocked(IOSDevice);

declare global {
  var __iosOverrideConnectFromOption: number | undefined;
  var __iosOverrideConnectFromEnv: number | undefined;
}

const mockedModelConfig = {
  MIDSCENE_MODEL_NAME: 'mock',
  MIDSCENE_MODEL_API_KEY: 'mock',
  MIDSCENE_MODEL_BASE_URL: 'mock',
  MIDSCENE_MODEL_FAMILY: 'doubao-vision',
} as const;

describe('IOSAgent', () => {
  let mockDevice: Partial<IOSDevice>;
  let agent: IOSAgent;

  beforeEach(() => {
    // Set up environment variables for AI model
    rs.stubEnv(MIDSCENE_USE_DOUBAO_VISION, 'true');
    rs.stubEnv(MIDSCENE_MODEL_NAME, 'mock');
    rs.stubEnv(OPENAI_API_KEY, 'mock');
    rs.stubEnv(OPENAI_BASE_URL, 'mock');

    // Create a valid 1x1 PNG image in base64 with data URI prefix
    // This is a minimal valid PNG image (1x1 transparent pixel)
    const validPngBase64 =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    // Create a mock device with actionSpace
    mockDevice = {
      connect: rs.fn().mockResolvedValue(undefined),
      launch: rs.fn().mockResolvedValue(undefined),
      terminate: rs.fn().mockResolvedValue(undefined),
      destroy: rs.fn().mockResolvedValue(undefined),
      runWdaRequest: rs.fn().mockResolvedValue({ success: true }),
      screenshotBase64: rs.fn().mockResolvedValue(validPngBase64),
      size: rs.fn().mockResolvedValue({ width: 375, height: 812 }),
      getElementsInfo: rs.fn().mockResolvedValue([]),
      url: rs.fn().mockResolvedValue('https://example.com'),
      actionSpace: rs.fn().mockReturnValue([
        {
          name: 'Launch',
          paramSchema: undefined,
          call: async (param: any) => {
            return mockDevice.launch!(param.uri);
          },
        },
        {
          name: 'Terminate',
          paramSchema: undefined,
          call: async (param: any) => {
            return mockDevice.terminate!(param.uri);
          },
        },
        {
          name: 'RunWdaRequest',
          paramSchema: undefined,
          call: async (param: any) => {
            return mockDevice.runWdaRequest!(
              param.method,
              param.endpoint,
              param.data,
            );
          },
        },
      ]),
      setAppNameMapping: rs.fn(),
    };

    MockedIOSDevice.mockImplementation(() => mockDevice as IOSDevice);

    agent = new IOSAgent(mockDevice as IOSDevice, {
      modelConfig: mockedModelConfig,
    });
  });

  afterEach(() => {
    rs.clearAllMocks();
    rs.unstubAllEnvs();
  });

  describe('Constructor', () => {
    it('should create IOSAgent with device', () => {
      expect(agent).toBeDefined();
      expect(agent).toBeInstanceOf(IOSAgent);
    });

    it('should inherit from base Agent class', () => {
      expect(agent.page).toBe(mockDevice);
    });
  });

  describe('Launch Method', () => {
    it('should launch app using callActionInActionSpace', async () => {
      const bundleId = 'com.apple.mobilesafari';

      await agent.launch(bundleId);

      expect(mockDevice.launch).toHaveBeenCalledWith(bundleId);
      expect(mockDevice.launch).toHaveBeenCalledTimes(1);
    });

    it('should handle launch errors from actionSpace', async () => {
      const error = new Error('Launch failed');
      mockDevice.launch = rs.fn().mockRejectedValue(error);

      await expect(agent.launch('com.invalid.app')).rejects.toThrow(
        'Launch failed',
      );
    });
  });

  describe('Terminate Method', () => {
    it('should terminate app by bundle ID using callActionInActionSpace', async () => {
      const bundleId = 'com.apple.Preferences';

      await agent.terminate(bundleId);

      expect(mockDevice.terminate).toHaveBeenCalledWith(bundleId);
      expect(mockDevice.terminate).toHaveBeenCalledTimes(1);
    });

    it('should handle terminate errors from actionSpace', async () => {
      const error = new Error('Terminate failed');
      mockDevice.terminate = rs.fn().mockRejectedValue(error);

      await expect(agent.terminate('com.invalid.app')).rejects.toThrow(
        'Terminate failed',
      );
    });
  });

  describe('RunWdaRequest Method', () => {
    it('should execute WDA request through callActionInActionSpace', async () => {
      await agent.runWdaRequest({ method: 'GET', endpoint: '/status' });

      expect(mockDevice.runWdaRequest).toHaveBeenCalledWith(
        'GET',
        '/status',
        undefined,
      );
    });

    it('should support generic type parameter and return result', async () => {
      interface StatusResponse {
        value: { state: string };
      }
      const mockResponse: StatusResponse = { value: { state: 'ready' } };
      mockDevice.runWdaRequest = rs.fn().mockResolvedValue(mockResponse);

      await agent.runWdaRequest({ method: 'GET', endpoint: '/status' });

      expect(mockDevice.runWdaRequest).toHaveBeenCalledWith(
        'GET',
        '/status',
        undefined,
      );
    });

    it('should pass data parameter correctly', async () => {
      const requestData = { key: 'value' };
      mockDevice.runWdaRequest = rs.fn().mockResolvedValue({ success: true });

      await agent.runWdaRequest({
        method: 'POST',
        endpoint: '/wda/keys',
        data: requestData,
      });

      expect(mockDevice.runWdaRequest).toHaveBeenCalledWith(
        'POST',
        '/wda/keys',
        requestData,
      );
    });
  });

  describe('agentFromWebDriverAgent', () => {
    it('should create default IOSDevice when no override is provided', async () => {
      const connectSpy = rs.fn().mockResolvedValue(undefined);
      MockedIOSDevice.mockImplementationOnce(
        () =>
          ({
            connect: connectSpy,
            actionSpace: rs.fn().mockReturnValue([]),
            setAppNameMapping: rs.fn(),
          }) as unknown as IOSDevice,
      );

      await agentFromWebDriverAgent({ modelConfig: mockedModelConfig });

      expect(MockedIOSDevice).toHaveBeenCalledTimes(1);
      expect(connectSpy).toHaveBeenCalledTimes(1);
    });

    // `agent.ts` loads the override via a genuinely dynamic
    // `await import(overrideModule)` where `overrideModule` is a user-supplied
    // runtime value, so it cannot be turned into a static literal nor mocked
    // through rstest's build-time transform. Instead of mocking, point the
    // override at a real on-disk fixture module and observe its `connect()` via
    // a global counter (robust across the rstest-registry / native-loader module
    // realm split).
    it('should load override device class from documented option', async () => {
      const fixture = path.join(
        __dirname,
        'fixtures',
        'ios-device-override.mjs',
      );
      globalThis.__iosOverrideConnectFromOption = 0;

      await agentFromWebDriverAgent({
        modelConfig: mockedModelConfig,
        iOSDeviceClassOverride: fixture,
      });

      expect(globalThis.__iosOverrideConnectFromOption).toBe(1);
      // the default device class must not be used when an override is provided
      expect(MockedIOSDevice).not.toHaveBeenCalled();
    });

    it('should load override device class from env', async () => {
      const fixture = path.join(
        __dirname,
        'fixtures',
        'ios-device-override-env.mjs',
      );
      rs.stubEnv(MIDSCENE_IOS_DEVICE_CLASS_OVERRIDE, fixture);
      globalThis.__iosOverrideConnectFromEnv = 0;

      await agentFromWebDriverAgent({ modelConfig: mockedModelConfig });

      expect(globalThis.__iosOverrideConnectFromEnv).toBe(1);
      expect(MockedIOSDevice).not.toHaveBeenCalled();
    });

    it('should throw clear error when override package is missing', async () => {
      await expect(
        agentFromWebDriverAgent({
          modelConfig: mockedModelConfig,
          iOSDeviceClassOverride: 'missing-ios-device-override-package',
        }),
      ).rejects.toThrow('Failed to load iOS device class override');
    });
  });
});
