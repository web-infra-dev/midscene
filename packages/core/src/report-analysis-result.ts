import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, parse, resolve } from 'node:path';
import { z } from 'zod/v4';
import type { JSONSchema } from 'zod/v4/core';
import type { ReportStatus } from './report-inspection';

export const REPORT_ANALYSIS_CATEGORY_LABELS = {
  model_reasoning: '模型理解与决策问题',
  test_design: '测试用例设计问题',
  midscene_runtime: 'Midscene 运行时与工具链问题',
  tested_system: '被测系统状态与行为异常',
  external_dependency: '外部依赖与运行环境问题',
  unattributed: '报告证据无法支持具体归因',
} as const;

export const REPORT_ANALYSIS_CONFIDENCE_LEVELS = [
  'high',
  'medium',
  'low',
] as const;

export const REPORT_PASSED_RESULT_ASSESSMENTS = [
  'true_pass',
  'false_pass',
  'unverifiable',
  'inconclusive',
] as const;

export const REPORT_FAILED_RESULT_ASSESSMENTS = [
  'true_fail',
  'false_fail',
  'unverifiable',
  'inconclusive',
] as const;

export const REPORT_RESULT_ASSESSMENTS = [
  'true_pass',
  'false_pass',
  'true_fail',
  'false_fail',
  'unverifiable',
  'inconclusive',
] as const;

export const REPORT_EVIDENCE_SOURCES = [
  'report state',
  'test instruction',
  'machine error',
  'action record',
  'screenshot',
  'structured output',
  'model decision record',
  'external evidence',
] as const;

export type ReportAnalysisCategory =
  keyof typeof REPORT_ANALYSIS_CATEGORY_LABELS;
export type ReportAnalysisConfidence =
  (typeof REPORT_ANALYSIS_CONFIDENCE_LEVELS)[number];
export interface ReportAnalysisCauseCategory {
  category: ReportAnalysisCategory;
  confidence: ReportAnalysisConfidence;
  reason: string;
}
export type ReportPassedResultAssessment =
  (typeof REPORT_PASSED_RESULT_ASSESSMENTS)[number];
export type ReportFailedResultAssessment =
  (typeof REPORT_FAILED_RESULT_ASSESSMENTS)[number];
export type ReportResultAssessment = (typeof REPORT_RESULT_ASSESSMENTS)[number];
export type ReportEvidenceSource = (typeof REPORT_EVIDENCE_SOURCES)[number];
export interface ReportAnalysisEvidence {
  source: ReportEvidenceSource;
  fact: string;
  screenshot?: string;
}

interface ReportAnalysisBaseResult {
  report: string;
  conclusion: string;
  evidence: ReportAnalysisEvidence[];
  confidence: ReportAnalysisConfidence;
  limitations: string;
}

interface ReportFailedResultAnalysisCommon extends ReportAnalysisBaseResult {
  reportStatus: 'fail';
  resultAssessmentReason: string;
  causeCategories: ReportAnalysisCauseCategory[];
}

export type ReportFailedResultAnalysisResult =
  | (ReportFailedResultAnalysisCommon & {
      resultAssessment: 'true_fail';
      failureReason: string;
      failedStep: string;
    })
  | (ReportFailedResultAnalysisCommon & {
      resultAssessment: Exclude<ReportFailedResultAssessment, 'true_fail'>;
      failureReason?: never;
      failedStep?: never;
    });

interface ReportPassedResultAnalysisCommon extends ReportAnalysisBaseResult {
  reportStatus: 'pass';
  resultAssessmentReason: string;
  causeCategories: ReportAnalysisCauseCategory[];
}

export type ReportPassedResultAnalysisResult =
  | (ReportPassedResultAnalysisCommon & {
      resultAssessment: 'false_pass';
      passClaimIssuePoint: string;
    })
  | (ReportPassedResultAnalysisCommon & {
      resultAssessment: Exclude<ReportPassedResultAssessment, 'false_pass'>;
      passClaimIssuePoint?: never;
    });

export interface ReportIncompleteExecutionAnalysisResult
  extends ReportAnalysisBaseResult {
  reportStatus: 'incomplete';
  lastRecordedStep: string;
  observedIssue: string;
  interruptionReason: string;
  causeCategories: ReportAnalysisCauseCategory[];
}

export type MidsceneReportAnalysisResult =
  | ReportFailedResultAnalysisResult
  | ReportPassedResultAnalysisResult
  | ReportIncompleteExecutionAnalysisResult;

const nonEmptyString = (description: string) =>
  z
    .string()
    .regex(/\S/, 'Must contain non-whitespace text')
    .describe(description);

const reportAnalysisCategorySchema = z.enum(
  Object.keys(REPORT_ANALYSIS_CATEGORY_LABELS) as [
    ReportAnalysisCategory,
    ...ReportAnalysisCategory[],
  ],
);

const reportAnalysisConfidenceSchema = z.enum(
  REPORT_ANALYSIS_CONFIDENCE_LEVELS,
);

const reportAnalysisCauseCategorySchema = z.strictObject({
  category: reportAnalysisCategorySchema.describe(
    'Cause category. Use unattributed only when the report does not positively support any concrete category; unattributed must be the sole entry.',
  ),
  confidence: reportAnalysisConfidenceSchema.describe(
    'Confidence in this cause-category decision: for a concrete category, high for direct corroborated evidence, medium for a supported inference, and low for an evidence-grounded possible cause when the report cannot distinguish ownership; for unattributed, confidence that no concrete category is supportable from the report. Low confidence must still be supported by observed report facts.',
  ),
  reason: nonEmptyString(
    'Concise evidence-based reason why this category applies. For unattributed, identify the missing or ambiguous evidence that prevents a concrete attribution, or state that no relevant issue was evidenced. When multiple concrete categories are present, state whether this entry is a joint cause or an alternative possible cause.',
  ),
});

const reportAnalysisCauseCategoriesMeta = {
  uniqueItems: true,
  if: {
    contains: {
      type: 'object',
      properties: { category: { const: 'unattributed' } },
      required: ['category'],
    },
  },
  // biome-ignore lint/suspicious/noThenProperty: Draft 2020-12 JSON Schema uses the standard if/then keywords.
  then: { maxItems: 1 },
} as const;

const nonScreenshotEvidenceSources = REPORT_EVIDENCE_SOURCES.filter(
  (source) => source !== 'screenshot',
) as [
  Exclude<ReportEvidenceSource, 'screenshot'>,
  ...Exclude<ReportEvidenceSource, 'screenshot'>[],
];

const reportAnalysisScreenshotPathSchema = z
  .string()
  .regex(
    /^(?:https?:\/\/|\/|[A-Za-z]:[\\/]|\\\\)\S.*$/i,
    'Must be an absolute local path or HTTP(S) URL',
  )
  .meta({
    description: 'Absolute local path or HTTP(S) URL for the screenshot.',
    $comment: 'A local screenshot file must also exist when rendered.',
  });

const reportAnalysisEvidenceSchema = z
  .union([
    z.strictObject({
      source: z.literal('screenshot'),
      fact: nonEmptyString('Fact directly visible in the screenshot.'),
      screenshot: reportAnalysisScreenshotPathSchema,
    }),
    z.strictObject({
      source: z.enum(nonScreenshotEvidenceSources),
      fact: nonEmptyString('Task-bound fact established by this source.'),
    }),
  ])
  .meta({
    id: 'ReportAnalysisEvidence',
    description: 'One piece of report evidence.',
  });

const reportAnalysisEvidenceArraySchema = z
  .array(reportAnalysisEvidenceSchema)
  .min(1)
  .meta({
    id: 'ReportAnalysisEvidenceList',
    description: 'Evidence supporting the assessment and attribution.',
  });

const commonResultShape = {
  report: nonEmptyString('Original report URL or local HTML path.'),
  conclusion: nonEmptyString('Concise overall conclusion.'),
  evidence: reportAnalysisEvidenceArraySchema,
  confidence: reportAnalysisConfidenceSchema.describe(
    'Confidence in the analysis conclusion: high for direct corroborated evidence, medium for a supported inference, and low when the conclusion itself remains uncertain. An unverifiable, inconclusive, or incomplete conclusion may still have high confidence when that limitation is directly established.',
  ),
  limitations: nonEmptyString(
    'Known evidence limitations; use "none" if none.',
  ),
};

const failedCommonShape = {
  ...commonResultShape,
  reportStatus: z.literal('fail'),
  resultAssessmentReason: nonEmptyString(
    'Evidence-based reason for resultAssessment.',
  ),
  causeCategories: z
    .array(reportAnalysisCauseCategorySchema)
    .min(1)
    .meta(reportAnalysisCauseCategoriesMeta)
    .describe(
      'Required cause-category decision for this failed-report assessment. Use one or more evidence-supported concrete categories, each with independent confidence, or exactly one unattributed entry when the report does not support a concrete attribution. Multiple concrete entries may be joint causes or alternative possible causes; explain their relationship in the reason or evidence.',
    ),
};

const failedTrueFailSchema = z
  .strictObject({
    ...failedCommonShape,
    resultAssessment: z.literal('true_fail'),
    failureReason: nonEmptyString(
      'Why the requested task or required outcome truly failed.',
    ),
    failedStep: nonEmptyString(
      'Step where the required outcome failed or became impossible.',
    ),
  })
  .meta({
    title: 'Midscene failed-report analysis result',
    description: 'Recorded failure confirmed by the report evidence.',
  });

const failedFalseFailSchema = z
  .strictObject({
    ...failedCommonShape,
    resultAssessment: z.literal('false_fail'),
  })
  .meta({
    title: 'Midscene failed-report analysis result',
    description:
      'Recorded failure contradicted by evidence of successful outcome.',
  });

const failedUnverifiableSchema = z
  .strictObject({
    ...failedCommonShape,
    resultAssessment: z.literal('unverifiable'),
  })
  .meta({
    title: 'Midscene failed-report analysis result',
    description:
      'Recorded failure whose tested outcome lacks sufficient evidence.',
  });

const failedInconclusiveSchema = z
  .strictObject({
    ...failedCommonShape,
    resultAssessment: z.literal('inconclusive'),
  })
  .meta({
    title: 'Midscene failed-report analysis result',
    description:
      'Recorded failure with conflicting or inherently ambiguous evidence.',
  });

const FAILED_RESULT_SCHEMAS = {
  true_fail: failedTrueFailSchema,
  false_fail: failedFalseFailSchema,
  unverifiable: failedUnverifiableSchema,
  inconclusive: failedInconclusiveSchema,
} as const;

const passedCommonShape = {
  ...commonResultShape,
  reportStatus: z.literal('pass'),
  resultAssessmentReason: nonEmptyString(
    'Evidence-based reason for resultAssessment.',
  ),
  causeCategories: z
    .array(reportAnalysisCauseCategorySchema)
    .min(1)
    .meta(reportAnalysisCauseCategoriesMeta)
    .describe(
      'Required cause-category decision for issues relevant to this passed-report assessment: a recovered issue for true_pass, the incorrect pass for false_pass, the evidence gap for unverifiable, or the evidence conflict for inconclusive. Use one or more evidence-supported concrete categories, each with independent confidence, or exactly one unattributed entry when no concrete category is supported or no relevant issue was evidenced.',
    ),
};

const passedTruePassSchema = z
  .strictObject({
    ...passedCommonShape,
    resultAssessment: z.literal('true_pass'),
  })
  .meta({
    title: 'Midscene passed-report analysis result',
    description: 'Recorded pass directly supported by the report evidence.',
  });

const passedFalsePassSchema = z
  .strictObject({
    ...passedCommonShape,
    resultAssessment: z.literal('false_pass'),
    passClaimIssuePoint: nonEmptyString(
      'Required condition proven unmet at its judgment point.',
    ),
  })
  .meta({
    title: 'Midscene passed-report analysis result',
    description: 'Recorded pass contradicted by the report evidence.',
  });

const passedUnverifiableSchema = z
  .strictObject({
    ...passedCommonShape,
    resultAssessment: z.literal('unverifiable'),
  })
  .meta({
    title: 'Midscene passed-report analysis result',
    description:
      'Recorded pass whose tested outcome lacks sufficient evidence.',
  });

const passedInconclusiveSchema = z
  .strictObject({
    ...passedCommonShape,
    resultAssessment: z.literal('inconclusive'),
  })
  .meta({
    title: 'Midscene passed-report analysis result',
    description:
      'Recorded pass with conflicting or inherently ambiguous evidence.',
  });

const PASSED_RESULT_SCHEMAS = {
  true_pass: passedTruePassSchema,
  false_pass: passedFalsePassSchema,
  unverifiable: passedUnverifiableSchema,
  inconclusive: passedInconclusiveSchema,
} as const;

const incompleteExecutionSchema = z
  .strictObject({
    ...commonResultShape,
    reportStatus: z.literal('incomplete'),
    lastRecordedStep: nonEmptyString(
      'Final recorded task and its observable state.',
    ),
    observedIssue: nonEmptyString(
      'Report-internal issue observed before interruption, or an explicit statement that none was observed.',
    ),
    interruptionReason: nonEmptyString(
      'Why the execution remained non-terminal, including any uncertainty not resolved by the report.',
    ),
    causeCategories: z
      .array(reportAnalysisCauseCategorySchema)
      .min(1)
      .meta(reportAnalysisCauseCategoriesMeta)
      .describe(
        'Required cause-category decision for the observed issue or a directly linked interruption. Use one or more evidence-supported concrete categories, each with independent confidence, or exactly one unattributed entry when no concrete category is supported. Multiple concrete entries may be joint or alternative possible causes; explain their relationship in the conclusion or evidence.',
      ),
  })
  .meta({
    title: 'Midscene incomplete-execution analysis result',
    description: 'Analysis result for a report that did not complete.',
  });

const REPORT_ANALYSIS_SCHEMAS = {
  incomplete: incompleteExecutionSchema,
} as const;

export type ReportAnalysisJsonSchema = JSONSchema.BaseSchema;

type JsonObject = Record<string, unknown>;

const COMMON_FIELDS = [
  'report',
  'reportStatus',
  'conclusion',
  'evidence',
  'confidence',
  'limitations',
] as const;

function fail(message: string): never {
  throw new Error(message);
}

function has(object: JsonObject, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function expectObject(
  value: unknown,
  location: string,
): asserts value is JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${location} must be an object`);
  }
}

function expectAllowedFields(
  object: JsonObject,
  allowed: readonly string[],
  location: string,
): void {
  const allowedSet = new Set(allowed);
  const extra = Object.keys(object).filter((key) => !allowedSet.has(key));
  if (extra.length > 0) {
    fail(`${location} contains unsupported field(s): ${extra.join(', ')}`);
  }
}

function requireString(
  object: JsonObject,
  key: string,
  location: string,
): string {
  const value = object[key];
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`${location}.${key} must be a non-empty string`);
  }
  return value.trim();
}

function requireEnum<const T extends readonly string[]>(
  object: JsonObject,
  key: string,
  values: T,
  location: string,
): T[number] {
  const value = requireString(object, key, location);
  if (!values.includes(value)) {
    fail(`${location}.${key} must be one of: ${values.join(', ')}`);
  }
  return value as T[number];
}

function requireArray(
  object: JsonObject,
  key: string,
  location: string,
  options: { nonEmpty?: boolean } = {},
): unknown[] {
  const nonEmpty = options.nonEmpty ?? true;
  const value = object[key];
  if (!Array.isArray(value) || (nonEmpty && value.length === 0)) {
    fail(`${location}.${key} must be ${nonEmpty ? 'a non-empty' : 'an'} array`);
  }
  return value;
}

function forbidFields(
  object: JsonObject,
  fields: readonly string[],
  location: string,
): void {
  const present = fields.filter((field) => has(object, field));
  if (present.length > 0) {
    fail(`${location} must omit field(s): ${present.join(', ')}`);
  }
}

function validateCategory(
  value: unknown,
  location: string,
): asserts value is ReportAnalysisCategory {
  if (
    typeof value !== 'string' ||
    !Object.prototype.hasOwnProperty.call(
      REPORT_ANALYSIS_CATEGORY_LABELS,
      value,
    )
  ) {
    fail(
      `${location} must be one of: ${Object.keys(REPORT_ANALYSIS_CATEGORY_LABELS).join(', ')}`,
    );
  }
}

function validateScreenshot(value: unknown, location: string): void {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`${location} must be a non-empty string`);
  }

  const target = value.trim();
  if (/^https?:\/\//i.test(target)) return;
  if (!isAbsolute(target)) {
    fail(`${location} must be an absolute local path or an HTTP(S) URL`);
  }
  if (!existsSync(target) || !statSync(target).isFile()) {
    fail(`${location} local file does not exist: ${target}`);
  }
}

function validateEvidenceItem(item: unknown, location: string): void {
  expectObject(item, location);
  expectAllowedFields(item, ['source', 'fact', 'screenshot'], location);
  const source = requireEnum(item, 'source', REPORT_EVIDENCE_SOURCES, location);
  requireString(item, 'fact', location);

  if (source === 'screenshot') {
    if (!has(item, 'screenshot')) {
      fail(`${location}.screenshot is required for screenshot evidence`);
    }
    validateScreenshot(item.screenshot, `${location}.screenshot`);
  } else if (has(item, 'screenshot')) {
    fail(`${location}.screenshot is allowed only when source is screenshot`);
  }
}

function validateEvidenceArray(
  object: JsonObject,
  key: string,
  location: string,
): void {
  const items = requireArray(object, key, location);
  items.forEach((item, index) =>
    validateEvidenceItem(item, `${location}.${key}[${index}]`),
  );
}

function validateCommon(
  object: JsonObject,
  expectedStatus: 'fail' | 'pass' | 'incomplete',
): void {
  const location = 'result';
  requireString(object, 'report', location);
  const reportStatus = requireEnum(
    object,
    'reportStatus',
    ['fail', 'pass', 'incomplete'] as const,
    location,
  );
  if (reportStatus !== expectedStatus) {
    fail(`result.reportStatus must be ${expectedStatus}`);
  }
  requireString(object, 'conclusion', location);
  validateEvidenceArray(object, 'evidence', location);
  requireEnum(
    object,
    'confidence',
    REPORT_ANALYSIS_CONFIDENCE_LEVELS,
    location,
  );
  requireString(object, 'limitations', location);
}

function validateIncompleteExecution(object: JsonObject): void {
  const location = 'result';
  expectAllowedFields(
    object,
    [
      ...COMMON_FIELDS,
      'lastRecordedStep',
      'observedIssue',
      'interruptionReason',
      'causeCategories',
    ],
    location,
  );
  validateCommon(object, 'incomplete');
  requireString(object, 'lastRecordedStep', location);
  requireString(object, 'observedIssue', location);
  requireString(object, 'interruptionReason', location);
  validateCauseCategories(object, location);
}

function validateFailedResult(object: JsonObject): void {
  const location = 'result';
  expectAllowedFields(
    object,
    [
      ...COMMON_FIELDS,
      'resultAssessment',
      'resultAssessmentReason',
      'causeCategories',
      'failureReason',
      'failedStep',
    ],
    location,
  );
  validateCommon(object, 'fail');
  const assessment = requireEnum(
    object,
    'resultAssessment',
    REPORT_FAILED_RESULT_ASSESSMENTS,
    location,
  );
  requireString(object, 'resultAssessmentReason', location);
  validateCauseCategories(object, location);

  if (assessment === 'true_fail') {
    requireString(object, 'failureReason', location);
    requireString(object, 'failedStep', location);
    return;
  }

  forbidFields(object, ['failureReason', 'failedStep'], location);
}

function validateCauseCategories(object: JsonObject, location: string): void {
  const categories = requireArray(object, 'causeCategories', location);
  const seen = new Set<string>();
  categories.forEach((item, index) => {
    const itemLocation = `${location}.causeCategories[${index}]`;
    expectObject(item, itemLocation);
    expectAllowedFields(
      item,
      ['category', 'confidence', 'reason'],
      itemLocation,
    );
    const category = item.category;
    validateCategory(category, `${itemLocation}.category`);
    requireEnum(
      item,
      'confidence',
      REPORT_ANALYSIS_CONFIDENCE_LEVELS,
      itemLocation,
    );
    requireString(item, 'reason', itemLocation);
    if (seen.has(category)) {
      fail(`result.causeCategories contains duplicate category: ${category}`);
    }
    seen.add(category);
  });
  if (seen.has('unattributed') && categories.length !== 1) {
    fail('result.causeCategories must use unattributed as the sole entry');
  }
}

function validatePassedResult(object: JsonObject): void {
  const location = 'result';
  expectAllowedFields(
    object,
    [
      ...COMMON_FIELDS,
      'resultAssessment',
      'resultAssessmentReason',
      'causeCategories',
      'passClaimIssuePoint',
    ],
    location,
  );
  validateCommon(object, 'pass');
  const assessment = requireEnum(
    object,
    'resultAssessment',
    REPORT_PASSED_RESULT_ASSESSMENTS,
    location,
  );
  requireString(object, 'resultAssessmentReason', location);
  validateCauseCategories(object, location);

  if (assessment === 'false_pass') {
    requireString(object, 'passClaimIssuePoint', location);
    return;
  }

  forbidFields(object, ['passClaimIssuePoint'], location);
}

export function validateReportAnalysisResult(
  value: unknown,
): asserts value is MidsceneReportAnalysisResult {
  expectObject(value, 'result');
  const reportStatus = requireEnum(
    value,
    'reportStatus',
    ['fail', 'pass', 'incomplete'] as const,
    'result',
  );
  if (reportStatus === 'incomplete') {
    validateIncompleteExecution(value);
  } else if (reportStatus === 'fail') {
    validateFailedResult(value);
  } else {
    validatePassedResult(value);
  }
}

function formatCategory(cause: ReportAnalysisCauseCategory): string {
  return `\`${cause.category}\` (\`${cause.confidence}\` confidence) — ${REPORT_ANALYSIS_CATEGORY_LABELS[cause.category]}: ${cause.reason.trim()}`;
}

function markdownImageDestination(value: string): string {
  return `<${value.trim().replaceAll('>', '%3E')}>`;
}

function indentText(value: string, indent: string): string {
  return String(value)
    .trim()
    .split(/\r?\n/)
    .map((line) => `${indent}${line}`)
    .join('\n');
}

function renderEvidence(items: ReportAnalysisEvidence[]): string {
  return items
    .map((item) => {
      const lines = [
        `- **Source:** \`${item.source}\``,
        '',
        `  **Fact:** ${indentText(item.fact, '  ').trimStart()}`,
      ];
      if (item.source === 'screenshot' && item.screenshot) {
        lines.push(
          '',
          '  **Screenshot:**',
          '',
          `  ![Screenshot evidence](${markdownImageDestination(item.screenshot)})`,
        );
      }
      return lines.join('\n');
    })
    .join('\n\n');
}

function renderHeader(
  report: string | null,
  metadata: Array<[string, string]>,
): string[] {
  return [
    `**Report:** ${report ? `\`${report}\`` : 'Not supplied'}`,
    ...metadata.map(([label, value]) => `**${label}:** \`${value}\``),
  ].flatMap((line, index) => (index === 0 ? [line] : ['', line]));
}

function renderDetail(label: string, value: string): string {
  const content = value.trim();
  return content.includes('\n')
    ? `**${label}:**\n\n${content}`
    : `**${label}:** ${content}`;
}

function renderAssessment(confidence: string, limitations: string): string[] {
  return [
    `**Confidence:** \`${confidence}\``,
    '',
    `**Limitations:** ${limitations.trim()}`,
  ];
}

function renderFailedResult(result: ReportFailedResultAnalysisResult): string {
  const details = [
    renderDetail('Result-assessment reason', result.resultAssessmentReason),
  ];
  const categories = result.causeCategories.map(formatCategory);
  details.push(
    renderDetail(
      'Cause categories',
      categories.length === 1
        ? categories[0]
        : categories.map((category) => `- ${category}`).join('\n'),
    ),
  );
  if (result.resultAssessment === 'true_fail') {
    details.push(
      renderDetail('Failure reason', result.failureReason),
      renderDetail('Failed step', result.failedStep),
    );
  }
  const output = [
    ...renderHeader(result.report, [
      ['Report status', 'fail'],
      ['Result assessment', result.resultAssessment],
    ]),
    '',
    renderDetail('Conclusion', result.conclusion),
  ];
  if (details.length > 0) {
    output.push('', details.join('\n\n'));
  }
  output.push('', '**Evidence:**', '', renderEvidence(result.evidence));
  output.push('', ...renderAssessment(result.confidence, result.limitations));
  return output.join('\n');
}

function renderPassedResult(result: ReportPassedResultAnalysisResult): string {
  const details = [
    renderDetail('Result-assessment reason', result.resultAssessmentReason),
  ];
  const categories = result.causeCategories.map(formatCategory);
  details.push(
    renderDetail(
      'Cause categories',
      categories.length === 1
        ? categories[0]
        : categories.map((category) => `- ${category}`).join('\n'),
    ),
  );
  if (result.resultAssessment === 'false_pass') {
    details.push(
      renderDetail('Pass-claim issue point', result.passClaimIssuePoint),
    );
  }
  const output = [
    ...renderHeader(result.report, [
      ['Report status', 'pass'],
      ['Result assessment', result.resultAssessment],
    ]),
    '',
    renderDetail('Conclusion', result.conclusion),
  ];
  if (details.length > 0) {
    output.push('', details.join('\n\n'));
  }
  output.push('', '**Evidence:**', '', renderEvidence(result.evidence));
  output.push('', ...renderAssessment(result.confidence, result.limitations));
  return output.join('\n');
}

function renderIncompleteExecution(
  result: ReportIncompleteExecutionAnalysisResult,
): string {
  const details = [
    renderDetail('Observed issue', result.observedIssue),
    renderDetail('Interruption reason', result.interruptionReason),
    renderDetail('Last recorded step', result.lastRecordedStep),
  ];
  const categories = result.causeCategories.map(formatCategory);
  details.push(
    renderDetail(
      'Cause categories',
      categories.length === 1
        ? categories[0]
        : categories.map((category) => `- ${category}`).join('\n'),
    ),
  );
  const output = [
    ...renderHeader(result.report, [['Report status', 'incomplete']]),
    '',
    renderDetail('Conclusion', result.conclusion),
    '',
    details.join('\n\n'),
    '',
    '**Evidence:**',
    '',
    renderEvidence(result.evidence),
  ];
  output.push('', ...renderAssessment(result.confidence, result.limitations));
  return output.join('\n');
}

export function renderReportAnalysisResult(value: unknown): string {
  validateReportAnalysisResult(value);
  if (value.reportStatus === 'incomplete') {
    return renderIncompleteExecution(value);
  }
  if (value.reportStatus === 'fail') {
    return renderFailedResult(value);
  }
  return renderPassedResult(value);
}

export function getReportAnalysisJsonSchema(
  reportStatus: ReportStatus,
  resultAssessment?: ReportResultAssessment,
): ReportAnalysisJsonSchema {
  let schema: z.ZodType;
  if (reportStatus === 'fail') {
    if (
      !resultAssessment ||
      !Object.prototype.hasOwnProperty.call(
        FAILED_RESULT_SCHEMAS,
        resultAssessment,
      )
    ) {
      fail(
        `result assessment is required for fail and must be one of: ${REPORT_FAILED_RESULT_ASSESSMENTS.join(', ')}`,
      );
    }
    schema =
      FAILED_RESULT_SCHEMAS[resultAssessment as ReportFailedResultAssessment];
  } else if (reportStatus === 'pass') {
    if (
      !resultAssessment ||
      !Object.prototype.hasOwnProperty.call(
        PASSED_RESULT_SCHEMAS,
        resultAssessment,
      )
    ) {
      fail(
        `result assessment is required for pass and must be one of: ${REPORT_PASSED_RESULT_ASSESSMENTS.join(', ')}`,
      );
    }
    schema =
      PASSED_RESULT_SCHEMAS[resultAssessment as ReportPassedResultAssessment];
  } else if (reportStatus === 'incomplete') {
    if (resultAssessment !== undefined) {
      fail('result assessment is supported only for fail or pass');
    }
    schema = REPORT_ANALYSIS_SCHEMAS.incomplete;
  } else {
    fail('report status must be one of: pass, fail, incomplete');
  }
  return z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    override: ({ jsonSchema }) => {
      jsonSchema.id = undefined;
    },
  });
}

export interface PlannedReportAnalysisResult {
  analysisResultPath: string;
  schema: ReportAnalysisJsonSchema;
}

export function planReportAnalysisResult(
  reportStatus: ReportStatus,
  htmlPath: string,
  outputDir = process.cwd(),
  resultAssessment?: ReportResultAssessment,
): PlannedReportAnalysisResult {
  const schema = getReportAnalysisJsonSchema(reportStatus, resultAssessment);
  const reportName = parse(htmlPath).name || 'report';
  const resolvedOutputDir = resolve(outputDir);
  mkdirSync(resolvedOutputDir, { recursive: true });

  for (let index = 0; ; index += 1) {
    const suffix = index === 0 ? '' : `-${index}`;
    const analysisResultPath = join(
      resolvedOutputDir,
      `${reportName}-analysis-json${suffix}.json`,
    );
    const analysisOutputPath =
      resolveAnalysisMarkdownOutputPath(analysisResultPath);
    if (existsSync(analysisResultPath) || existsSync(analysisOutputPath)) {
      continue;
    }
    return { analysisResultPath, schema };
  }
}

export function parseReportAnalysisResultJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return fail(`invalid JSON: ${detail}`);
  }
}

export function renderReportAnalysisResultFile(filePath: string): string {
  const raw = readFileSync(filePath === '-' ? 0 : filePath, 'utf8');
  return renderReportAnalysisResult(parseReportAnalysisResultJson(raw));
}

function resolveAnalysisMarkdownOutputPath(
  analysisResultPath: string,
  outputPath?: string,
): string {
  if (outputPath) return resolve(outputPath);
  if (analysisResultPath === '-') {
    fail(
      'analysis Markdown output path is required when the analysis result is read from stdin',
    );
  }
  const inputPath = resolve(analysisResultPath);
  const parsed = parse(inputPath);
  const pairedName = parsed.name.match(/^(.*)-analysis-json(-\d+)?$/);
  if (pairedName) {
    return join(
      parsed.dir,
      `${pairedName[1]}-analysis-result${pairedName[2] ?? ''}.md`,
    );
  }
  return join(parsed.dir, `${parsed.name}.md`);
}

export function renderReportAnalysisResultMarkdownFile(
  analysisResultPath: string,
  outputPath?: string,
): string {
  const markdown = renderReportAnalysisResultFile(analysisResultPath);
  const resolvedOutputPath = resolveAnalysisMarkdownOutputPath(
    analysisResultPath,
    outputPath,
  );
  if (
    analysisResultPath !== '-' &&
    resolve(analysisResultPath) === resolvedOutputPath
  ) {
    fail('analysis Markdown output path must differ from the input JSON path');
  }
  mkdirSync(dirname(resolvedOutputPath), { recursive: true });
  writeFileSync(resolvedOutputPath, markdown, 'utf8');
  return resolvedOutputPath;
}
