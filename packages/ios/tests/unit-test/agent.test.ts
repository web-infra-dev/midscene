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
// TODO(rstest): drop { mock: true } when bare auto-automock lands — https://github.com/web-infra-dev/rspack/pull/14418
rs.mock('../../src/device', { mock: true });

const MockedIOSDevice = rs.mocked(IOSDevice);
const doMockVirtual = rs.doMock as unknown as (
  path: string,
  factory: () => unknown,
  options: { virtual: true },
) => void;

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

    // Skipped under rstest: the override module is loaded in `agent.ts` via a
    // *variable* dynamic import (`await import(overrideModule)`), and these tests
    // rely on `doMock`-ing a virtual module so that runtime import resolves to a
    // stub. rstest resolves module mocks at build time and cannot intercept a
    // variable dynamic import (vitest does so via its runtime registry).
    // TODO(rstest): un-skip when variable dynamic imports become mockable — https://github.com/web-infra-dev/rstest/issues/1454
    it.skip('should load override device class from documented option', async () => {
      const connectSpy = rs.fn().mockResolvedValue(undefined);
      const actionSpaceSpy = rs.fn().mockReturnValue([]);
      const setAppNameMappingSpy = rs.fn();
      const moduleName = 'test-ios-device-override';

      doMockVirtual(
        moduleName,
        () => ({
          IOSDevice: class {
            connect = connectSpy;
            actionSpace = actionSpaceSpy;
            setAppNameMapping = setAppNameMappingSpy;
          },
        }),
        { virtual: true },
      );

      await agentFromWebDriverAgent({
        modelConfig: mockedModelConfig,
        iOSDeviceClassOverride: moduleName,
      });

      expect(connectSpy).toHaveBeenCalledTimes(1);
      rs.doUnmock(moduleName);
    });

    // Same reason as the test above: variable dynamic import of the override
    // module cannot be intercepted.
    // TODO(rstest): un-skip when variable dynamic imports become mockable — https://github.com/web-infra-dev/rstest/issues/1454
    it.skip('should load override device class from env', async () => {
      const connectSpy = rs.fn().mockResolvedValue(undefined);
      const actionSpaceSpy = rs.fn().mockReturnValue([]);
      const setAppNameMappingSpy = rs.fn();
      const moduleName = 'test-ios-device-override-env';
      rs.stubEnv(MIDSCENE_IOS_DEVICE_CLASS_OVERRIDE, moduleName);

      doMockVirtual(
        moduleName,
        () => ({
          default: class {
            connect = connectSpy;
            actionSpace = actionSpaceSpy;
            setAppNameMapping = setAppNameMappingSpy;
          },
        }),
        { virtual: true },
      );

      await agentFromWebDriverAgent({ modelConfig: mockedModelConfig });

      expect(connectSpy).toHaveBeenCalledTimes(1);
      rs.doUnmock(moduleName);
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
