import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSecureRecorderId } from '../src/renderer/recorder/secure-id';

describe('studio recorder secure id', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses crypto.randomUUID when available', () => {
    const randomUUID = vi.fn(() => '11111111-2222-4333-8444-555555555555');
    vi.stubGlobal('crypto', { randomUUID });

    expect(createSecureRecorderId('studio-recording-1')).toBe(
      'studio-recording-1-11111111-2222-4333-8444-555555555555',
    );
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it('falls back to crypto.getRandomValues', () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
      return bytes;
    });
    vi.stubGlobal('crypto', { getRandomValues });

    expect(createSecureRecorderId('studio-recording-1')).toBe(
      'studio-recording-1-00010203-0405-4607-8809-0a0b0c0d0e0f',
    );
    expect(getRandomValues).toHaveBeenCalledOnce();
  });
});
