import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  REPORT_ANALYSIS_CATEGORY_LABELS,
  getReportAnalysisJsonSchema,
  renderReportAnalysisResult,
  renderReportAnalysisResultMarkdownFile,
} from '../../src/report-analysis-result';

function causeCategory(
  category: string,
  confidence: 'high' | 'medium' | 'low' = 'high',
  reason = 'Observed report facts support this category.',
): Record<string, string> {
  return { category, confidence, reason };
}

function commonFailure(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    report: '/absolute/path/report.html',
    reportStatus: 'fail',
    resultAssessment: 'true_fail',
    resultAssessmentReason:
      'The required state remained absent after the correct action.',
    causeCategories: [causeCategory('tested_system')],
    conclusion: 'The recorded failure is established.',
    failureReason:
      'The application did not expose the required state after the correct action.',
    failedStep: 'WaitFor timed out.',
    evidence: [
      {
        source: 'action record',
        fact: 'The action completed before the wait timed out.',
      },
    ],
    confidence: 'high',
    limitations: 'none',
    ...overrides,
  };
}

function commonPass(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    report: '/absolute/path/report.html',
    reportStatus: 'pass',
    resultAssessment: 'true_pass',
    resultAssessmentReason:
      'Every required condition is supported at the judgment point.',
    causeCategories: [
      causeCategory(
        'unattributed',
        'high',
        'No relevant issue requiring a concrete cause attribution was evidenced.',
      ),
    ],
    conclusion: 'The recorded pass is correct.',
    evidence: [
      {
        source: 'structured output',
        fact: 'Every required clause is recorded as true.',
      },
    ],
    confidence: 'high',
    limitations: 'none',
    ...overrides,
  };
}

function commonIncomplete(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    report: '/absolute/path/report.html',
    reportStatus: 'incomplete',
    lastRecordedStep: 'A Scroll task remained running with only a start time.',
    conclusion:
      'A repeated model loop is established, while the exact termination event is not recorded.',
    observedIssue:
      'The model repeated the same ineffective upward-scroll decision.',
    interruptionReason:
      'The record does not distinguish an outer timeout, cancellation, or worker failure.',
    causeCategories: [causeCategory('model_reasoning')],
    evidence: [
      {
        source: 'report state',
        fact: 'The last task has status running and no end timestamp.',
      },
    ],
    confidence: 'high',
    limitations: 'The outer worker log is not embedded in the report.',
    ...overrides,
  };
}

function withoutFields(
  object: Record<string, unknown>,
  ...fields: string[]
): Record<string, unknown> {
  const omitted = new Set(fields);
  return Object.fromEntries(
    Object.entries(object).filter(([key]) => !omitted.has(key)),
  );
}

function failureForAssessment(
  resultAssessment:
    | 'true_fail'
    | 'false_fail'
    | 'unverifiable'
    | 'inconclusive',
): Record<string, unknown> {
  const result = commonFailure({ resultAssessment });
  return resultAssessment === 'true_fail'
    ? result
    : withoutFields(result, 'failureReason', 'failedStep');
}

function passForAssessment(
  resultAssessment:
    | 'true_pass'
    | 'false_pass'
    | 'unverifiable'
    | 'inconclusive',
): Record<string, unknown> {
  const result = commonPass({ resultAssessment });
  return resultAssessment === 'false_pass'
    ? {
        ...result,
        passClaimIssuePoint:
          'The required state was proven absent at the judgment point.',
      }
    : result;
}

describe('report analysis result', () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      if (existsSync(directory)) {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('generates a strict JSON Schema for every report status', () => {
    const failedSchema = getReportAnalysisJsonSchema(
      'fail',
      'true_fail',
    ) as Record<string, unknown>;
    expect(failedSchema.$schema).toBe(
      'https://json-schema.org/draft/2020-12/schema',
    );
    expect(failedSchema.title).toContain('Midscene');
    expect(failedSchema).not.toHaveProperty('anyOf');
    expect(JSON.stringify(failedSchema)).toContain(
      '"reportStatus":{"type":"string","const":"fail"}',
    );

    const passedSchema = getReportAnalysisJsonSchema(
      'pass',
      'true_pass',
    ) as Record<string, unknown>;
    expect(passedSchema.$schema).toBe(
      'https://json-schema.org/draft/2020-12/schema',
    );
    expect(passedSchema.title).toContain('Midscene');
    expect(passedSchema).not.toHaveProperty('anyOf');
    expect(JSON.stringify(passedSchema)).toContain(
      '"reportStatus":{"type":"string","const":"pass"}',
    );

    const incompleteSchema = getReportAnalysisJsonSchema(
      'incomplete',
    ) as Record<string, unknown>;
    expect(incompleteSchema.$schema).toBe(
      'https://json-schema.org/draft/2020-12/schema',
    );
    expect(incompleteSchema.title).toContain('Midscene');
    expect(incompleteSchema).not.toHaveProperty('anyOf');
    expect(JSON.stringify(incompleteSchema)).toContain(
      '"additionalProperties":false',
    );
  });

  it('requires cause categories and exposes the exclusive unattributed fallback in every Schema', () => {
    for (const [reportStatus, resultAssessment] of [
      ['fail', 'true_fail'],
      ['pass', 'true_pass'],
      ['incomplete', undefined],
    ] as const) {
      const schema = getReportAnalysisJsonSchema(
        reportStatus,
        resultAssessment,
      ) as {
        required: string[];
        properties: {
          causeCategories: {
            items: {
              properties: { category: { enum: string[] } };
            };
            if: Record<string, unknown>;
            then: Record<string, unknown>;
          };
        };
      };
      expect(schema.required).toContain('causeCategories');
      expect(
        schema.properties.causeCategories.items.properties.category.enum,
      ).toContain('unattributed');
      expect(schema.properties.causeCategories.if).toMatchObject({
        contains: {
          properties: { category: { const: 'unattributed' } },
          required: ['category'],
        },
      });
      expect(schema.properties.causeCategories.then).toEqual({ maxItems: 1 });
    }
  });

  it('describes result and per-category confidence in the Schema', () => {
    for (const [reportStatus, resultAssessment] of [
      ['fail', 'true_fail'],
      ['pass', 'true_pass'],
    ] as const) {
      const schema = getReportAnalysisJsonSchema(
        reportStatus,
        resultAssessment,
      ) as {
        properties: Record<
          string,
          {
            description?: string;
            items?: {
              properties?: Record<string, { description?: string }>;
            };
          }
        >;
      };
      expect(schema.properties.confidence.description).toContain(
        'direct corroborated evidence',
      );
      expect(schema.properties.causeCategories.description).toContain(
        'Required cause-category decision',
      );
      expect(schema.properties.causeCategories.description).toContain(
        'unattributed',
      );
      expect(
        schema.properties.causeCategories.items?.properties?.confidence
          .description,
      ).toContain(
        'low for an evidence-grounded possible cause when the report cannot distinguish ownership',
      );
      expect(
        schema.properties.causeCategories.items?.properties?.reason.description,
      ).toContain('joint cause or an alternative possible cause');
    }

    const incompleteSchema = getReportAnalysisJsonSchema('incomplete') as {
      properties: Record<string, { description?: string }>;
    };
    expect(incompleteSchema.properties.confidence.description).toContain(
      'incomplete conclusion may still have high confidence',
    );
    expect(incompleteSchema.properties.causeCategories.description).toContain(
      'each with independent confidence',
    );
    expect(incompleteSchema.properties.causeCategories.description).toContain(
      'alternative possible causes',
    );
  });

  it('generates only the selected failed-result assessment schema', () => {
    for (const resultAssessment of [
      'true_fail',
      'false_fail',
      'unverifiable',
      'inconclusive',
    ] as const) {
      const schema = getReportAnalysisJsonSchema('fail', resultAssessment) as {
        anyOf?: unknown;
        properties: Record<string, Record<string, unknown>>;
        required: string[];
      };
      expect(schema).not.toHaveProperty('anyOf');
      expect(schema.properties.resultAssessment.const).toBe(resultAssessment);
      expect(schema.properties.causeCategories).toMatchObject({
        type: 'array',
        minItems: 1,
        uniqueItems: true,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['category', 'confidence', 'reason'],
          properties: {
            category: { type: 'string' },
            confidence: {
              type: 'string',
              enum: ['high', 'medium', 'low'],
            },
            reason: { type: 'string' },
          },
        },
      });
      expect(schema.required).toContain('causeCategories');
      expect(schema.properties).not.toHaveProperty('rootCauseStatus');

      if (resultAssessment === 'true_fail') {
        expect(schema.properties).toHaveProperty('failureReason');
        expect(schema.properties).toHaveProperty('failedStep');
        expect(schema.required).toContain('failureReason');
        expect(schema.required).toContain('failedStep');
      } else {
        expect(schema.properties).not.toHaveProperty('failureReason');
        expect(schema.properties).not.toHaveProperty('failedStep');
      }
    }

    expect(() => getReportAnalysisJsonSchema('fail')).toThrow(
      'result assessment is required for fail',
    );
    expect(() => getReportAnalysisJsonSchema('pass', 'true_fail')).toThrow(
      'result assessment is required for pass',
    );
    expect(() => getReportAnalysisJsonSchema('pass')).toThrow(
      'result assessment is required for pass',
    );

    const incompleteSchema = getReportAnalysisJsonSchema('incomplete') as {
      anyOf?: unknown;
      properties: Record<string, Record<string, unknown>>;
      required: string[];
    };
    expect(incompleteSchema).not.toHaveProperty('anyOf');
    expect(incompleteSchema.properties).toHaveProperty('observedIssue');
    expect(incompleteSchema.properties).toHaveProperty('interruptionReason');
    expect(incompleteSchema.properties).toHaveProperty('lastRecordedStep');
    expect(incompleteSchema.properties.causeCategories).toMatchObject({
      type: 'array',
      minItems: 1,
      uniqueItems: true,
      items: {
        type: 'object',
        required: ['category', 'confidence', 'reason'],
      },
    });
    expect([...incompleteSchema.required].sort()).toEqual(
      [
        'report',
        'reportStatus',
        'conclusion',
        'observedIssue',
        'interruptionReason',
        'lastRecordedStep',
        'evidence',
        'confidence',
        'limitations',
        'causeCategories',
      ].sort(),
    );
    for (const removedField of [
      'lastTaskStatus',
      'observedIssueStatus',
      'observedIssueConfidence',
      'primaryCategory',
      'interruptionCauseStatus',
      'contributors',
    ]) {
      expect(incompleteSchema.properties).not.toHaveProperty(removedField);
    }
  });

  it('generates only the selected passed-result assessment schema', () => {
    for (const resultAssessment of [
      'true_pass',
      'false_pass',
      'unverifiable',
      'inconclusive',
    ] as const) {
      const schema = getReportAnalysisJsonSchema('pass', resultAssessment) as {
        anyOf?: unknown;
        properties: Record<string, Record<string, unknown>>;
        required: string[];
      };
      expect(schema).not.toHaveProperty('anyOf');
      expect(schema.properties.resultAssessment.const).toBe(resultAssessment);
      expect(schema.properties.causeCategories).toMatchObject({
        type: 'array',
        minItems: 1,
        uniqueItems: true,
        items: {
          type: 'object',
          required: ['category', 'confidence', 'reason'],
        },
      });
      expect(schema.required).toContain('causeCategories');
      expect(schema.properties).not.toHaveProperty('primaryCategory');
      expect(schema.properties).not.toHaveProperty('contributors');
      expect(schema.properties).not.toHaveProperty('issueMechanism');
      expect(schema.properties).not.toHaveProperty('evidenceIssue');

      if (resultAssessment === 'false_pass') {
        expect(schema.properties).toHaveProperty('passClaimIssuePoint');
        expect(schema.required).toContain('passClaimIssuePoint');
      } else {
        expect(schema.properties).not.toHaveProperty('passClaimIssuePoint');
      }
    }
  });

  it('renders every category with the canonical label', () => {
    for (const [category, label] of Object.entries(
      REPORT_ANALYSIS_CATEGORY_LABELS,
    )) {
      const markdown = renderReportAnalysisResult(
        commonPass({
          resultAssessment: 'false_pass',
          resultAssessmentReason:
            'A required condition is contradicted by the report.',
          passClaimIssuePoint: 'The required state remained absent.',
          causeCategories: [causeCategory(category, 'medium')],
        }),
      );
      expect(markdown).toContain('**Cause categories:**');
      expect(markdown).toContain(
        `\`${category}\` (\`medium\` confidence) — ${label}`,
      );
    }
  });

  it('groups the report into readable Markdown sections', () => {
    const markdown = renderReportAnalysisResult(commonFailure());

    expect(markdown).toContain('**Report:** `/absolute/path/report.html`');
    expect(markdown).toContain('**Report status:** `fail`');
    expect(markdown).toContain('**Result assessment:** `true_fail`');
    expect(markdown).toContain('**Result-assessment reason:**');
    expect(markdown).toContain('**Cause categories:**');
    expect(markdown).toContain('**Conclusion:**');
    expect(markdown).toContain('**Failure reason:**');
    expect(markdown).toContain('**Failed step:**');
    expect(markdown).toContain('**Evidence:**');
    expect(markdown).toContain('**Confidence:** `high`');
    expect(markdown).toContain('**Limitations:**');
    expect(markdown).not.toContain('# ');
    expect(markdown).not.toContain('| --- |');
  });

  it.each(['true_fail', 'false_fail', 'unverifiable', 'inconclusive'] as const)(
    'accepts the failed-result assessment %s',
    (resultAssessment) => {
      const markdown = renderReportAnalysisResult(
        failureForAssessment(resultAssessment),
      );
      expect(markdown).toContain(
        `**Result assessment:** \`${resultAssessment}\``,
      );
    },
  );

  it('requires failure details only for a true failure', () => {
    expect(() =>
      renderReportAnalysisResult(
        withoutFields(commonFailure(), 'failureReason'),
      ),
    ).toThrow('result.failureReason must be a non-empty string');

    expect(() =>
      renderReportAnalysisResult(withoutFields(commonFailure(), 'failedStep')),
    ).toThrow('result.failedStep must be a non-empty string');

    for (const resultAssessment of [
      'false_fail',
      'unverifiable',
      'inconclusive',
    ] as const) {
      const result = failureForAssessment(resultAssessment);
      expect(() =>
        renderReportAnalysisResult({
          ...result,
          failureReason: 'This field is valid only for true_fail.',
        }),
      ).toThrow('result must omit field(s): failureReason');
      expect(() =>
        renderReportAnalysisResult({
          ...result,
          failedStep: 'This field is valid only for true_fail.',
        }),
      ).toThrow('result must omit field(s): failedStep');
    }
  });

  it('requires cause categories with independent confidence for every failed-result assessment', () => {
    expect(() =>
      renderReportAnalysisResult(
        withoutFields(commonFailure(), 'causeCategories'),
      ),
    ).toThrow('result.causeCategories must be a non-empty array');

    const multiple = renderReportAnalysisResult(
      commonFailure({
        causeCategories: [
          causeCategory('test_design', 'low'),
          causeCategory('tested_system', 'medium'),
        ],
      }),
    );
    expect(multiple).toContain(
      '`test_design` (`low` confidence) — 测试用例设计问题',
    );
    expect(multiple).toContain(
      '`tested_system` (`medium` confidence) — 被测系统状态与行为异常',
    );

    for (const resultAssessment of [
      'true_fail',
      'false_fail',
      'unverifiable',
      'inconclusive',
    ] as const) {
      expect(() =>
        renderReportAnalysisResult({
          ...failureForAssessment(resultAssessment),
          causeCategories: [
            causeCategory('model_reasoning'),
            causeCategory('tested_system', 'low'),
          ],
        }),
      ).not.toThrow();
    }

    for (const category of Object.keys(REPORT_ANALYSIS_CATEGORY_LABELS)) {
      expect(() =>
        renderReportAnalysisResult(
          commonFailure({ causeCategories: [causeCategory(category)] }),
        ),
      ).not.toThrow();
    }

    expect(() =>
      renderReportAnalysisResult(commonFailure({ causeCategories: [] })),
    ).toThrow('result.causeCategories must be a non-empty array');
    expect(() =>
      renderReportAnalysisResult(
        commonFailure({
          causeCategories: [
            causeCategory('tested_system'),
            causeCategory('tested_system', 'low'),
          ],
        }),
      ),
    ).toThrow(
      'result.causeCategories contains duplicate category: tested_system',
    );
    expect(() =>
      renderReportAnalysisResult(
        commonFailure({
          causeCategories: [causeCategory('unknown_category')],
        }),
      ),
    ).toThrow('result.causeCategories[0].category must be one of');
    expect(() =>
      renderReportAnalysisResult(
        commonFailure({ causeCategories: ['tested_system'] }),
      ),
    ).toThrow('result.causeCategories[0] must be an object');
    expect(() =>
      renderReportAnalysisResult(
        commonFailure({ causeCategories: [{ category: 'tested_system' }] }),
      ),
    ).toThrow(
      'result.causeCategories[0].confidence must be a non-empty string',
    );
    expect(() =>
      renderReportAnalysisResult(
        commonFailure({
          causeCategories: [{ category: 'tested_system', confidence: 'high' }],
        }),
      ),
    ).toThrow('result.causeCategories[0].reason must be a non-empty string');
    expect(() =>
      renderReportAnalysisResult(
        commonFailure({ causeCategories: 'tested_system' }),
      ),
    ).toThrow('result.causeCategories must be a non-empty array');
  });

  it.each([
    ['rootCauseStatus', 'identified'],
    ['rootCausePoint', 'The required state did not appear.'],
    ['primaryCategory', 'tested_system'],
    ['failureMechanism', 'The application did not update.'],
    ['evidenceIssue', 'The decisive record is missing.'],
    ['plausibleCategories', ['test_design', 'tested_system']],
    [
      'contributors',
      [
        {
          category: 'tested_system',
          mechanism: 'Not part of the simplified failed-result contract.',
          evidence: commonFailure().evidence,
        },
      ],
    ],
  ])('rejects the removed failed-result field %s', (field, value) => {
    expect(() =>
      renderReportAnalysisResult({
        ...commonFailure(),
        [field]: value,
      }),
    ).toThrow(`result contains unsupported field(s): ${field}`);
  });

  it('requires every failed-report analysis to assess result correctness', () => {
    const result = withoutFields(commonFailure(), 'resultAssessment');
    expect(() => renderReportAnalysisResult(result)).toThrow(
      'result.resultAssessment must be a non-empty string',
    );

    const withoutReason = withoutFields(
      commonFailure(),
      'resultAssessmentReason',
    );
    expect(() => renderReportAnalysisResult(withoutReason)).toThrow(
      'result.resultAssessmentReason must be a non-empty string',
    );
  });

  it('rejects an unsupported failed-result assessment', () => {
    expect(() =>
      renderReportAnalysisResult(
        commonFailure({ resultAssessment: 'false_negative' }),
      ),
    ).toThrow('result.resultAssessment must be one of');
  });

  it.each(['true_pass', 'false_pass'])(
    'rejects passed-result assessment %s on a failed report',
    (resultAssessment) => {
      expect(() =>
        renderReportAnalysisResult(commonFailure({ resultAssessment })),
      ).toThrow('result.resultAssessment must be one of');
    },
  );

  it('validates every passed-result assessment shape', () => {
    for (const resultAssessment of [
      'true_pass',
      'false_pass',
      'unverifiable',
      'inconclusive',
    ] as const) {
      expect(() =>
        renderReportAnalysisResult(passForAssessment(resultAssessment)),
      ).not.toThrow();
    }
  });

  it('requires a pass-claim issue point only for a false pass', () => {
    expect(() =>
      renderReportAnalysisResult(
        withoutFields(passForAssessment('false_pass'), 'passClaimIssuePoint'),
      ),
    ).toThrow('result.passClaimIssuePoint must be a non-empty string');

    for (const resultAssessment of [
      'true_pass',
      'unverifiable',
      'inconclusive',
    ] as const) {
      expect(() =>
        renderReportAnalysisResult({
          ...passForAssessment(resultAssessment),
          passClaimIssuePoint: 'This field is valid only for false_pass.',
        }),
      ).toThrow('result must omit field(s): passClaimIssuePoint');
    }
  });

  it('requires cause categories with independent confidence for every passed-result assessment', () => {
    expect(() =>
      renderReportAnalysisResult(
        withoutFields(commonPass(), 'causeCategories'),
      ),
    ).toThrow('result.causeCategories must be a non-empty array');

    for (const resultAssessment of [
      'true_pass',
      'false_pass',
      'unverifiable',
      'inconclusive',
    ] as const) {
      expect(() =>
        renderReportAnalysisResult({
          ...passForAssessment(resultAssessment),
          causeCategories: [
            causeCategory('model_reasoning', 'high'),
            causeCategory('tested_system', 'low'),
          ],
        }),
      ).not.toThrow();
    }

    expect(() =>
      renderReportAnalysisResult(commonPass({ causeCategories: [] })),
    ).toThrow('result.causeCategories must be a non-empty array');
    expect(() =>
      renderReportAnalysisResult(
        commonPass({
          causeCategories: [
            causeCategory('tested_system'),
            causeCategory('tested_system', 'medium'),
          ],
        }),
      ),
    ).toThrow(
      'result.causeCategories contains duplicate category: tested_system',
    );
    expect(() =>
      renderReportAnalysisResult(
        commonPass({
          causeCategories: [causeCategory('unknown_category')],
        }),
      ),
    ).toThrow('result.causeCategories[0].category must be one of');
  });

  it.each([
    ['primaryCategory', 'model_reasoning'],
    ['issueMechanism', 'The pass claim ignored the visible state.'],
    ['evidenceIssue', 'The decisive record is missing.'],
    [
      'contributors',
      [
        {
          category: 'model_reasoning',
          mechanism: 'Not part of the simplified passed-result contract.',
          evidence: commonPass().evidence,
        },
      ],
    ],
  ])('rejects the removed passed-result field %s', (field, value) => {
    expect(() =>
      renderReportAnalysisResult({
        ...passForAssessment('false_pass'),
        [field]: value,
      }),
    ).toThrow(`result contains unsupported field(s): ${field}`);
  });

  it('requires every passed-report analysis to explain its assessment', () => {
    const withoutAssessment = withoutFields(commonPass(), 'resultAssessment');
    expect(() => renderReportAnalysisResult(withoutAssessment)).toThrow(
      'result.resultAssessment must be a non-empty string',
    );

    const withoutReason = withoutFields(commonPass(), 'resultAssessmentReason');
    expect(() => renderReportAnalysisResult(withoutReason)).toThrow(
      'result.resultAssessmentReason must be a non-empty string',
    );
  });

  it.each(['true_fail', 'false_fail'])(
    'rejects failed-result assessment %s on a passed report',
    (resultAssessment) => {
      expect(() =>
        renderReportAnalysisResult(commonPass({ resultAssessment })),
      ).toThrow('result.resultAssessment must be one of');
    },
  );

  it('rejects legacy verdict fields', () => {
    const legacyPass = withoutFields(commonPass(), 'resultAssessment');
    expect(() =>
      renderReportAnalysisResult({
        ...legacyPass,
        passVerdict: 'substantiated',
      }),
    ).toThrow('unsupported field(s): passVerdict');

    const legacyFailure = withoutFields(
      commonFailure(),
      'resultAssessment',
      'resultAssessmentReason',
    );
    expect(() =>
      renderReportAnalysisResult({
        ...legacyFailure,
        failureVerdict: 'false_negative',
        failureVerdictReason: 'Legacy terminology.',
      }),
    ).toThrow('unsupported field(s): failureVerdict, failureVerdictReason');
  });

  it.each(['passed', 'failed', 'unknown'])(
    'rejects the legacy report status %s',
    (reportStatus) => {
      expect(() =>
        renderReportAnalysisResult({ ...commonPass(), reportStatus }),
      ).toThrow('result.reportStatus must be one of: fail, pass, incomplete');
    },
  );

  it.each(['unknownReason', 'incompleteReason'])(
    'rejects the legacy %s field',
    (field) => {
      expect(() =>
        renderReportAnalysisResult({
          ...commonIncomplete(),
          [field]: 'incomplete',
        }),
      ).toThrow(`unsupported field(s): ${field}`);
    },
  );

  it('renders the observed issue and interruption reason independently', () => {
    const markdown = renderReportAnalysisResult(commonIncomplete());

    expect(markdown).toContain('**Report status:** `incomplete`');
    expect(markdown).toContain('**Last recorded step:**');
    expect(markdown).toContain('**Observed issue:**');
    expect(markdown).toContain('**Interruption reason:**');
    expect(markdown).toContain('**Cause categories:**');
    expect(markdown).toContain(
      '`model_reasoning` (`high` confidence) — 模型理解与决策问题',
    );
    expect(markdown).toContain('**Confidence:** `high`');
    expect(markdown).not.toContain('Last task status');
    expect(markdown).not.toContain('Observed-issue status');
    expect(markdown).not.toContain('Interruption-cause status');
  });

  it.each(['observedIssue', 'interruptionReason', 'lastRecordedStep'] as const)(
    'requires the incomplete-result field %s',
    (field) => {
      expect(() =>
        renderReportAnalysisResult(withoutFields(commonIncomplete(), field)),
      ).toThrow(`result.${field} must be a non-empty string`);
    },
  );

  it('requires cause categories with independent confidence for incomplete results', () => {
    expect(() =>
      renderReportAnalysisResult(
        withoutFields(commonIncomplete(), 'causeCategories'),
      ),
    ).toThrow('result.causeCategories must be a non-empty array');
    expect(() =>
      renderReportAnalysisResult({
        ...commonIncomplete(),
        causeCategories: [
          causeCategory('tested_system', 'medium'),
          causeCategory('model_reasoning', 'low'),
        ],
      }),
    ).not.toThrow();
    expect(() =>
      renderReportAnalysisResult(commonIncomplete({ causeCategories: [] })),
    ).toThrow('result.causeCategories must be a non-empty array');
    expect(() =>
      renderReportAnalysisResult(
        commonIncomplete({
          causeCategories: [
            causeCategory('model_reasoning'),
            causeCategory('model_reasoning', 'low'),
          ],
        }),
      ),
    ).toThrow(
      'result.causeCategories contains duplicate category: model_reasoning',
    );
    expect(() =>
      renderReportAnalysisResult(
        commonIncomplete({
          causeCategories: [causeCategory('unknown_category')],
        }),
      ),
    ).toThrow('result.causeCategories[0].category must be one of');
  });

  it('accepts unattributed only as the sole cause-category entry', () => {
    const markdown = renderReportAnalysisResult(
      commonFailure({
        causeCategories: [
          causeCategory(
            'unattributed',
            'high',
            'The report does not distinguish test data, permissions, or application behavior.',
          ),
        ],
      }),
    );
    expect(markdown).toContain(
      '`unattributed` (`high` confidence) — 报告证据无法支持具体归因',
    );

    expect(() =>
      renderReportAnalysisResult(
        commonFailure({
          causeCategories: [
            causeCategory('unattributed'),
            causeCategory('tested_system'),
          ],
        }),
      ),
    ).toThrow('result.causeCategories must use unattributed as the sole entry');
  });

  it.each([
    ['lastTaskStatus', 'running'],
    ['observedIssueStatus', 'identified'],
    ['observedIssueConfidence', 'high'],
    ['primaryCategory', 'model_reasoning'],
    ['interruptionCauseStatus', 'inconclusive'],
    [
      'contributors',
      [
        {
          category: 'model_reasoning',
          mechanism: 'Removed from the simplified incomplete contract.',
          evidence: commonIncomplete().evidence,
        },
      ],
    ],
  ])('rejects the removed incomplete-result field %s', (field, value) => {
    expect(() =>
      renderReportAnalysisResult({
        ...commonIncomplete(),
        [field]: value,
      }),
    ).toThrow(`result contains unsupported field(s): ${field}`);
  });

  it('writes Markdown beside the analysis-result JSON by default', () => {
    const directory = mkdtempSync(
      join(tmpdir(), 'midscene-analysis-markdown-'),
    );
    temporaryDirectories.push(directory);
    const resultPath = join(directory, 'analysis-result.json');
    writeFileSync(resultPath, JSON.stringify(commonFailure()), 'utf8');

    const outputPath = renderReportAnalysisResultMarkdownFile(resultPath);

    expect(outputPath).toBe(join(directory, 'analysis-result.md'));
    expect(readFileSync(outputPath, 'utf8')).toContain(
      '**Report status:** `fail`',
    );
  });

  it('renders only a real absolute file or HTTP(S) URL as screenshot evidence', () => {
    const directory = mkdtempSync(join(tmpdir(), 'midscene-analysis-result-'));
    temporaryDirectories.push(directory);
    const screenshot = join(directory, 'evidence.png');
    writeFileSync(screenshot, 'image');

    const valid = commonFailure({
      evidence: [{ source: 'screenshot', fact: 'Visible state.', screenshot }],
    });
    expect(renderReportAnalysisResult(valid)).toContain(
      `![Screenshot evidence](<${screenshot}>)`,
    );
    expect(renderReportAnalysisResult(valid)).toContain('**Screenshot:**');

    const invalid = commonFailure({
      evidence: [
        {
          source: 'screenshot',
          fact: 'Visible state.',
          screenshot: './evidence.png',
        },
      ],
    });
    expect(() => renderReportAnalysisResult(invalid)).toThrow(
      'must be an absolute local path or an HTTP(S) URL',
    );
  });
});
