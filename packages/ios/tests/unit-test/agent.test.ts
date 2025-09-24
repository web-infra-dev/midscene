import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IOSAgent } from '../../src/agent';
import { IOSDevice } from '../../src/device';
import * as utils from '../../src/utils';

// Mock dependencies
vi.mock('../../src/device');
vi.mock('../../src/utils');

const MockedIOSDevice = vi.mocked(IOSDevice);
const mockedUtils = vi.mocked(utils);

describe('IOSAgent', () => {
  let mockDevice: Partial<IOSDevice>;
  let agent: IOSAgent;

  beforeEach(() => {
    // Create a mock device
    mockDevice = {
      connect: vi.fn().mockResolvedValue(undefined),
      launch: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn().mockResolvedValue(undefined),
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
    it('should launch app using device launch method', async () => {
      const bundleId = 'com.apple.mobilesafari';

      await agent.launch(bundleId);

      expect(mockDevice.launch).toHaveBeenCalledWith(bundleId);
      expect(mockDevice.launch).toHaveBeenCalledTimes(1);
    });

    it('should handle launch errors', async () => {
      const error = new Error('Launch failed');
      mockDevice.launch = vi.fn().mockRejectedValue(error);

      await expect(agent.launch('com.invalid.app')).rejects.toThrow(
        'Launch failed',
      );
    });
  });
});
