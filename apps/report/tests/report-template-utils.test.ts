import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from '@rstest/core';
import {
  renderReportTemplateModules,
  reportTemplateMagicString,
  validateCoreReportTemplateModules,
  validateReportHtml,
  writeReportTemplateModules,
} from '../../../scripts/report-template-utils.mjs';

describe('report template utils', () => {
  const html = '<!doctype html><html><body><div id="root"></div></body></html>';

  it('renders standalone CJS and ESM template modules', () => {
    const modules = renderReportTemplateModules(html);

    expect(modules.cjs).toContain(
      `exports.REPORT_HTML_TEMPLATE = ${JSON.stringify(html)}`,
    );
    expect(modules.esm).toContain(
      `export const REPORT_HTML_TEMPLATE = ${JSON.stringify(html)}`,
    );
    expect(
      renderReportTemplateModules(
        html.replace('</body>', `${reportTemplateMagicString}</body>`),
      ).cjs,
    ).not.toContain(reportTemplateMagicString);
  });

  it('rejects invalid report HTML', () => {
    expect(() => validateReportHtml('')).toThrow('empty');
    expect(() =>
      validateReportHtml(
        `<!doctype html><html><div id="root"></div>${reportTemplateMagicString}</html>`,
      ),
    ).toThrow('placeholder');
    expect(() =>
      validateReportHtml(
        '<!doctype html><html><div id="root"></div><!doctype html></html>',
      ),
    ).toThrow('exactly one');
  });

  it('writes and validates the fixed template module files', () => {
    const coreDistDir = fs.mkdtempSync(
      path.join(process.cwd(), '.midscene-report-template-'),
    );
    try {
      writeReportTemplateModules(coreDistDir, html);
      expect(() =>
        validateCoreReportTemplateModules(coreDistDir),
      ).not.toThrow();
    } finally {
      fs.rmSync(coreDistDir, { recursive: true });
    }
  });
});
