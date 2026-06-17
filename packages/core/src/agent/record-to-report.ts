import type { RecordToReportScreenshot } from '@/types';
import { normalizeScreenshotBase64 } from '@midscene/shared/img';

export function normalizeRecordToReportScreenshot(
  screenshot: RecordToReportScreenshot,
  index: number,
): RecordToReportScreenshot {
  if (!screenshot || typeof screenshot.base64 !== 'string') {
    throw new Error(
      `recordToReport: screenshot #${index + 1} must include a base64 string`,
    );
  }

  if (
    screenshot.description !== undefined &&
    typeof screenshot.description !== 'string'
  ) {
    throw new Error(
      `recordToReport: screenshot #${index + 1} description must be a string`,
    );
  }

  return {
    base64: normalizeScreenshotBase64(screenshot.base64, {
      label: `recordToReport: screenshot #${index + 1} base64`,
    }),
    description: screenshot.description,
  };
}
