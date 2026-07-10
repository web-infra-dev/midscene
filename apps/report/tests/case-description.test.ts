import { describe, expect, it } from 'vitest';
import { getCaseDescription } from '../src/components/playwright-case-selector/case-description';

describe('getCaseDescription', () => {
  it('truncates a long description', () => {
    const description = `Error(s) occurred in running yaml script:\nServiceError: failed to locate the dashboard button. ${'at Service.locate (/project/service.ts:1:1) '.repeat(5)}`;

    const result = getCaseDescription(description);

    expect(result).toHaveLength(100);
    expect(result).toBe(`${description.slice(0, 97)}...`);
  });

  it('keeps a short description', () => {
    expect(getCaseDescription('ServiceError: failed to locate')).toBe(
      'ServiceError: failed to locate',
    );
  });

  it('keeps a description at the length limit', () => {
    const description = 'a'.repeat(100);

    expect(getCaseDescription(description)).toBe(description);
  });
});
