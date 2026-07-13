import { describe, expect, it } from '@rstest/core';
import {
  buildReportTemplateInjection,
  reportTemplateMagicString,
  reportTemplateReplacedMark,
  reportTemplateReplacementRegExp,
} from '../../../scripts/report-template-utils.mjs';

describe('report template utils', () => {
  it('should remove placeholders and sanitize nested injected report templates', () => {
    const html = [
      '<html>',
      `${reportTemplateMagicString}<body>latest report</body>`,
      `<script>window.__REPORT__=${reportTemplateReplacedMark}"<html>old report</html>"</script>`,
      '</html>',
    ].join('');

    const { sanitizedTplFileContent, finalContent } =
      buildReportTemplateInjection(html);

    expect(sanitizedTplFileContent).not.toContain(reportTemplateMagicString);
    expect(sanitizedTplFileContent).toContain(
      `${reportTemplateReplacedMark}""`,
    );
    expect(finalContent).toMatch(reportTemplateReplacementRegExp);
    expect(
      JSON.parse(finalContent.slice(reportTemplateReplacedMark.length)),
    ).toBe(sanitizedTplFileContent);
  });
});
