import { describe, expect, it } from 'vitest';
import { ComputerDevice, checkComputerEnvironment } from '../../src';

describe('ComputerDevice', () => {
  it('should create device instance', () => {
    const device = new ComputerDevice({});
    expect(device).toBeDefined();
    expect(device.interfaceType).toBe('computer');
  });

  it('should create device with display id', () => {
    const device = new ComputerDevice({ displayId: 'test-display' });
    expect(device).toBeDefined();
  });

  it('should list displays', async () => {
    const displays = await ComputerDevice.listDisplays();
    expect(Array.isArray(displays)).toBe(true);

    if (displays.length > 0) {
      const display = displays[0];
      expect(display).toHaveProperty('id');
      expect(display).toHaveProperty('name');
    }
  });

  it('should check computer environment', async () => {
    const envCheck = await checkComputerEnvironment();
    expect(envCheck).toBeDefined();
    expect(envCheck).toHaveProperty('available');
    expect(envCheck).toHaveProperty('platform');
    expect(envCheck).toHaveProperty('displays');

    console.log('Environment check result:', envCheck);
  });

  it('should have action space', () => {
    const device = new ComputerDevice({});
    const actions = device.actionSpace();

    expect(Array.isArray(actions)).toBe(true);
    expect(actions.length).toBeGreaterThan(0);

    // Verify basic actions exist
    const actionNames = actions.map((a) => a.name);
    expect(actionNames).toContain('Tap');
    expect(actionNames).toContain('Input');
    expect(actionNames).toContain('Scroll');
    expect(actionNames).toContain('KeyboardPress');

    console.log('Available actions:', actionNames);
  });
});
