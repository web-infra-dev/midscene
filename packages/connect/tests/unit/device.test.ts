import { describe, expect, it } from '@rstest/core';
import { type ConnectDevice, prepareDevice } from '../../src/device';

const base = { name: 'Test', screenshot: () => Buffer.from('') };
const fn = () => {};
const prepare = (device: Partial<ConnectDevice>) =>
  prepareDevice({ ...base, ...device } as ConnectDevice);

describe('prepareDevice', () => {
  it('lists primitives and custom actions in /info', () => {
    const { info } = prepare({
      pointerType: 'touch',
      actions: {
        swipe: fn,
        tap: fn,
        reset: { description: 'Reset the arm', call: fn },
      },
    });
    expect(info.primitives).toEqual(['tap', 'swipe']);
    expect(info.actions).toEqual([
      { name: 'reset', description: 'Reset the arm' },
    ]);
  });

  it('rejects unknown functions and malformed custom actions', () => {
    expect(() => prepare({ actions: { tapp: fn } })).toThrow(
      /not a built-in primitive/,
    );
    expect(() =>
      prepare({ actions: { tap: { description: 'x', call: fn } as any } }),
    ).toThrow(/must be a function/);
    expect(() => prepare({ actions: { reset: { call: fn } as any } })).toThrow(
      /description is required/,
    );
    expect(() =>
      prepare({
        actions: {
          reset: {
            description: 'x',
            call: fn,
            params: { type: 'string' } as any,
          },
        },
      }),
    ).toThrow(/params must be/);
  });

  it('enforces primitive groups', () => {
    expect(() => prepare({ actions: { typeText: fn } })).toThrow(
      /provided together/,
    );
    expect(() => prepare({ actions: { tap: fn, swipe: fn } })).toThrow(
      /pointerType/,
    );
    expect(() => prepare({ actions: { longPress: fn } })).toThrow(
      /require tap/,
    );
    expect(() =>
      prepare({
        pointerType: 'mouse',
        actions: { tap: fn, swipe: fn, pinch: fn },
      }),
    ).toThrow(/pinch requires/);
  });

  it('rejects screenshots that are not PNG or JPEG', async () => {
    await expect(prepare({}).screenshot()).rejects.toThrow(/PNG/);
  });
});
