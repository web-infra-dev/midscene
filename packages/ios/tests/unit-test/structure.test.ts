import { describe, expect, it } from 'vitest';
import { IOSAgent } from '../../src/agent';
import { IOSDevice } from '../../src/device';
import { WebDriverAgentBackend } from '../../src/wda-backend';
import { WDAManager } from '../../src/wda-manager';

describe('iOS Package Structure', () => {
  describe('IOSDevice', () => {
    it('should be constructable with valid UDID', () => {
      expect(() => new IOSDevice('test-udid')).not.toThrow();
    });

    it('should throw error for empty UDID', () => {
      expect(() => new IOSDevice('')).toThrow('udid is required for IOSDevice');
    });

    it('should have correct interface type', () => {
      const device = new IOSDevice('test-udid');
      expect(device.interfaceType).toBe('ios');
    });

    it('should have proper action space', () => {
      const device = new IOSDevice('test-udid');
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
      const device1 = new IOSDevice('test-udid', {
        wdaPort: 9100,
        autoDismissKeyboard: false,
      });
      expect(device1).toBeDefined();

      const device2 = new IOSDevice('test-udid', {
        keyboardDismissStrategy: 'escape-first',
      });
      expect(device2).toBeDefined();
    });

    it('should provide device description', () => {
      const device = new IOSDevice('test-udid-123');
      const description = device.describe();
      expect(description).toContain('UDID');
      expect(description).toContain('test-udid-123');
    });
  });

  describe('IOSAgent', () => {
    it('should be constructable with device', () => {
      const device = new IOSDevice('test-udid');
      expect(() => new IOSAgent(device)).not.toThrow();
    });

    it('should extend base Agent functionality', () => {
      const device = new IOSDevice('test-udid');
      const agent = new IOSAgent(device);
      expect(agent.page).toBe(device);
    });

    it('should have launch method', () => {
      const device = new IOSDevice('test-udid');
      const agent = new IOSAgent(device);
      expect(typeof agent.launch).toBe('function');
    });
  });

  describe('WebDriverAgentBackend', () => {
    it('should be constructable with parameters', () => {
      expect(() => new WebDriverAgentBackend('test-udid')).not.toThrow();
      expect(() => new WebDriverAgentBackend('test-udid', 9100)).not.toThrow();
      expect(
        () => new WebDriverAgentBackend('test-udid', 9100, 'custom-host'),
      ).not.toThrow();
    });

    it('should have proper initial state', () => {
      const backend = new WebDriverAgentBackend('test-udid');
      expect(backend.sessionInfo).toBeNull();
    });

    it('should have required methods', () => {
      const backend = new WebDriverAgentBackend('test-udid');
      expect(typeof backend.createSession).toBe('function');
      expect(typeof backend.deleteSession).toBe('function');
      expect(typeof backend.getWindowSize).toBe('function');
      expect(typeof backend.takeScreenshot).toBe('function');
      expect(typeof backend.tap).toBe('function');
      expect(typeof backend.swipe).toBe('function');
      expect(typeof backend.typeText).toBe('function');
      expect(typeof backend.pressKey).toBe('function');
      expect(typeof backend.homeButton).toBe('function');
      expect(typeof backend.launchApp).toBe('function');
    });
  });

  describe('WDAManager', () => {
    it('should be constructable via getInstance', () => {
      expect(() => WDAManager.getInstance('test-udid')).not.toThrow();
    });

    it('should return same instance for same parameters', () => {
      const manager1 = WDAManager.getInstance('test-udid', 8100);
      const manager2 = WDAManager.getInstance('test-udid', 8100);
      expect(manager1).toBe(manager2);
    });

    it('should have required methods', () => {
      const manager = WDAManager.getInstance('test-udid');
      expect(typeof manager.start).toBe('function');
      expect(typeof manager.stop).toBe('function');
      expect(typeof manager.restart).toBe('function');
      expect(typeof manager.isRunning).toBe('function');
      expect(typeof manager.getPort).toBe('function');
    });

    it('should track running state', () => {
      const manager = WDAManager.getInstance('test-udid-2');
      expect(typeof manager.isRunning()).toBe('boolean');
    });

    it('should return correct port', () => {
      const manager = WDAManager.getInstance('test-udid-3', 9100);
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

      const device = new IOSDevice('test-udid', {
        customActions: [customAction],
      });

      const actions = device.actionSpace();
      const actionNames = actions.map((action) => action.name);
      expect(actionNames).toContain('TestAction');
    });
  });

  describe('Integration Points', () => {
    it('should have consistent UDID handling', () => {
      const udid = 'consistent-test-udid';
      const device = new IOSDevice(udid);
      const agent = new IOSAgent(device);
      const backend = new WebDriverAgentBackend(udid);
      const manager = WDAManager.getInstance(udid);

      expect(device.describe()).toContain(udid);
      expect(agent.page).toBe(device);
      expect(backend).toBeDefined();
      expect(manager).toBeDefined();
    });

    it('should support different WDA configurations', () => {
      const port1 = 8100;
      const port2 = 9100;
      const host1 = 'localhost';
      const host2 = 'custom-host';

      const device1 = new IOSDevice('udid1', {
        wdaPort: port1,
        wdaHost: host1,
      });
      const device2 = new IOSDevice('udid2', {
        wdaPort: port2,
        wdaHost: host2,
      });

      expect(device1).toBeDefined();
      expect(device2).toBeDefined();

      const manager1 = WDAManager.getInstance('udid1', port1, host1);
      const manager2 = WDAManager.getInstance('udid2', port2, host2);

      expect(manager1.getPort()).toBe(port1);
      expect(manager2.getPort()).toBe(port2);
    });
  });
});
