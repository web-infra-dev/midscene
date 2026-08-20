import { getZodDefaultValue } from '@/ai-model/shared/action-schema';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

describe('getZodDefaultValue', () => {
  it('returns a direct ZodDefault value', () => {
    expect(getZodDefaultValue(z.string().default('singleAction'))).toBe(
      'singleAction',
    );
  });

  it('finds a default value through optional and nullable wrappers', () => {
    const schema = z.string().default('singleAction').optional().nullable();

    expect(getZodDefaultValue(schema)).toBe('singleAction');
  });

  it('returns undefined when the schema has no default value', () => {
    expect(getZodDefaultValue(z.string().optional())).toBeUndefined();
  });
});
