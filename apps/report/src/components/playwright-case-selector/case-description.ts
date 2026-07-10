import type { PlaywrightTaskAttributes } from '../../types';

const MAX_FAILED_CASE_DESCRIPTION_LENGTH = 30;

export function getCaseDescription(
  attributes: Pick<
    PlaywrightTaskAttributes,
    'playwright_test_description' | 'playwright_test_status'
  >,
): string {
  const description = attributes.playwright_test_description;
  if (
    attributes.playwright_test_status === 'failed' &&
    description.length > MAX_FAILED_CASE_DESCRIPTION_LENGTH
  ) {
    return `${description.slice(0, MAX_FAILED_CASE_DESCRIPTION_LENGTH - 3)}...`;
  }

  return description;
}
