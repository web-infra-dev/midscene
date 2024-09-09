import { getCurrentExecutionFile } from '@/common/utils';
import { beforeEach, describe, expect, it } from 'vitest';

describe('TaskCache', () => {
  it('should return the current execution file', () => {
    const currentExecutionFile = getCurrentExecutionFile();
    expect(currentExecutionFile).toBe('/tests/unit-test/util.test.ts');
  });
});
