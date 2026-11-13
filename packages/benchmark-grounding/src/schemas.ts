import { MODEL_FAMILY_VALUES } from '@midscene/shared/env';
import { z } from 'zod';
import type { calculateSummary } from './summary';

const text = z.string().min(1);
const finite = z.number().finite();
const nonnegative = finite.nonnegative();
export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
export const testcaseNameSchema = text.refine(
  (name) => name !== '.' && name !== '..' && !/[\\/\0]/.test(name),
  'Expected a single directory name',
);
const groundTruthSchema = z.union([
  z.tuple([nonnegative, nonnegative, nonnegative, nonnegative]),
  z.literal('REFUSAL'),
]);

export const testcaseSchema = z
  .object({
    schemaVersion: z.literal(1),
    name: testcaseNameSchema,
    platform: z.enum(['web', 'mobile']),
    category: z.object({ item: text, reason: z.string() }).strict(),
    instruction: z.object({ en: text, zh: text }).strict(),
    instructionLanguage: z.enum(['en', 'zh']),
    groundTruth: groundTruthSchema,
    reference: z
      .object({
        url: z.union([z.string().url(), z.literal('')]),
        dataset: z.string(),
        recordId: z.string(),
        image: z
          .object({ format: z.enum(['png', 'jpeg']), sha256: sha256Schema })
          .strict(),
        patch: z.string().nullable(),
        collectedAt: nonnegative,
      })
      .strict(),
  })
  .strict();

export type Testcase = z.infer<typeof testcaseSchema>;
export type LoadedTestcase = {
  testcase: Testcase;
  testcaseSha256: string;
  files: Record<string, Buffer>;
};

export const modelCallConfigSchema = z
  .object({
    baseUrl: text.url(),
    apiKey: text,
    name: text,
    family: z.custom<(typeof MODEL_FAMILY_VALUES)[number]>(
      (value) =>
        typeof value === 'string' &&
        MODEL_FAMILY_VALUES.includes(
          value as (typeof MODEL_FAMILY_VALUES)[number],
        ),
      'Unsupported Midscene model family',
    ),
    displayName: text.optional(),
    protocol: z.enum(['openai-chat', 'openai-responses']).optional(),
    reasoningEnabled: z.union([z.boolean(), z.literal('default')]).optional(),
  })
  .strict();
export type ModelCallConfig = z.infer<typeof modelCallConfigSchema>;

const prices = {
  inputPerToken: nonnegative,
  outputPerToken: nonnegative,
};
const pricingSchema = z.discriminatedUnion('currency', [
  z.object({ currency: z.literal('USD'), ...prices }).strict(),
  z
    .object({
      currency: z.literal('CNY'),
      ...prices,
      usdExchangeRate: z
        .object({
          source: text,
          url: text.url(),
          quotedAt: text,
          cnyPerUsd: finite.positive(),
        })
        .strict(),
    })
    .strict(),
]);
const performanceSchema = z.discriminatedUnion('basis', [
  z
    .object({
      basis: z.literal('best-response-latency'),
      percentile: z.literal('p50'),
      responseLatencyMs: nonnegative,
      observedAt: text.optional(),
    })
    .strict(),
  z
    .object({
      basis: z.enum(['best-per-metric', 'mixed-source', 'window-mean']),
      percentile: z.literal('p50').optional(),
      timeToFirstTokenMs: nonnegative,
      outputTokensPerSecond: finite.positive(),
      url: text.url().optional(),
      observedAt: text.optional(),
      conditions: text.optional(),
      timeToFirstTokenUrl: text.url().optional(),
    })
    .strict(),
]);
export const reportMetaSchema = z
  .object({
    models: z
      .record(
        z
          .object({
            displayFamily: text.optional(),
            reference: z
              .object({
                source: text,
                url: text.url(),
                observedAt: text,
                note: z.string().optional(),
                pricing: pricingSchema.optional(),
                performance: performanceSchema.nullable().optional(),
              })
              .strict()
              .optional(),
          })
          .strict(),
      )
      .optional(),
    families: z
      .record(
        z
          .object({
            color: text.refine(
              (value) => !/url\s*\(/i.test(value),
              'Color must not reference an external resource',
            ),
            logo: text.optional(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();
export type ReportMeta = z.infer<typeof reportMetaSchema>;

export const profileSchema = z
  .object({
    durationMs: nonnegative,
    usageStatus: z.enum(['complete', 'partial', 'missing']),
    calls: nonnegative.int().optional(),
    totalPromptTokens: nonnegative.optional(),
    totalCompletionTokens: nonnegative.optional(),
    totalTokens: nonnegative.optional(),
    totalCachedInput: nonnegative.optional(),
    totalTimeCostMs: nonnegative.optional(),
    usageNote: text.optional(),
  })
  .strict();
export type Profile = z.infer<typeof profileSchema>;

export const outputSchema = z
  .object({
    type: z.enum(['POINT', 'REFUSAL', 'ERROR']),
    correct: z.boolean(),
    center: z.tuple([finite, finite]).optional(),
    rect: z
      .object({
        left: finite,
        top: finite,
        width: nonnegative,
        height: nonnegative,
      })
      .strict()
      .optional(),
    dpr: finite.positive().optional(),
    error: z
      .object({
        name: text,
        message: text,
        code: text.optional(),
        retryable: z.boolean(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((output, context) => {
    if (output.type === 'POINT' && !output.center)
      context.addIssue({ code: 'custom', message: 'POINT requires a center' });
    if (output.type === 'ERROR' && (!output.error || output.correct))
      context.addIssue({
        code: 'custom',
        message: 'ERROR requires an error and must be incorrect',
      });
  });
export const attemptResultSchema = z
  .object({ output: outputSchema, profiling: profileSchema })
  .strict();
export type AttemptResult = z.infer<typeof attemptResultSchema>;
export const resultSchema = z
  .object({
    schemaVersion: z.literal(1),
    consistency: z.object({ testcaseSha256: sha256Schema }).strict(),
    input: z
      .object({
        testcase: testcaseNameSchema,
        model: text,
        family: text,
        displayName: text,
        platform: z.enum(['web', 'mobile']),
        instruction: text,
        groundTruth: groundTruthSchema,
      })
      .strict(),
    output: outputSchema,
    profiling: profileSchema,
    attempts: z.array(attemptResultSchema).min(1),
  })
  .strict();
export type Result = z.infer<typeof resultSchema>;

export const runSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: text,
    startedAt: text,
    endedAt: text.optional(),
    status: z.enum(['running', 'completed', 'interrupted']),
    planned: nonnegative.int(),
    completed: nonnegative.int(),
    versions: z.object({ package: text, sdk: text }).strict(),
    options: z
      .object({
        concurrency: finite.int().positive(),
        retries: nonnegative.int(),
        timeoutMs: finite.positive(),
      })
      .strict(),
    models: z
      .array(
        z
          .object({
            name: text,
            family: text,
            displayName: text,
            directory: testcaseNameSchema,
            protocol: z.enum(['openai-chat', 'openai-responses']).optional(),
            reasoningEnabled: z
              .union([z.boolean(), z.literal('default')])
              .optional(),
          })
          .strict(),
      )
      .min(1),
    testcases: z
      .array(
        z
          .object({ name: testcaseNameSchema, testcaseSha256: sha256Schema })
          .strict(),
      )
      .min(1),
    tasks: z
      .array(z.object({ model: text, testcase: testcaseNameSchema }).strict())
      .min(1),
  })
  .strict();
export type RunManifest = z.infer<typeof runSchema>;

// The statistical contract is shared by runner, reporter and the browser UI.
export type RunSummary = ReturnType<typeof calculateSummary>;
