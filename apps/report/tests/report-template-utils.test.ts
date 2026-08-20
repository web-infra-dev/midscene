import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from '@rstest/core';
import {
  renderReportTemplateModules,
  reportTemplateMagicString,
  reportTemplateMaxBytes,
  reportTemplateModulePaths,
  syncCoreReportTemplateModules,
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
    expect(() =>
      renderReportTemplateModules(
        html.replace('</body>', `${reportTemplateMagicString}</body>`),
      ),
    ).toThrow('placeholder');
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
    expect(() =>
      validateReportHtml(
        html.replace('</body>', `${'x'.repeat(reportTemplateMaxBytes)}</body>`),
      ),
    ).toThrow('3 MiB size limit');
  });

  it('writes and validates the fixed template module files', () => {
    const coreDistDir = fs.mkdtempSync(
      path.join(process.cwd(), '.midscene-report-template-'),
    );
    const reportTemplatePath = path.join(coreDistDir, 'report.html');
    try {
      fs.writeFileSync(reportTemplatePath, html);
      writeReportTemplateModules(coreDistDir, html);
      expect(() =>
        validateCoreReportTemplateModules(coreDistDir, {
          reportTemplatePath,
        }),
      ).not.toThrow();

      fs.writeFileSync(
        reportTemplatePath,
        html.replace('<body>', '<body><p>new build</p>'),
      );
      expect(() =>
        validateCoreReportTemplateModules(coreDistDir, {
          reportTemplatePath,
        }),
      ).toThrow('does not match');

      fs.writeFileSync(reportTemplatePath, html);
      fs.writeFileSync(
        path.join(coreDistDir, reportTemplateModulePaths.cjs),
        'x'.repeat(reportTemplateMaxBytes + 1),
      );
      expect(() =>
        validateCoreReportTemplateModules(coreDistDir, {
          reportTemplatePath,
        }),
      ).toThrow('3 MiB size limit');
    } finally {
      fs.rmSync(coreDistDir, { recursive: true });
    }
  });

  it('synchronizes an existing Report build into Core', () => {
    const coreDistDir = fs.mkdtempSync(
      path.join(process.cwd(), '.midscene-report-template-sync-'),
    );
    const reportTemplatePath = path.join(coreDistDir, 'report.html');
    try {
      fs.writeFileSync(reportTemplatePath, html);
      expect(
        syncCoreReportTemplateModules({ coreDistDir, reportTemplatePath }),
      ).toHaveLength(2);
      expect(() =>
        validateCoreReportTemplateModules(coreDistDir, {
          reportTemplatePath,
        }),
      ).not.toThrow();

      fs.rmSync(reportTemplatePath);
      expect(() =>
        syncCoreReportTemplateModules({ coreDistDir, reportTemplatePath }),
      ).toThrow('not found');
    } finally {
      fs.rmSync(coreDistDir, { recursive: true });
    }
  });
});
