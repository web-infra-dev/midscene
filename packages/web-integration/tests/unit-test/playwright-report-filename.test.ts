import {
  MAX_PLAYWRIGHT_REPORT_TAG_BYTES,
  buildPlaywrightReportTag,
} from '@/playwright/report-filename';
import { describe, expect, it } from '@rstest/core';

describe('buildPlaywrightReportTag', () => {
  it('truncates Chinese titles by UTF-8 bytes while keeping the tag valid', () => {
    const title =
      '1426803-【配置-策略模板配置】【创建策略模板】策略模板名称与当前存在的名称重复'.repeat(
        10,
      );
    const tag = buildPlaywrightReportTag(
      title,
      '6d700a2d-ab99-45c3-9c4e-87ff85f4b11b',
    );

    expect(Buffer.byteLength(tag, 'utf8')).toBeLessThanOrEqual(
      MAX_PLAYWRIGHT_REPORT_TAG_BYTES,
    );
    expect(tag).toMatch(/^playwright-.+-[0-9a-f]{10}-[0-9a-f-]{36}$/);
    expect(Buffer.from(tag, 'utf8').toString('utf8')).toBe(tag);
  });

  it('does not split emoji at the byte boundary', () => {
    const tag = buildPlaywrightReportTag('🧪'.repeat(100));

    expect(Buffer.byteLength(tag, 'utf8')).toBeLessThanOrEqual(
      MAX_PLAYWRIGHT_REPORT_TAG_BYTES,
    );
    expect(Buffer.from(tag, 'utf8').toString('utf8')).toBe(tag);
  });

  it('uses the full title for the hash when long prefixes match', () => {
    const commonPrefix = '相同的超长标题前缀'.repeat(30);

    expect(buildPlaywrightReportTag(`${commonPrefix}-甲`)).not.toBe(
      buildPlaywrightReportTag(`${commonPrefix}-乙`),
    );
  });

  it('rejects a suffix that leaves no room for a valid tag', () => {
    expect(() => buildPlaywrightReportTag('title', 'x'.repeat(200))).toThrow(
      'Playwright report suffix exceeds the 200-byte tag limit',
    );
  });
});
