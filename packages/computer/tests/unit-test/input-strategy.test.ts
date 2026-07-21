import { describe, expect, it, vi } from 'vitest';
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
    expect(inputAction?.description).toBe('Input the value into the element');
  });

  it('types Unicode code points individually with the device delay', async () => {
    const device = new ComputerDevice({
      keyboardDriver: 'libnut',
      keyboardTypeDelay: 80,
    });
    const inputDriver = (device as any).inputDriver;
    const typeString = vi
      .spyOn(inputDriver, 'typeString')
      .mockImplementation(() => {});
    const delay = vi.spyOn(inputDriver, 'delay').mockResolvedValue(undefined);

    await device.inputPrimitives.keyboard!.typeText('A😀B');

    expect(typeString.mock.calls).toEqual([['A'], ['😀'], ['B']]);
    expect(delay.mock.calls).toEqual([[80], [80]]);
  });

  it('maps line breaks and tabs to real keys during delayed input', async () => {
    const device = new ComputerDevice({
      keyboardDriver: 'libnut',
      keyboardTypeDelay: 25,
    });
    const inputDriver = (device as any).inputDriver;
    const typeString = vi
      .spyOn(inputDriver, 'typeString')
      .mockImplementation(() => {});
    const sendKey = vi
      .spyOn(inputDriver, 'sendKey')
      .mockImplementation(() => {});
    vi.spyOn(inputDriver, 'delay').mockResolvedValue(undefined);

    await device.inputPrimitives.keyboard!.typeText('a \r\n\tb');

    expect(typeString.mock.calls).toEqual([['a'], ['b']]);
    expect(sendKey.mock.calls).toEqual([['space'], ['enter'], ['tab']]);
  });

  it('lets an action-level zero disable the device delay', async () => {
    const device = new ComputerDevice({ keyboardTypeDelay: 80 });
    const smartTypeString = vi
      .spyOn(device as any, 'smartTypeString')
      .mockResolvedValue(undefined);

    await device.inputPrimitives.keyboard!.typeText('hello', {
      keyboardTypeDelay: 0,
    });

    expect(smartTypeString).toHaveBeenCalledWith('hello', 0);
  });
});
