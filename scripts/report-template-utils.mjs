export const reportTemplateMagicString = 'REPLACE_ME_WITH_REPORT_HTML';
export const reportTemplateReplacedMark = '/*REPORT_HTML_REPLACED*/';
export const reportTemplateReplacementRegExp = /\/\*REPORT_HTML_REPLACED\*\/.*/;

export function isReportTemplateInjectableFile(file) {
  return (
    typeof file === 'string' && (file.endsWith('.js') || file.endsWith('.mjs'))
  );
}

export function sanitizeNestedReportTemplate(html) {
  return html.replace(
    /\/\*REPORT_HTML_REPLACED\*\/"(?:\\.|[^"\\])*"/g,
    '/*REPORT_HTML_REPLACED*/""',
  );
}

export function buildReportTemplateInjection(html) {
  const sanitizedTplFileContent = sanitizeNestedReportTemplate(
    html.replaceAll(reportTemplateMagicString, ''),
  );
  const finalContent = `${reportTemplateReplacedMark}${JSON.stringify(
    sanitizedTplFileContent,
  )}`;

  return {
    sanitizedTplFileContent,
    finalContent,
  };
}
