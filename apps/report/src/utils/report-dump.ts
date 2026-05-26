import type { PlaywrightTaskAttributes } from '../types';

type AttributeEntry = {
  name: string;
  value: string;
};

export function parseDumpAttributes(
  entries: AttributeEntry[],
): PlaywrightTaskAttributes {
  const attributes: Partial<PlaywrightTaskAttributes> & Record<string, any> = {
    playwright_test_description: '',
    playwright_test_id: '',
    playwright_test_title: '',
    playwright_test_status: undefined,
    playwright_test_duration: 0,
  };

  entries.forEach(({ name, value }) => {
    const valueDecoded = decodeURIComponent(value);
    if (name.startsWith('playwright_')) {
      if (name === 'playwright_test_duration') {
        attributes[name] = Number(valueDecoded) || 0;
      } else {
        attributes[name] = valueDecoded;
      }
    } else if (name === 'is_merged') {
      attributes.is_merged = valueDecoded === 'true';
    }
  });

  return attributes as PlaywrightTaskAttributes;
}

export function getEmptyDumpDescription(
  status?: PlaywrightTaskAttributes['playwright_test_status'],
): string {
  if (status === 'skipped') {
    return 'All test cases were skipped. No report data to display.';
  }
  return 'There is no task info in this dump file.';
}
