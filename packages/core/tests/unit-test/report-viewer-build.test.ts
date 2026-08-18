import { getReportTpl, reportHTMLContent } from '@/utils';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/constants', () => ({
  IS_REPORT_BUILD: true,
}));

describe('Report Viewer build', () => {
  it('excludes report generation and the embedded report template', () => {
    expect(getReportTpl()).toBe('');
    expect(reportHTMLContent('{}')).toBe('');
  });
});
