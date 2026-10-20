// Keep the Report template in its own source module. Core's bundle:false
// builds must emit standalone CJS and ESM module files so the Report build can
// replace them independently without rewriting the rest of Core's output.
export const REPORT_HTML_TEMPLATE = 'REPLACE_ME_WITH_REPORT_HTML';
