import { describe, expect, it } from 'vitest';
import {
  getEmptyDumpDescription,
  parseDumpAttributes,
} from '../../../apps/report/src/utils/report-dump';

describe('report dump utils', () => {
  it('parses is_merged alongside playwright attributes', () => {
    const attributes = parseDumpAttributes([
      { name: 'playwright_test_title', value: encodeURIComponent('Merged') },
      { name: 'playwright_test_duration', value: '1200' },
      { name: 'is_merged', value: 'true' },
    ]);

    expect(attributes.playwright_test_title).toBe('Merged');
    expect(attributes.playwright_test_duration).toBe(1200);
    expect(attributes.is_merged).toBe(true);
  });

  it('uses skipped-specific empty state copy', () => {
    expect(getEmptyDumpDescription('skipped')).toBe(
      'All test cases were skipped. No report data to display.',
    );
    expect(getEmptyDumpDescription('passed')).toBe(
      'There is no task info in this dump file.',
    );
  });
});
