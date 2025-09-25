import { DEFAULT_WDA_PORT } from '@midscene/shared/constants';
import { WDAManager } from '@midscene/webdriver';
import { describe, expect, it } from 'vitest';
import { IOSAgent } from '../../src/agent';
import { IOSDevice } from '../../src/device';
import { IOSWebDriverClient } from '../../src/ios-webdriver-client';

describe('iOS Package Structure', () => {
  describe('IOSDevice', () => {
    it('should be constructable with options', () => {
      expect(() => new IOSDevice()).not.toThrow();
      expect(() => new IOSDevice({ wdaPort: DEFAULT_WDA_PORT })).not.toThrow();
    });

    it('should have correct interface type', () => {
      const device = new IOSDevice();
      expect(device.interfaceType).toBe('ios');
    });

    it('should have proper action space', () => {
      const device = new IOSDevice();
      const actions = device.actionSpace();
      expect(Array.isArray(actions)).toBe(true);
      expect(actions.length).toBeGreaterThan(0);

      const actionNames = actions.map((action) => action.name);
      expect(actionNames).toContain('Tap');
      expect(actionNames).toContain('Input');
      expect(actionNames).toContain('Scroll');
      expect(actionNames).toContain('IOSHomeButton');
      expect(actionNames).toContain('IOSLongPress');
      expect(actionNames).toContain('IOSAppSwitcher');
    });

    it('should respect configuration options', () => {
      const device1 = new IOSDevice({
        wdaPort: 9100,
        autoDismissKeyboard: false,
      });
      expect(device1).toBeDefined();

      const device2 = new IOSDevice({
        wdaHost: 'custom-host',
      });
      expect(device2).toBeDefined();
    });

    it('should provide device description', () => {
      const device = new IOSDevice();
      const description = device.describe();
      expect(description).toContain('pending-connection');
    });
  });

  describe('IOSAgent', () => {
    it('should be constructable with device', () => {
      const device = new IOSDevice();
      expect(() => new IOSAgent(device)).not.toThrow();
    });

    it('should extend base Agent functionality', () => {
      const device = new IOSDevice();
      const agent = new IOSAgent(device);
      expect(agent.page).toBe(device);
    });

    it('should have launch method', () => {
      const device = new IOSDevice();
      const agent = new IOSAgent(device);
      expect(typeof agent.launch).toBe('function');
    });
  });

  describe('IOSWebDriverClient', () => {
    it('should be constructable with parameters', () => {
      expect(() => new IOSWebDriverClient()).not.toThrow();
      expect(() => new IOSWebDriverClient({ port: 9100 })).not.toThrow();
      expect(
        () => new IOSWebDriverClient({ port: 9100, host: 'custom-host' }),
      ).not.toThrow();
    });

    it('should have proper initial state', () => {
      const client = new IOSWebDriverClient();
      expect(client.sessionInfo).toBeNull();
    });

    it('should have required methods', () => {
      const client = new IOSWebDriverClient();
      expect(typeof client.createSession).toBe('function');
      expect(typeof client.deleteSession).toBe('function');
      expect(typeof client.getWindowSize).toBe('function');
      expect(typeof client.takeScreenshot).toBe('function');
      expect(typeof client.tap).toBe('function');
      expect(typeof client.swipe).toBe('function');
      expect(typeof client.typeText).toBe('function');
      expect(typeof client.pressKey).toBe('function');
      expect(typeof client.pressHomeButton).toBe('function');
      expect(typeof client.launchApp).toBe('function');
      expect(typeof client.getDeviceInfo).toBe('function');
    });
  });

  describe('WDAManager', () => {
    it('should be constructable via getInstance', () => {
      expect(() => WDAManager.getInstance()).not.toThrow();
      expect(() => WDAManager.getInstance(DEFAULT_WDA_PORT)).not.toThrow();
    });

    it('should return same instance for same parameters', () => {
      const manager1 = WDAManager.getInstance(DEFAULT_WDA_PORT, 'localhost');
      const manager2 = WDAManager.getInstance(DEFAULT_WDA_PORT, 'localhost');
      expect(manager1).toBe(manager2);
    });

    it('should have required methods', () => {
      const manager = WDAManager.getInstance();
      expect(typeof manager.start).toBe('function');
      expect(typeof manager.stop).toBe('function');
      expect(typeof manager.restart).toBe('function');
      expect(typeof manager.isRunning).toBe('function');
      expect(typeof manager.getPort).toBe('function');
    });

    it('should track running state', () => {
      const manager = WDAManager.getInstance(8200);
      expect(typeof manager.isRunning()).toBe('boolean');
    });

    it('should return correct port', () => {
      const manager = WDAManager.getInstance(9100);
      expect(manager.getPort()).toBe(9100);
    });
  });

  describe('Custom Actions Support', () => {
    it('should support custom actions in device constructor', () => {
      const customAction = {
        name: 'TestAction',
        description: 'A test action',
        paramSchema: {},
        call: () => Promise.resolve(),
      };

      const device = new IOSDevice({
        customActions: [customAction],
      });

      const actions = device.actionSpace();
      const actionNames = actions.map((action) => action.name);
      expect(actionNames).toContain('TestAction');
    });
  });

  describe('Integration Points', () => {
    it('should have consistent device handling', () => {
      const device = new IOSDevice();
      const agent = new IOSAgent(device);
      const client = new IOSWebDriverClient();
      const manager = WDAManager.getInstance();

      expect(device.describe()).toContain('pending-connection');
      expect(agent.page).toBe(device);
      expect(client).toBeDefined();
      expect(manager).toBeDefined();
    });

    it('should support different WDA configurations', () => {
      const port1 = DEFAULT_WDA_PORT;
      const port2 = 9100;
      const host1 = 'localhost';
      const host2 = 'custom-host';

      const device1 = new IOSDevice({
        wdaPort: port1,
        wdaHost: host1,
      });
      const device2 = new IOSDevice({
        wdaPort: port2,
        wdaHost: host2,
      });

      expect(device1).toBeDefined();
      expect(device2).toBeDefined();

      const manager1 = WDAManager.getInstance(port1, host1);
      const manager2 = WDAManager.getInstance(port2, host2);

      expect(manager1.getPort()).toBe(port1);
      expect(manager2.getPort()).toBe(port2);
    });
  });
});
