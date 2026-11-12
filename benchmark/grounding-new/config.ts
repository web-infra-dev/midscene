import { MODEL_FAMILY_VALUES } from '@midscene/shared/env';
import { z } from 'zod';

const tokenPrices = {
  basis: z.string().min(1),
  inputPerToken: z.number().nonnegative(),
  outputPerToken: z.number().nonnegative(),
};

const referenceSchema = z.strictObject({
  source: z.string().min(1),
  url: z.url(),
  observedAt: z.string().min(1),
  note: z.string().optional(),
  pricing: z.discriminatedUnion('currency', [
    z.strictObject({ currency: z.literal('USD'), ...tokenPrices }),
    z.strictObject({
      currency: z.literal('CNY'),
      ...tokenPrices,
      usdExchangeRate: z.strictObject({
        source: z.string().min(1),
        url: z.url(),
        quotedAt: z.string().min(1),
        cnyPerUsd: z.number().positive(),
      }),
    }),
  ]),
  performance: z
    .discriminatedUnion('basis', [
      z.strictObject({
        basis: z.literal('best-response-latency'),
        percentile: z.literal('p50'),
        responseLatencyMs: z.number().nonnegative(),
        observedAt: z.string().optional(),
      }),
      z.strictObject({
        basis: z.enum(['best-per-metric', 'mixed-source', 'window-mean']),
        timeToFirstTokenMs: z.number().nonnegative(),
        outputTokensPerSecond: z.number().positive(),
        percentile: z.literal('p50').optional(),
        url: z.url().optional(),
        observedAt: z.string().optional(),
        conditions: z.string().optional(),
        timeToFirstTokenUrl: z.url().optional(),
      }),
    ])
    .nullable()
    .optional(),
});

const familySchema = z.strictObject({
  color: z.string().min(1),
  logo: z.url().optional(),
});

export const evaluationConfigSchema = z
  .strictObject({
    models: z
      .array(
        z.strictObject({
          baseUrl: z.url(),
          apiKey: z.string().trim().min(1),
          family: z.enum(MODEL_FAMILY_VALUES),
          name: z.string().trim().min(1),
          displayName: z.string().trim().min(1).optional(),
          displayFamily: z.string().trim().min(1),
          protocol: z.enum(['openai-chat', 'openai-responses']).optional(),
          reasoningEnabled: z.boolean().optional(),
          reference: referenceSchema.optional(),
        }),
      )
      .min(1),
    families: z.object({ Other: familySchema }).catchall(familySchema),
  })
  .superRefine(({ models, families }, context) => {
    models.forEach((model, index) => {
      if (!Object.hasOwn(families, model.displayFamily)) {
        context.addIssue({
          code: 'custom',
          path: ['models', index, 'displayFamily'],
          message: `Family ${model.displayFamily} is not configured in families`,
        });
      }
    });
  });

export type ViewerConfig = {
  models: Pick<
    z.infer<typeof evaluationConfigSchema>['models'][number],
    'name' | 'displayName' | 'displayFamily' | 'reference'
  >[];
  families: Record<string, z.infer<typeof familySchema>>;
};
