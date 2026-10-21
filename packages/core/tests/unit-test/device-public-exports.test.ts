import { describe, expect, it } from '@rstest/core';
import { getMidsceneLocationSchema, z } from '../../src/device';

describe('device public exports', () => {
  it('exposes schemas needed by external device adapters', () => {
    expect(getMidsceneLocationSchema()).toBeInstanceOf(z.ZodType);
  });
});
