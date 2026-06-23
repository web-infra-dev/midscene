export declare const reportTemplateMagicString: string;
export declare const reportTemplateReplacedMark: string;
export declare const reportTemplateReplacementRegExp: RegExp;

export declare function isReportTemplateInjectableFile(file: unknown): boolean;
export declare function sanitizeNestedReportTemplate(html: string): string;
export declare function buildReportTemplateInjection(html: string): {
  sanitizedTplFileContent: string;
  finalContent: string;
};
