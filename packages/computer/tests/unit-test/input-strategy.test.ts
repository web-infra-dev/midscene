import { describe, expect, it } from 'vitest';
import { ComputerDevice } from '../../src';

describe('Input Strategy', () => {
  it('should create device with default options', () => {
    const device = new ComputerDevice({});
    expect(device).toBeDefined();
  });

  it('should have Input action in action space', () => {
    const device = new ComputerDevice({});
    const actions = device.actionSpace();

    const inputAction = actions.find((a) => a.name === 'Input');
    expect(inputAction).toBeDefined();
    expect(inputAction?.name).toBe('Input');
    expect(inputAction?.description).toBe('Input text into the input field');
  });
});
