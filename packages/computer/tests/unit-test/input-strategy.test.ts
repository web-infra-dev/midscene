import { describe, expect, it, rs } from '@rstest/core';
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
    const typeString = rs
      .spyOn(inputDriver, 'typeString')
      .mockImplementation(() => {});
    const delay = rs.spyOn(inputDriver, 'delay').mockResolvedValue(undefined);

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
    const typeString = rs
      .spyOn(inputDriver, 'typeString')
      .mockImplementation(() => {});
    const sendKey = rs
      .spyOn(inputDriver, 'sendKey')
      .mockImplementation(() => {});
    rs.spyOn(inputDriver, 'delay').mockResolvedValue(undefined);

    await device.inputPrimitives.keyboard!.typeText('a \r\n\tb');

    expect(typeString.mock.calls).toEqual([['a'], ['b']]);
    expect(sendKey.mock.calls).toEqual([['space'], ['enter'], ['tab']]);
  });

  it('lets an action-level zero disable the device delay', async () => {
    const device = new ComputerDevice({ keyboardTypeDelay: 80 });
    const smartTypeString = rs
      .spyOn(device as any, 'smartTypeString')
      .mockResolvedValue(undefined);

    await device.inputPrimitives.keyboard!.typeText('hello', {
      keyboardTypeDelay: 0,
    });

    expect(smartTypeString).toHaveBeenCalledWith('hello', {
      inputStrategy: 'legacy',
      keyboardTypeDelay: 0,
    });
  });

  it('forces real key input without requiring a positive delay', async () => {
    const device = new ComputerDevice({
      keyboardDriver: 'libnut',
      inputStrategy: 'sequential',
    });
    const inputDriver = (device as any).inputDriver;
    const typeString = rs
      .spyOn(inputDriver, 'typeString')
      .mockImplementation(() => {});

    await device.inputPrimitives.keyboard!.typeText('A😀B');

    expect(typeString.mock.calls).toEqual([['A'], ['😀'], ['B']]);
  });

  it('rejects bulk input with a positive device delay', async () => {
    const device = new ComputerDevice({ keyboardTypeDelay: 80 });
    const clearInput = rs.spyOn(device as any, 'selectAllAndDelete');

    await expect(
      device.inputPrimitives.keyboard!.typeText('hello', {
        inputStrategy: 'bulk',
        target: { center: [10, 20] },
      }),
    ).rejects.toThrow(
      'inputStrategy "bulk" requires keyboardTypeDelay to be omitted or set to 0; use inputStrategy "sequential" for delayed input',
    );
    expect(clearInput).not.toHaveBeenCalled();
  });
});
