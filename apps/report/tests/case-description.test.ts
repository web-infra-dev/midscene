import { describe, expect, it } from 'vitest';
import { getCaseDescription } from '../src/components/playwright-case-selector/case-description';

describe('getCaseDescription', () => {
  it('truncates a long description for failed cases', () => {
    const description = `Error(s) occurred in running yaml script:\nServiceError: failed to locate the dashboard button. ${'at Service.locate (/project/service.ts:1:1) '.repeat(5)}`;

    const result = getCaseDescription({
      playwright_test_description: description,
      playwright_test_status: 'failed',
    });

    expect(result).toHaveLength(30);
    expect(result).toBe(`${description.slice(0, 27)}...`);
  });

  it('keeps a short description for failed cases', () => {
    expect(
      getCaseDescription({
        playwright_test_description: 'ServiceError: failed to locate',
        playwright_test_status: 'failed',
      }),
    ).toBe('ServiceError: failed to locate');
  });

  it('keeps a long description for non-failed cases', () => {
    const description = 'checkout flow '.repeat(20);

    expect(
      getCaseDescription({
        playwright_test_description: description,
        playwright_test_status: 'passed',
      }),
    ).toBe(description);
  });
});
