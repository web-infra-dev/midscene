import { describe, expect, it } from 'vitest';
import {
  resolveAutoCreateDecision,
  serializeAutoCreateInput,
  shouldResetAutoCreateBlock,
} from '../src/controller/auto-create';

describe('resolveAutoCreateDecision', () => {
  it('does not auto-create without a resolved input', () => {
    expect(
      resolveAutoCreateDecision({
        autoCreateInput: null,
        lastAttemptedSignature: null,
        blockedSignature: null,
      }),
    ).toEqual({
      signature: null,
      shouldCreate: false,
    });
  });

  it('blocks only the exact signature that was manually disconnected', () => {
    const blockedSignature = serializeAutoCreateInput({
      deviceId: 'emulator-5554',
    });

    expect(
      resolveAutoCreateDecision({
        autoCreateInput: { deviceId: 'emulator-5554' },
        lastAttemptedSignature: null,
        blockedSignature,
      }),
    ).toMatchObject({
      signature: blockedSignature,
      shouldCreate: false,
    });

    expect(
      resolveAutoCreateDecision({
        autoCreateInput: { deviceId: 'emulator-5556' },
        lastAttemptedSignature: null,
        blockedSignature,
      }),
    ).toMatchObject({
      signature: serializeAutoCreateInput({ deviceId: 'emulator-5556' }),
      shouldCreate: true,
    });
  });
});

describe('shouldResetAutoCreateBlock', () => {
  it('resets the block for manual creates but keeps it for silent auto-create', () => {
    expect(shouldResetAutoCreateBlock()).toBe(true);
    expect(shouldResetAutoCreateBlock({ silent: false })).toBe(true);
    expect(shouldResetAutoCreateBlock({ silent: true })).toBe(false);
  });
});
