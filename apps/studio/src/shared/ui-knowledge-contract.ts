import type { IModelConfig } from '@midscene/shared/env';
import { z } from 'zod/v4';

export const SESSION_EVIDENCE_SCHEMA_VERSION = 'session-evidence/v1' as const;
export const UI_KNOWLEDGE_SCHEMA_VERSION = 'ui-knowledge/v1' as const;
export const UI_KNOWLEDGE_PROMPT_VERSION =
  'ui-knowledge-generation/v11' as const;

export const PRODUCT_CAPABILITY_TYPES = [
  'browse',
  'navigate',
  'search',
  'filter',
  'sort',
  'select',
  'data-entry',
  'submit',
  'create',
  'update',
  'delete',
  'upload',
  'download',
  'authenticate',
  'other',
] as const;

export const VISIBLE_EFFECT_TYPES = [
  'reveal-content',
  'hide-content',
  'open-overlay',
  'close-overlay',
  'update-content',
  'change-selection',
  'show-feedback',
  'load-more',
] as const;

export const EVIDENCE_FRAME_ROLES = [
  'before',
  'after',
  'target-marked-before',
] as const;

export const MVP_KNOWLEDGE_INPUT_BUDGET = {
  maxImageLongEdge: 1280,
  maxTextChars: 100_000,
} as const;

const nonEmptyStringSchema = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0, {
    message: 'Value must contain non-whitespace characters.',
  });
const finiteNumberSchema = z.number().finite();
const nonNegativeNumberSchema = finiteNumberSchema.nonnegative();
const positiveIntegerSchema = z.number().int().positive();
const eventTypeSchema = z.enum([
  'click',
  'drag',
  'scroll',
  'input',
  'navigation',
  'setViewport',
  'keydown',
]);

export const evidenceRefSchema = z
  .object({
    eventHashId: nonEmptyStringSchema,
    frameRole: z.enum(EVIDENCE_FRAME_ROLES),
    assetId: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict();

export const screenshotAssetSchema = z
  .object({
    assetId: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    originalWidth: positiveIntegerSchema,
    originalHeight: positiveIntegerSchema,
    requestWidth: positiveIntegerSchema,
    requestHeight: positiveIntegerSchema,
    encodedBytes: positiveIntegerSchema,
    requestChars: positiveIntegerSchema,
    dataUrl: nonEmptyStringSchema,
  })
  .strict()
  .superRefine((asset, context) => {
    if (!asset.dataUrl.startsWith(`data:${asset.mimeType};base64,`)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dataUrl'],
        message: 'dataUrl MIME type must match mimeType.',
      });
    }
    if (asset.dataUrl.length !== asset.requestChars) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['requestChars'],
        message: 'requestChars must equal dataUrl.length.',
      });
    }
  });

const knowledgeSafeKeySchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('control'),
      value: z.enum([
        'Enter',
        'Escape',
        'Tab',
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'Backspace',
        'Delete',
        'Home',
        'End',
        'PageUp',
        'PageDown',
        'Space',
      ]),
    })
    .strict(),
  z
    .object({
      kind: z.literal('shortcut'),
      value: z.string().regex(/^[A-Za-z0-9]$/),
    })
    .strict(),
  z.object({ kind: z.literal('redacted') }).strict(),
]);

const recordedActionObservedParamsBaseSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('point'),
      durationMs: nonNegativeNumberSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('drag'),
      deltaX: finiteNumberSchema.optional(),
      deltaY: finiteNumberSchema.optional(),
      durationMs: nonNegativeNumberSchema.optional(),
      repeat: positiveIntegerSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('input'),
      mode: z.enum(['replace', 'clear', 'typeOnly']),
      valueRedacted: z.literal(true),
      hasValue: z.boolean(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('scroll'),
      scrollType: z.enum([
        'singleAction',
        'scrollToBottom',
        'scrollToTop',
        'scrollToRight',
        'scrollToLeft',
      ]),
      direction: z.enum(['up', 'down', 'left', 'right']),
      distance: nonNegativeNumberSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('keydown'),
      modifiers: z.array(z.enum(['Control', 'Meta', 'Alt', 'Shift'])).max(4),
      key: knowledgeSafeKeySchema,
    })
    .strict(),
  z.object({ kind: z.literal('navigation') }).strict(),
]);

export const recordedActionObservedParamsSchema =
  recordedActionObservedParamsBaseSchema.superRefine((params, context) => {
    if (
      params.kind === 'drag' &&
      (params.deltaX === undefined) !== (params.deltaY === undefined)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'deltaX and deltaY must be provided together.',
      });
    }
  });

export const recordedActionEvidenceSchema = z
  .object({
    name: nonEmptyStringSchema,
    eventType: eventTypeSchema,
    observedParams: recordedActionObservedParamsSchema,
  })
  .strict();

export const recordedActionRefSchema = recordedActionEvidenceSchema.extend({
  eventHashId: nonEmptyStringSchema,
});

const elementRectSchema = z
  .object({
    left: finiteNumberSchema.optional(),
    top: finiteNumberSchema.optional(),
    width: nonNegativeNumberSchema.optional(),
    height: nonNegativeNumberSchema.optional(),
    x: finiteNumberSchema.optional(),
    y: finiteNumberSchema.optional(),
  })
  .strict();

const evidenceTargetSchema = z
  .object({
    x: finiteNumberSchema.optional(),
    y: finiteNumberSchema.optional(),
    endX: finiteNumberSchema.optional(),
    endY: finiteNumberSchema.optional(),
    elementRect: elementRectSchema.optional(),
  })
  .strict()
  .superRefine((target, context) => {
    if ((target.x === undefined) !== (target.y === undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'x and y must be provided together.',
      });
    }
    if ((target.endX === undefined) !== (target.endY === undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'endX and endY must be provided together.',
      });
    }
  });

const semanticProvenanceSchema = z
  .object({
    source: z.enum(['aiDescribe', 'recorderAI', 'heuristic']),
    status: z.enum(['pending', 'ready', 'failed']),
    confidence: z.enum(['high', 'medium', 'low']).optional(),
  })
  .strict();

const semanticEvidenceSchema = semanticProvenanceSchema
  .extend({
    elementDescription: nonEmptyStringSchema.optional(),
    aiDescribe: z
      .object({
        verifyPrompt: z.boolean(),
        verifyPassed: z.boolean().optional(),
        deepLocate: z.boolean().optional(),
        centerDistance: nonNegativeNumberSchema.optional(),
      })
      .strict()
      .optional(),
    fallbackFrom: semanticProvenanceSchema.optional(),
  })
  .strict();

const evidenceEventBaseShape = {
  eventHashId: nonEmptyStringSchema,
  mergedEventHashIds: z.array(nonEmptyStringSchema),
  sequence: z.number().int().nonnegative(),
  timestamp: finiteNumberSchema,
  target: evidenceTargetSchema.optional(),
  page: z
    .object({
      url: nonEmptyStringSchema.optional(),
      title: nonEmptyStringSchema.optional(),
      width: positiveIntegerSchema,
      height: positiveIntegerSchema,
    })
    .strict(),
  semantic: semanticEvidenceSchema.optional(),
  evidenceRefs: z.array(evidenceRefSchema).min(1).max(2),
};

const initialStateEvidenceUnitSchema = z
  .object({
    ...evidenceEventBaseShape,
    knowledgeRole: z.literal('initial-state'),
  })
  .strict();

const userActionEvidenceUnitSchema = z
  .object({
    ...evidenceEventBaseShape,
    knowledgeRole: z.literal('user-action'),
    action: recordedActionEvidenceSchema,
    frameComparison: z
      .object({
        algorithm: z.literal('normalized-byte-sha256/v1'),
        result: z.enum(['identical', 'non-identical', 'unavailable']),
      })
      .strict(),
    observedNavigation: z
      .object({
        navigationEventHashId: nonEmptyStringSchema,
        beforeUrl: nonEmptyStringSchema.optional(),
        afterUrl: nonEmptyStringSchema.optional(),
        title: nonEmptyStringSchema.optional(),
        pageInfo: z
          .object({
            width: positiveIntegerSchema,
            height: positiveIntegerSchema,
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const eventEvidenceUnitSchema = z.discriminatedUnion('knowledgeRole', [
  initialStateEvidenceUnitSchema,
  userActionEvidenceUnitSchema,
]);

const eventPageSnapshotSchema = z
  .object({
    beforePage: z
      .string()
      .describe(
        '操作前截图对应的页面功能名称；没有操作前截图时必须输出空字符串。',
      ),
    beforeComponents: z
      .array(
        z.string().describe('操作前页面中的一个可见区域或组件及其可见内容。'),
      )
      .describe(
        '操作前页面的完整可见组件列表；每项使用“方位或区域：组件及可见内容”，没有操作前截图时输出空数组。',
      ),
    afterPage: z
      .string()
      .describe(
        '操作后截图对应的页面功能名称；没有操作后截图时必须输出空字符串。',
      ),
    afterComponents: z
      .array(
        z.string().describe('操作后页面中的一个可见区域或组件及其可见内容。'),
      )
      .describe(
        '操作后页面的完整可见组件列表；每项使用“方位或区域：组件及可见内容”，没有操作后截图时输出空数组。',
      ),
    change: z
      .string()
      .describe(
        '用一句完整自然语言描述“对什么组件执行了什么操作，页面发生了什么可见变化”；没有可确认变化时明确说明未观察到变化。',
      ),
  })
  .strict()
  .describe('单个录制 Action 的操作前页面、操作后页面和可见变化总结。');

export const eventVisualObservationDraftSchema = eventPageSnapshotSchema;

export const EVENT_VISUAL_OBSERVATION_DRAFT_JSON_SCHEMA = z.toJSONSchema(
  eventVisualObservationDraftSchema,
  {
    target: 'draft-2020-12',
    io: 'output',
    reused: 'ref',
  },
);

export const uiKnowledgeInputStatsSchema = z
  .object({
    eligibleEventCount: z.number().int().nonnegative(),
    userActionCount: z.number().int().nonnegative(),
    imageReferenceCount: z.number().int().nonnegative(),
    uniqueImageCount: z.number().int().nonnegative(),
    totalImageEncodedBytes: z.number().int().nonnegative(),
    totalImageDataUrlChars: z.number().int().nonnegative(),
    textChars: z.number().int().nonnegative(),
  })
  .strict();

export const sessionEvidenceBundleSchema = z
  .object({
    schemaVersion: z.literal(SESSION_EVIDENCE_SCHEMA_VERSION),
    session: z
      .object({
        sessionId: nonEmptyStringSchema,
        platformId: nonEmptyStringSchema,
        createdAt: finiteNumberSchema,
        startedAt: finiteNumberSchema.optional(),
        endedAt: finiteNumberSchema.optional(),
      })
      .strict(),
    events: z.array(eventEvidenceUnitSchema).min(1),
    assets: z.array(screenshotAssetSchema),
    inputStats: uiKnowledgeInputStatsSchema,
  })
  .strict();

export const uiKnowledgeDraftSchema = z
  .object({
    contents: z
      .array(
        z
          .unknown()
          .describe('描述一个“页面方位 + 区域 + 组件”的自然语言字符串。'),
      )
      .describe(
        '页面内容知识列表；综合所有 Action 的前后页面组件并合并重复内容，每项应为自然语言字符串。',
      ),
    interactions: z
      .array(
        z
          .unknown()
          .describe(
            '同一页面内的可复用交互对象，只包含从 1 开始的 eventIndex 和自然语言 description。',
          ),
      )
      .describe(
        '同页交互知识列表；description 必须表达“目标组件 + 交互方式 + 组件变化”。',
      ),
    navigations: z
      .array(
        z
          .unknown()
          .describe(
            '跨页面交互对象，只包含从 1 开始的 eventIndex 和自然语言 description。',
          ),
      )
      .describe(
        '跨页面知识列表；description 必须表达“目标组件 + 交互方式 + 目标页面”。',
      ),
  })
  .passthrough()
  .describe(
    '由全部逐 Action 观察合成的知识草稿；模型只负责三个知识数组，其他协议字段由代码补充。',
  );

export const UI_KNOWLEDGE_DRAFT_JSON_SCHEMA = z.toJSONSchema(
  uiKnowledgeDraftSchema,
  {
    target: 'draft-2020-12',
    io: 'output',
    reused: 'ref',
  },
);

export interface UIKnowledgeDraftAction {
  eventIndex: number;
  description: string;
}

export interface UIKnowledgeDraft {
  contents: string[];
  interactions: UIKnowledgeDraftAction[];
  navigations: UIKnowledgeDraftAction[];
}

const enrichedKnowledgeContentSchema = z
  .object({
    description: nonEmptyStringSchema,
    evidenceRefs: z.array(evidenceRefSchema),
  })
  .strict();

const enrichedKnowledgeActionSchema = z
  .object({
    eventIndex: z.number().int().positive(),
    description: nonEmptyStringSchema,
    sourceAction: recordedActionRefSchema,
    evidenceRefs: z.array(evidenceRefSchema),
    primaryProductCapabilityType: z.enum(PRODUCT_CAPABILITY_TYPES),
    primaryEffectType: z.enum(VISIBLE_EFFECT_TYPES),
  })
  .strict();

export const uiKnowledgeSchema = z
  .object({
    schemaVersion: z.literal(UI_KNOWLEDGE_SCHEMA_VERSION),
    sessionId: nonEmptyStringSchema,
    contents: z.array(enrichedKnowledgeContentSchema),
    interactions: z.array(enrichedKnowledgeActionSchema),
    navigations: z.array(enrichedKnowledgeActionSchema),
  })
  .strict();

export type EvidenceFrameRole = (typeof EVIDENCE_FRAME_ROLES)[number];
export type ProductCapabilityType = (typeof PRODUCT_CAPABILITY_TYPES)[number];
export type VisibleEffectType = (typeof VISIBLE_EFFECT_TYPES)[number];
export type EvidenceRef = z.infer<typeof evidenceRefSchema>;
export type ScreenshotAsset = z.infer<typeof screenshotAssetSchema>;
export type KnowledgeSafeKey = z.infer<typeof knowledgeSafeKeySchema>;
export type RecordedActionObservedParams = z.infer<
  typeof recordedActionObservedParamsSchema
>;
export type RecordedActionEvidence = z.infer<
  typeof recordedActionEvidenceSchema
>;
export type RecordedActionRef = z.infer<typeof recordedActionRefSchema>;
export type EventEvidenceUnit = z.infer<typeof eventEvidenceUnitSchema>;
export type EventVisualObservationDraft = z.infer<
  typeof eventVisualObservationDraftSchema
>;
export type UIKnowledgeInputStats = z.infer<typeof uiKnowledgeInputStatsSchema>;
export type SessionEvidenceBundle = z.infer<typeof sessionEvidenceBundleSchema>;
export type UIKnowledge = z.infer<typeof uiKnowledgeSchema>;

export function calculateUIKnowledgeInputStats(
  bundle: Omit<SessionEvidenceBundle, 'inputStats'> | SessionEvidenceBundle,
): UIKnowledgeInputStats {
  const { inputStats: _inputStats, ...evidence } =
    bundle as SessionEvidenceBundle;
  const textPayload = {
    ...evidence,
    assets: evidence.assets.map(({ dataUrl: _dataUrl, ...asset }) => asset),
  };

  return {
    eligibleEventCount: evidence.events.length,
    userActionCount: evidence.events.filter(
      (event) => event.knowledgeRole === 'user-action',
    ).length,
    imageReferenceCount: evidence.events.reduce(
      (count, event) => count + event.evidenceRefs.length,
      0,
    ),
    uniqueImageCount: evidence.assets.length,
    totalImageEncodedBytes: evidence.assets.reduce(
      (count, asset) => count + asset.encodedBytes,
      0,
    ),
    totalImageDataUrlChars: evidence.assets.reduce(
      (count, asset) => count + asset.dataUrl.length,
      0,
    ),
    textChars: JSON.stringify(textPayload).length,
  };
}

export interface ModelEgressDescriptor {
  descriptorId: string;
  modelName: string;
  providerLabel: string;
  endpointOrigin: string;
  proxyOrigin?: string;
  tracingDestinations: string[];
  hasOpaqueCustomClient: boolean;
}

export interface UIKnowledgeEgressDecision {
  confirmed: boolean;
  excludedAssetIds: string[];
  excludedEventHashIds: string[];
}

export interface UIKnowledgeGenerationUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface UIKnowledgeGenerationMetadata {
  promptVersion: typeof UI_KNOWLEDGE_PROMPT_VERSION;
  attemptCount: 1;
  generatedAt: number;
  durationMs: number;
  modelName: string;
  providerLabel: string;
  endpointOrigin: string;
  inputStats: UIKnowledgeInputStats;
  responseHash: string;
  usage?: UIKnowledgeGenerationUsage;
}

export interface UIKnowledgeArtifact {
  sessionId: string;
  sourceEvidenceRevision: number;
  knowledge: UIKnowledge;
  markdown: string;
  metadata: UIKnowledgeGenerationMetadata;
}

export interface DescribeRecorderKnowledgeEgressRequest {
  modelConfig: IModelConfig;
}

export interface DescribeRecorderKnowledgeEgressResult {
  descriptor: ModelEgressDescriptor;
}

export interface GenerateRecorderKnowledgeRequest {
  descriptorId: string;
  evidenceBundle: SessionEvidenceBundle;
  modelConfig: IModelConfig;
}

export interface GenerateRecorderKnowledgeResult {
  knowledge: UIKnowledge;
  metadata: UIKnowledgeGenerationMetadata;
}

export type UIKnowledgeGenerationErrorCode =
  | 'EGRESS_CHANGED'
  | 'OPAQUE_MODEL_CLIENT'
  | 'INVALID_EVIDENCE_BUNDLE'
  | 'INPUT_TOO_LARGE'
  | 'INVALID_MODEL_RESPONSE';
