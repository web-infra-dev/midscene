// The string literal below is replaced at build time by the rslib
// `injectReportTemplate` plugin with the full HTML content of
// `apps/report/dist/index.html`. Keeping this placeholder in its own module
// means the multi-megabyte template never ends up in `utils.ts`'s static
// module graph — downstream bundlers (e.g. the Studio renderer) that never
// generate reports don't drag the blob into their output.
export const REPORT_HTML_TEMPLATE: string = 'REPLACE_ME_WITH_REPORT_HTML';
