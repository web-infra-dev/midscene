import { describe, expect, it } from 'vitest';
import { iOSAgent } from '../../src/agent';
import type { iOSDevice } from '../../src/device';

describe('iOS Agent', () => {
  describe('constructor', () => {
    it('should create an iOS agent instance', () => {
      // Create a mock iOS device
      const mockDevice = {} as iOSDevice;

      const agent = new iOSAgent(mockDevice);

      expect(agent).toBeDefined();
      expect(agent.page).toBe(mockDevice);
    });
  });
});
