export declare const reportTemplateMagicString: string;
export declare const reportTemplateModulePaths: {
  cjs: string;
  esm: string;
};
export declare function validateReportHtml(html: string): string;
export declare function renderReportTemplateModules(html: string): {
  cjs: string;
  esm: string;
};
export declare function writeReportTemplateModules(
  coreDistDir: string,
  html: string,
): string[];
export declare function validateCoreReportTemplateModules(
  coreDistDir: string,
): void;
