import { describe, expect, test } from 'vitest';
import { safeResultStem } from '../../src/result';

describe('safeResultStem', () => {
  test('normalizes path stems without trimming regex backtracking', () => {
    expect(safeResultStem('---checkout---.yaml', 0)).toBe('001-checkout');
    expect(safeResultStem(`${'-'.repeat(10_000)}.yaml`, 1)).toBe('002-case');
  });
});
