import { createHash } from 'node:crypto';
import { replaceIllegalPathCharsAndSpace } from '@midscene/shared/utils';

// Keep enough room below the common 255-byte filesystem component limit for
// suffixes added later, such as `.html` or getReportFileName's timestamp/id.
export const MAX_PLAYWRIGHT_REPORT_TAG_BYTES = 200;

const playwrightReportPrefix = 'playwright-';
const compactHashLength = 10;

function getCompactHash(value: string): string {
  return createHash('sha256')
    .update(value)
    .digest('hex')
    .slice(0, compactHashLength);
}

function truncateUtf8ByBytes(value: string, maxBytes: number): string {
  let byteLength = 0;
  let truncated = '';

  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, 'utf8');
    if (byteLength + characterBytes > maxBytes) {
      break;
    }
    truncated += character;
    byteLength += characterBytes;
  }

  return truncated;
}

export function buildPlaywrightReportTag(
  title: string,
  uniqueSuffix?: string,
  hashSource = title,
): string {
  const safeTitle = replaceIllegalPathCharsAndSpace(title).replace(
    /[\\/]/g,
    '-',
  );
  const titleHash = getCompactHash(hashSource);
  const trailingSegments = uniqueSuffix
    ? `-${titleHash}-${uniqueSuffix}`
    : `-${titleHash}`;
  const fixedBytes = Buffer.byteLength(
    `${playwrightReportPrefix}${trailingSegments}`,
    'utf8',
  );
  const titleByteBudget = MAX_PLAYWRIGHT_REPORT_TAG_BYTES - fixedBytes;

  if (titleByteBudget < 0) {
    throw new Error(
      `Playwright report suffix exceeds the ${MAX_PLAYWRIGHT_REPORT_TAG_BYTES}-byte tag limit`,
    );
  }

  const readableTitle = truncateUtf8ByBytes(safeTitle, titleByteBudget);
  return `${playwrightReportPrefix}${readableTitle}${trailingSegments}`;
}
