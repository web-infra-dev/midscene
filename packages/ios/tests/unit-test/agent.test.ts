import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IOSAgent } from '../../src/agent';
import { IOSDevice } from '../../src/device';

// Mock dependencies
vi.mock('../../src/device');

const MockedIOSDevice = vi.mocked(IOSDevice);

describe('IOSAgent', () => {
  let mockDevice: Partial<IOSDevice>;
  let agent: IOSAgent;

  beforeEach(() => {
    // Create a valid 1x1 PNG image in base64 with data URI prefix
    // This is a minimal valid PNG image (1x1 transparent pixel)
    const validPngBase64 =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    // Create a mock device with actionSpace
    mockDevice = {
      connect: vi.fn().mockResolvedValue(undefined),
      launch: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn().mockResolvedValue(undefined),
      runWdaRequest: vi.fn().mockResolvedValue({ success: true }),
      screenshotBase64: vi.fn().mockResolvedValue(validPngBase64),
      size: vi.fn().mockResolvedValue({ width: 375, height: 812 }),
      getElementsInfo: vi.fn().mockResolvedValue([]),
      url: vi.fn().mockResolvedValue('https://example.com'),
      actionSpace: vi.fn().mockReturnValue([
        {
          name: 'Launch',
          paramSchema: undefined,
          call: async (param: any) => {
            return mockDevice.launch!(param.uri);
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
    };

    MockedIOSDevice.mockImplementation(() => mockDevice as IOSDevice);

    agent = new IOSAgent(mockDevice as IOSDevice);
  });

  afterEach(() => {
    vi.clearAllMocks();
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
      mockDevice.launch = vi.fn().mockRejectedValue(error);

      await expect(agent.launch('com.invalid.app')).rejects.toThrow(
        'Launch failed',
      );
    });
  });

  describe('RunWdaRequest Method', () => {
    it('should execute WDA request through callActionInActionSpace', async () => {
      await agent.runWdaRequest('GET', '/status');

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
      mockDevice.runWdaRequest = vi.fn().mockResolvedValue(mockResponse);

      await agent.runWdaRequest<StatusResponse>('GET', '/status');

      expect(mockDevice.runWdaRequest).toHaveBeenCalledWith(
        'GET',
        '/status',
        undefined,
      );
    });

    it('should pass data parameter correctly', async () => {
      const requestData = { key: 'value' };
      mockDevice.runWdaRequest = vi.fn().mockResolvedValue({ success: true });

      await agent.runWdaRequest('POST', '/wda/keys', requestData);

      expect(mockDevice.runWdaRequest).toHaveBeenCalledWith(
        'POST',
        '/wda/keys',
        requestData,
      );
    });
  });
});
