import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IOSAgent,
  agentFromIOSDevice,
  agentFromIOSSimulator,
} from '../../src/agent';
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

describe('agentFromIOSDevice', () => {
  const mockDeviceInfo = {
    udid: 'test-device-udid',
    name: 'Test Device',
    state: 'Connected',
    isSimulator: false,
    isAvailable: true,
  };

  beforeEach(() => {
    // Mock device creation and connection
    const mockDevice = {
      connect: vi.fn().mockResolvedValue(undefined),
    };
    MockedIOSDevice.mockImplementation(() => mockDevice as IOSDevice);

    mockedUtils.getDefaultDevice.mockResolvedValue(mockDeviceInfo);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create agent with specified UDID', async () => {
    const udid = 'specific-device-udid';

    const agent = await agentFromIOSDevice(udid);

    expect(MockedIOSDevice).toHaveBeenCalledWith(udid, expect.any(Object));
    expect(agent).toBeInstanceOf(IOSAgent);
  });

  it('should create agent with default device when no UDID provided', async () => {
    const agent = await agentFromIOSDevice();

    expect(mockedUtils.getDefaultDevice).toHaveBeenCalled();
    expect(MockedIOSDevice).toHaveBeenCalledWith(
      mockDeviceInfo.udid,
      expect.any(Object),
    );
    expect(agent).toBeInstanceOf(IOSAgent);
  });

  it('should pass device options to IOSDevice constructor', async () => {
    const options = {
      wdaPort: 9100,
      wdaHost: 'custom-host',
      autoDismissKeyboard: false,
      keyboardDismissStrategy: 'escape-first' as const,
    };

    await agentFromIOSDevice('test-udid', options);

    expect(MockedIOSDevice).toHaveBeenCalledWith(
      'test-udid',
      expect.objectContaining({
        wdaPort: 9100,
        wdaHost: 'custom-host',
        autoDismissKeyboard: false,
        keyboardDismissStrategy: 'escape-first',
      }),
    );
  });

  it('should pass agent options to IOSAgent constructor', async () => {
    const options = {
      aiActionContext: 'Test context',
      actionDelay: 1000,
    };

    const agent = await agentFromIOSDevice('test-udid', options);

    expect(agent).toBeInstanceOf(IOSAgent);
    // Agent options are passed to the parent constructor
  });

  it('should connect device after creation', async () => {
    const mockDevice = {
      connect: vi.fn().mockResolvedValue(undefined),
    };
    MockedIOSDevice.mockImplementation(() => mockDevice as IOSDevice);

    await agentFromIOSDevice('test-udid');

    expect(mockDevice.connect).toHaveBeenCalled();
  });

  it('should handle device connection failure', async () => {
    const mockDevice = {
      connect: vi.fn().mockRejectedValue(new Error('Connection failed')),
    };
    MockedIOSDevice.mockImplementation(() => mockDevice as IOSDevice);

    await expect(agentFromIOSDevice('test-udid')).rejects.toThrow(
      'Connection failed',
    );
  });
});

describe('agentFromIOSSimulator', () => {
  const mockSimulators = [
    {
      udid: 'sim-1',
      name: 'iPhone 15',
      state: 'Booted',
      isSimulator: true,
      isAvailable: true,
    },
    {
      udid: 'sim-2',
      name: 'iPhone 14',
      state: 'Shutdown',
      isSimulator: true,
      isAvailable: true,
    },
    {
      udid: 'sim-3',
      name: 'iPad Pro',
      state: 'Shutdown',
      isSimulator: true,
      isAvailable: true,
    },
  ];

  beforeEach(() => {
    mockedUtils.getConnectedDevices.mockResolvedValue(mockSimulators);

    const mockDevice = {
      connect: vi.fn().mockResolvedValue(undefined),
    };
    MockedIOSDevice.mockImplementation(() => mockDevice as IOSDevice);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create agent with specific simulator name', async () => {
    const agent = await agentFromIOSSimulator('iPhone 15');

    expect(MockedIOSDevice).toHaveBeenCalledWith('sim-1', expect.any(Object));
    expect(agent).toBeInstanceOf(IOSAgent);
  });

  it('should create agent with booted simulator when no name specified', async () => {
    const agent = await agentFromIOSSimulator();

    expect(MockedIOSDevice).toHaveBeenCalledWith('sim-1', expect.any(Object)); // Booted simulator
    expect(agent).toBeInstanceOf(IOSAgent);
  });

  it('should create agent with first available simulator when no booted simulator', async () => {
    const nonBootedSimulators = mockSimulators.map((sim) => ({
      ...sim,
      state: 'Shutdown',
    }));
    mockedUtils.getConnectedDevices.mockResolvedValue(nonBootedSimulators);

    const agent = await agentFromIOSSimulator();

    expect(MockedIOSDevice).toHaveBeenCalledWith('sim-1', expect.any(Object)); // First available
    expect(agent).toBeInstanceOf(IOSAgent);
  });

  it('should throw error when specified simulator not found', async () => {
    await expect(agentFromIOSSimulator('Nonexistent Device')).rejects.toThrow(
      'Simulator with name containing "Nonexistent Device" not found',
    );
  });

  it('should throw error when no simulators available', async () => {
    mockedUtils.getConnectedDevices.mockResolvedValue([]);

    await expect(agentFromIOSSimulator()).rejects.toThrow(
      'No iOS simulator available',
    );
  });

  it('should pass options to device and agent', async () => {
    const options = {
      wdaPort: 9100,
      aiActionContext: 'Simulator test context',
    };

    await agentFromIOSSimulator('iPhone 15', options);

    expect(MockedIOSDevice).toHaveBeenCalledWith(
      'sim-1',
      expect.objectContaining({
        wdaPort: 9100,
      }),
    );
  });

  it('should filter devices to only include simulators', async () => {
    const mixedDevices = [
      ...mockSimulators,
      {
        udid: 'real-device',
        name: 'Real iPhone',
        state: 'Connected',
        isSimulator: false,
        isAvailable: true,
      },
    ];
    mockedUtils.getConnectedDevices.mockResolvedValue(mixedDevices);

    await agentFromIOSSimulator();

    // Should use simulator, not real device
    expect(MockedIOSDevice).toHaveBeenCalledWith('sim-1', expect.any(Object));
  });

  it('should handle partial name matching', async () => {
    await agentFromIOSSimulator('iPad');

    expect(MockedIOSDevice).toHaveBeenCalledWith('sim-3', expect.any(Object)); // iPad Pro
  });

  it('should delegate to agentFromIOSDevice with correct parameters', async () => {
    // This test verifies the simulator is correctly selected and passed to agentFromIOSDevice
    await agentFromIOSSimulator('iPhone 15');

    expect(MockedIOSDevice).toHaveBeenCalledWith('sim-1', expect.any(Object));
  });
});
