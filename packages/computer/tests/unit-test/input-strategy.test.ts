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
    expect(sendKey.mock.calls).toEqual([['space'], ['return'], ['tab']]);
  });

  it.runIf(process.platform === 'linux')(
    'types shifted punctuation with explicit Shift key taps on Linux',
    async () => {
      const device = new ComputerDevice({
        keyboardDriver: 'libnut',
        keyboardTypeDelay: 1,
      });
      const inputDriver = (device as any).inputDriver;
      const typeString = rs
        .spyOn(inputDriver, 'typeString')
        .mockImplementation(() => {});
      const keyTap = rs
        .spyOn(inputDriver, 'keyTap')
        .mockImplementation(() => {});
      rs.spyOn(inputDriver, 'delay').mockResolvedValue(undefined);

      await device.inputPrimitives.keyboard!.typeText(`~!@#$%^&*()_+{}|:"<>?`);

      expect(typeString).not.toHaveBeenCalled();
      expect(keyTap.mock.calls).toEqual([
        ['`', ['shift']],
        ['1', ['shift']],
        ['2', ['shift']],
        ['3', ['shift']],
        ['4', ['shift']],
        ['5', ['shift']],
        ['6', ['shift']],
        ['7', ['shift']],
        ['8', ['shift']],
        ['9', ['shift']],
        ['0', ['shift']],
        ['-', ['shift']],
        ['=', ['shift']],
        ['[', ['shift']],
        [']', ['shift']],
        ['\\', ['shift']],
        [';', ['shift']],
        ["'", ['shift']],
        [',', ['shift']],
        ['.', ['shift']],
        ['/', ['shift']],
      ]);
    },
  );

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

  it('paces implicit Shift for uppercase and punctuation in sequential input', async () => {
    const device = new ComputerDevice({
      keyboardDriver: 'libnut',
      inputStrategy: 'sequential',
      keyboardShortcutDelay: 50,
    });
    const inputDriver = (device as any).inputDriver;
    const typeString = rs
      .spyOn(inputDriver, 'typeString')
      .mockImplementation(() => {});
    const explicitShortcut = rs
      .spyOn(inputDriver, 'keyTapWithExplicitModifiers')
      .mockResolvedValue(undefined);

    await device.inputPrimitives.keyboard!.typeText('A!b😀');

    expect(explicitShortcut.mock.calls).toEqual([
      ['a', ['shift'], 50],
      ['1', ['shift'], 50],
    ]);
    expect(typeString.mock.calls).toEqual([['b'], ['😀']]);
  });

  it('paces the select-all shortcut used before replacing input', async () => {
    const device = new ComputerDevice({
      keyboardDriver: 'libnut',
      keyboardShortcutDelay: 50,
    });
    const inputDriver = (device as any).inputDriver;
    const explicitShortcut = rs
      .spyOn(inputDriver, 'keyTapWithExplicitModifiers')
      .mockResolvedValue(undefined);
    const keyTap = rs.spyOn(inputDriver, 'keyTap').mockImplementation(() => {});
    rs.spyOn(inputDriver, 'delay').mockResolvedValue(undefined);

    await (device as any).selectAllAndDelete();

    expect(explicitShortcut).toHaveBeenCalledWith(
      'a',
      [process.platform === 'darwin' ? 'command' : 'control'],
      50,
    );
    expect(keyTap).toHaveBeenCalledWith('backspace');
  });

  it('uses explicit modifier phases when shortcut delay is configured', async () => {
    const device = new ComputerDevice({
      keyboardDriver: 'libnut',
      keyboardShortcutDelay: 50,
    });
    const inputDriver = (device as any).inputDriver;
    const explicitShortcut = rs
      .spyOn(inputDriver, 'keyTapWithExplicitModifiers')
      .mockResolvedValue(undefined);
    const sendKey = rs
      .spyOn(inputDriver, 'sendKey')
      .mockImplementation(() => {});

    await device.inputPrimitives.keyboard!.keyboardPress('Control+Shift+s');

    expect(explicitShortcut).toHaveBeenCalledWith(
      's',
      ['control', 'shift'],
      50,
    );
    expect(sendKey).not.toHaveBeenCalled();
  });

  it('keeps the existing shortcut path when shortcut delay is zero', async () => {
    const device = new ComputerDevice({
      keyboardDriver: 'libnut',
      keyboardShortcutDelay: 0,
    });
    const inputDriver = (device as any).inputDriver;
    const explicitShortcut = rs.spyOn(
      inputDriver,
      'keyTapWithExplicitModifiers',
    );
    const sendKey = rs
      .spyOn(inputDriver, 'sendKey')
      .mockImplementation(() => {});

    await device.inputPrimitives.keyboard!.keyboardPress('Control+s');

    expect(sendKey).toHaveBeenCalledWith('s', ['control']);
    expect(explicitShortcut).not.toHaveBeenCalled();
  });

  it('rejects invalid shortcut delays', () => {
    expect(() => new ComputerDevice({ keyboardShortcutDelay: -1 })).toThrow(
      'keyboardShortcutDelay must be a finite non-negative number',
    );
    expect(
      () => new ComputerDevice({ keyboardShortcutDelay: Number.NaN }),
    ).toThrow('keyboardShortcutDelay must be a finite non-negative number');
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
