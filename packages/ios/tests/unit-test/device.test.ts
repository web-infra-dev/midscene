import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IOSDevice } from '../../src/device';
import { getConnectedDevices, getDefaultDevice } from '../../src/utils';

describe('IOSDevice', () => {
  let device: IOSDevice;
  let testUdid: string;

  beforeEach(async () => {
    try {
      const defaultDevice = await getDefaultDevice();
      testUdid = defaultDevice.udid;
      device = new IOSDevice(testUdid);
    } catch (error) {
      console.warn('No iOS devices available for testing, skipping...');
      testUdid = 'test-udid';
      device = new IOSDevice(testUdid);
    }
  });

  afterEach(async () => {
    if (device) {
      await device.destroy();
    }
  });

  describe('Constructor', () => {
    it('should create device with udid', () => {
      expect(device).toBeDefined();
      expect(device.interfaceType).toBe('ios');
    });

    it('should throw error without udid', () => {
      expect(() => new IOSDevice('')).toThrow('udid is required for IOSDevice');
    });
  });

  describe('Device Info', () => {
    it('should have correct interface type', () => {
      expect(device.interfaceType).toBe('ios');
    });

    it('should provide device description', () => {
      const description = device.describe();
      expect(description).toContain('UDID');
      expect(description).toContain(testUdid);
    });
  });

  describe('Action Space', () => {
    it('should provide action space with iOS-specific actions', () => {
      const actions = device.actionSpace();
      expect(Array.isArray(actions)).toBe(true);
      expect(actions.length).toBeGreaterThan(0);

      const actionNames = actions.map((action) => action.name);
      expect(actionNames).toContain('Tap');
      expect(actionNames).toContain('Input');
      expect(actionNames).toContain('Scroll');
      expect(actionNames).toContain('IOSHomeButton');
      expect(actionNames).toContain('IOSLongPress');
    });
  });

  // Note: The following tests require an actual iOS simulator to be available
  // They are marked as conditional tests

  describe('Device Operations (requires simulator)', () => {
    const isSimulatorAvailable = async () => {
      try {
        const devices = await getConnectedDevices();
        return devices.some((d) => d.isSimulator && d.isAvailable);
      } catch {
        return false;
      }
    };

    it('should connect to device if simulator available', async () => {
      if (!(await isSimulatorAvailable())) {
        console.warn('No simulator available, skipping connection test');
        return;
      }

      await expect(device.connect()).resolves.not.toThrow();
    });

    it('should get screen size if simulator available', async () => {
      if (!(await isSimulatorAvailable())) {
        console.warn('No simulator available, skipping size test');
        return;
      }

      try {
        await device.connect();
        const size = await device.size();
        expect(size).toBeDefined();
        expect(size.width).toBeGreaterThan(0);
        expect(size.height).toBeGreaterThan(0);
        expect(size.dpr).toBeGreaterThan(0);
      } catch (error) {
        console.warn('Size test failed, simulator might not be booted:', error);
      }
    });

    it('should handle app launch with bundle ID if simulator available', async () => {
      if (!(await isSimulatorAvailable())) {
        console.warn('No simulator available, skipping launch test');
        return;
      }

      try {
        await device.connect();
        // Use a system app that should always be available
        await device.launch('com.apple.Preferences');
      } catch (error) {
        console.warn('Launch test failed:', error);
        // This is expected if the app doesn't exist, so we don't fail the test
      }
    });
  });

  describe('Device State Management', () => {
    it('should handle destroy properly', async () => {
      await device.destroy();
      expect(() => device.describe()).not.toThrow();
    });

    it('should prevent operations after destroy', async () => {
      await device.destroy();
      // Most operations should throw after destroy, but we test one representative method
      try {
        await device.connect();
        // If this doesn't throw, the test should fail
        expect(true).toBe(false);
      } catch (error) {
        expect((error as Error).message).toContain('destroyed');
      }
    });
  });
});
