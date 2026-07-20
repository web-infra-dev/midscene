import { createHash } from 'node:crypto';
import {
  AIResponseParseError,
  type ChatCompletionMessageParam,
  callAIWithObjectResponse,
  getModelRuntime,
} from '@midscene/core/ai-model';
import type { IModelConfig } from '@midscene/shared/env';
import { getDebug } from '@midscene/shared/logger';
import {
  type DescribeRecorderKnowledgeEgressRequest,
  type DescribeRecorderKnowledgeEgressResult,
  type EventEvidenceUnit,
  type EvidenceRef,
  type GenerateRecorderKnowledgeRequest,
  type GenerateRecorderKnowledgeResult,
  MVP_KNOWLEDGE_INPUT_BUDGET,
  type ModelEgressDescriptor,
  type ProductCapabilityType,
  type RecordedActionEvidence,
  type SessionEvidenceBundle,
  type UIKnowledge,
  type UIKnowledgeDraft,
  type UIKnowledgeGenerationErrorCode,
  type UIKnowledgeGenerationUsage,
  UI_KNOWLEDGE_PROMPT_VERSION,
  UI_KNOWLEDGE_SCHEMA_VERSION,
  type VisibleEffectType,
  calculateUIKnowledgeInputStats,
  sessionEvidenceBundleSchema,
  uiKnowledgeDraftSchema,
} from '@shared/ui-knowledge-contract';
import { buildEventObservationMessages } from './knowledge-observer';
import { KNOWLEDGE_SYNTHESIS_SYSTEM_PROMPT } from './knowledge-synthesis-prompt';

const debugKnowledgeGenerator = getDebug('studio:recorder-knowledge', {
  console: true,
});

const DEFAULT_OPENAI_ENDPOINT_ORIGIN = 'https://api.openai.com';
const SUPPORTED_ACTION_PARAM_KINDS = {
  Tap: 'point',
  DoubleClick: 'point',
  RightClick: 'point',
  LongPress: 'point',
  Swipe: 'drag',
  DragAndDrop: 'drag',
  Input: 'input',
  KeyboardPress: 'keydown',
  Scroll: 'scroll',
  GoBack: 'navigation',
  GoForward: 'navigation',
  Reload: 'navigation',
} as const satisfies Record<
  string,
  RecordedActionEvidence['observedParams']['kind']
>;

const SUPPORTED_ACTION_EVENT_TYPES = {
  Tap: 'click',
  DoubleClick: 'click',
  RightClick: 'click',
  LongPress: 'click',
  Swipe: 'drag',
  DragAndDrop: 'drag',
  Input: 'input',
  KeyboardPress: 'keydown',
  Scroll: 'scroll',
  GoBack: 'navigation',
  GoForward: 'navigation',
  Reload: 'navigation',
} as const satisfies Record<string, RecordedActionEvidence['eventType']>;

type ChatCompletionUserContent = Exclude<
  Extract<ChatCompletionMessageParam, { role: 'user' }>['content'],
  string
>;

function createKnowledgeError(
  code: UIKnowledgeGenerationErrorCode,
  message: string,
  cause?: unknown,
) {
  const error = new Error(`[${code}] ${message}`);
  return cause === undefined ? error : Object.assign(error, { cause });
}

function assertModelConfig(modelConfig: IModelConfig) {
  if (!modelConfig?.modelName?.trim()) {
    throw new Error('Recorder knowledge modelConfig.modelName is required.');
  }
  if (
    modelConfig.extraBody &&
    ('model' in modelConfig.extraBody || 'messages' in modelConfig.extraBody)
  ) {
    throw createKnowledgeError(
      'OPAQUE_MODEL_CLIENT',
      'Knowledge generation does not allow extraBody to override model or messages.',
    );
  }
}

function isEnabledEnvironmentValue(value?: string) {
  return value === '1' || value?.toLowerCase() === 'true';
}

function parseOrigin(value: string, fieldName: string) {
  try {
    const url = new URL(value);
    if (
      url.protocol === 'codex:' ||
      url.protocol === 'socks4:' ||
      url.protocol === 'socks5:'
    ) {
      return `${url.protocol}//${url.host || 'app-server'}`;
    }
    if (!url.origin || url.origin === 'null') {
      throw new Error('URL has no origin.');
    }
    return url.origin;
  } catch (error) {
    debugKnowledgeGenerator('failed to parse egress URL %o', {
      fieldName,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(`${fieldName} must be an absolute URL.`);
  }
}

function resolveTracingDestinations() {
  const destinations: string[] = [];
  if (isEnabledEnvironmentValue(process.env.MIDSCENE_LANGSMITH_DEBUG)) {
    destinations.push(
      parseOrigin(
        process.env.LANGSMITH_ENDPOINT ||
          process.env.LANGCHAIN_ENDPOINT ||
          'https://api.smith.langchain.com',
        'LangSmith endpoint',
      ),
    );
  }
  if (isEnabledEnvironmentValue(process.env.MIDSCENE_LANGFUSE_DEBUG)) {
    destinations.push(
      parseOrigin(
        process.env.LANGFUSE_BASEURL ||
          process.env.LANGFUSE_HOST ||
          'https://cloud.langfuse.com',
        'Langfuse endpoint',
      ),
    );
  }
  return [...new Set(destinations)].sort();
}

function resolveProviderLabel(
  endpointOrigin: string,
  modelConfig: IModelConfig,
) {
  if (modelConfig.modelFamily) {
    return modelConfig.modelFamily;
  }
  if (endpointOrigin === DEFAULT_OPENAI_ENDPOINT_ORIGIN) {
    return 'OpenAI';
  }
  try {
    return new URL(endpointOrigin).hostname || endpointOrigin;
  } catch {
    return endpointOrigin;
  }
}

function resolveModelEgressDescriptor(
  modelConfig: IModelConfig,
): ModelEgressDescriptor {
  assertModelConfig(modelConfig);
  const extraConfig = modelConfig.openaiExtraConfig;
  const extraBaseURL = extraConfig?.baseURL;
  const hasInvalidExtraBaseURL =
    extraBaseURL !== undefined && typeof extraBaseURL !== 'string';
  const hasOpaqueTransportConfig = Boolean(
    extraConfig &&
      ['fetchOptions', 'httpAgent', 'dispatcher', 'agent'].some(
        (key) => key in extraConfig,
      ),
  );
  const effectiveBaseURL =
    typeof extraBaseURL === 'string' && extraBaseURL.trim()
      ? extraBaseURL
      : modelConfig.openaiBaseURL || DEFAULT_OPENAI_ENDPOINT_ORIGIN;
  const endpointOrigin = parseOrigin(
    effectiveBaseURL,
    'effective model baseURL',
  );
  const effectiveProxy = modelConfig.httpProxy || modelConfig.socksProxy;
  const proxyOrigin = effectiveProxy
    ? parseOrigin(effectiveProxy, 'model proxy')
    : undefined;
  const tracingDestinations = resolveTracingDestinations();
  const hasOpaqueCustomClient =
    typeof modelConfig.createOpenAIClient === 'function' ||
    hasInvalidExtraBaseURL ||
    hasOpaqueTransportConfig ||
    endpointOrigin.startsWith('codex:');
  const providerLabel = resolveProviderLabel(endpointOrigin, modelConfig);
  const descriptorPayload = {
    modelName: modelConfig.modelName,
    providerLabel,
    endpointOrigin,
    proxyOrigin,
    tracingDestinations,
    hasOpaqueCustomClient,
  };

  return {
    descriptorId: `sha256:${createHash('sha256')
      .update(JSON.stringify(descriptorPayload))
      .digest('hex')}`,
    ...descriptorPayload,
  };
}

export function describeRecorderKnowledgeEgressInMain(
  request: DescribeRecorderKnowledgeEgressRequest,
): DescribeRecorderKnowledgeEgressResult {
  return {
    descriptor: resolveModelEgressDescriptor(request?.modelConfig),
  };
}

function sameInputStats(
  left: SessionEvidenceBundle['inputStats'],
  right: SessionEvidenceBundle['inputStats'],
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function evidenceRefKey(ref: EvidenceRef) {
  return `${ref.eventHashId}\u0000${ref.frameRole}\u0000${ref.assetId}`;
}

function validateActionEvidence(event: EventEvidenceUnit) {
  if (event.knowledgeRole !== 'user-action') {
    return;
  }
  const { action } = event;
  const expectedKind = (
    SUPPORTED_ACTION_PARAM_KINDS as Record<
      string,
      RecordedActionEvidence['observedParams']['kind'] | undefined
    >
  )[action.name];
  if (!expectedKind) {
    throw createKnowledgeError(
      'INVALID_EVIDENCE_BUNDLE',
      `Unsupported action evidence for event ${event.eventHashId}: ${action.name}.`,
    );
  }
  if (expectedKind !== action.observedParams.kind) {
    throw createKnowledgeError(
      'INVALID_EVIDENCE_BUNDLE',
      `Action ${action.name} requires ${expectedKind} observed params.`,
    );
  }
  const expectedEventType = (
    SUPPORTED_ACTION_EVENT_TYPES as Record<
      string,
      RecordedActionEvidence['eventType'] | undefined
    >
  )[action.name];
  if (action.eventType !== expectedEventType) {
    throw createKnowledgeError(
      'INVALID_EVIDENCE_BUNDLE',
      `Action ${action.name} requires Recorder event type ${expectedEventType}.`,
    );
  }
  if (action.eventType === 'setViewport') {
    throw createKnowledgeError(
      'INVALID_EVIDENCE_BUNDLE',
      `setViewport cannot be a user action source (${event.eventHashId}).`,
    );
  }

  if (action.name === 'Swipe') {
    const params = action.observedParams;
    if (
      params.kind !== 'drag' ||
      params.deltaX === undefined ||
      params.deltaY === undefined ||
      params.durationMs === undefined ||
      params.repeat === undefined ||
      event.target?.x === undefined ||
      event.target.y === undefined ||
      event.target.endX === undefined ||
      event.target.endY === undefined
    ) {
      throw createKnowledgeError(
        'INVALID_EVIDENCE_BUNDLE',
        `Swipe event ${event.eventHashId} requires complete relative and absolute gesture evidence.`,
      );
    }
    const deltaX = event.target.endX - event.target.x;
    const deltaY = event.target.endY - event.target.y;
    if (params.deltaX !== deltaX || params.deltaY !== deltaY) {
      throw createKnowledgeError(
        'INVALID_EVIDENCE_BUNDLE',
        `Swipe event ${event.eventHashId} has inconsistent gesture deltas.`,
      );
    }
  }

  if (action.name === 'DragAndDrop') {
    const params = action.observedParams;
    if (
      params.kind !== 'drag' ||
      params.deltaX !== undefined ||
      params.deltaY !== undefined ||
      params.durationMs !== undefined ||
      params.repeat !== undefined
    ) {
      throw createKnowledgeError(
        'INVALID_EVIDENCE_BUNDLE',
        `DragAndDrop event ${event.eventHashId} must not expose Swipe parameters.`,
      );
    }
  }

  if (action.observedParams.kind === 'keydown') {
    const { key, modifiers } = action.observedParams;
    const modifierOrder = ['Control', 'Meta', 'Alt', 'Shift'];
    const normalizedModifiers = [...new Set(modifiers)].sort(
      (left, right) =>
        modifierOrder.indexOf(left) - modifierOrder.indexOf(right),
    );
    if (JSON.stringify(normalizedModifiers) !== JSON.stringify(modifiers)) {
      throw createKnowledgeError(
        'INVALID_EVIDENCE_BUNDLE',
        `KeyboardPress event ${event.eventHashId} has non-canonical modifiers.`,
      );
    }
    if (
      key.kind === 'shortcut' &&
      !modifiers.some((modifier) =>
        ['Control', 'Meta', 'Alt'].includes(modifier),
      )
    ) {
      throw createKnowledgeError(
        'INVALID_EVIDENCE_BUNDLE',
        `KeyboardPress event ${event.eventHashId} exposes a printable key without a shortcut modifier.`,
      );
    }
  }
}

function parseAndValidateEvidenceBundle(input: unknown): SessionEvidenceBundle {
  const parsed = sessionEvidenceBundleSchema.safeParse(input);
  if (!parsed.success) {
    throw createKnowledgeError(
      'INVALID_EVIDENCE_BUNDLE',
      `Evidence bundle does not match session-evidence/v1: ${parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')}`,
    );
  }
  const bundle = parsed.data;
  const calculatedStats = calculateUIKnowledgeInputStats(bundle);
  if (!sameInputStats(calculatedStats, bundle.inputStats)) {
    throw createKnowledgeError(
      'INVALID_EVIDENCE_BUNDLE',
      'Evidence inputStats do not match the transmitted evidence.',
    );
  }

  if (
    calculatedStats.textChars > MVP_KNOWLEDGE_INPUT_BUDGET.maxTextChars ||
    bundle.assets.some(
      (asset) =>
        Math.max(asset.requestWidth, asset.requestHeight) >
        MVP_KNOWLEDGE_INPUT_BUDGET.maxImageLongEdge,
    )
  ) {
    throw createKnowledgeError(
      'INPUT_TOO_LARGE',
      'Recorder knowledge evidence exceeds the session-evidence/v1 MVP budget.',
    );
  }

  const eventByHashId = new Map<string, EventEvidenceUnit>();
  const sequences = new Set<number>();
  const mergedHashIds = new Set<string>();
  for (const event of bundle.events) {
    if (eventByHashId.has(event.eventHashId)) {
      throw createKnowledgeError(
        'INVALID_EVIDENCE_BUNDLE',
        `Duplicate eventHashId: ${event.eventHashId}.`,
      );
    }
    if (sequences.has(event.sequence)) {
      throw createKnowledgeError(
        'INVALID_EVIDENCE_BUNDLE',
        `Duplicate event sequence: ${event.sequence}.`,
      );
    }
    if (event.semantic?.status === 'pending') {
      throw createKnowledgeError(
        'INVALID_EVIDENCE_BUNDLE',
        `Event ${event.eventHashId} still has pending semantic analysis.`,
      );
    }
    eventByHashId.set(event.eventHashId, event);
    sequences.add(event.sequence);
    for (const mergedHashId of event.mergedEventHashIds) {
      if (mergedHashIds.has(mergedHashId)) {
        throw createKnowledgeError(
          'INVALID_EVIDENCE_BUNDLE',
          `Duplicate merged event hash: ${mergedHashId}.`,
        );
      }
      mergedHashIds.add(mergedHashId);
    }
    validateActionEvidence(event);
  }
  for (const eventHashId of eventByHashId.keys()) {
    if (mergedHashIds.has(eventHashId)) {
      throw createKnowledgeError(
        'INVALID_EVIDENCE_BUNDLE',
        `Canonical eventHashId ${eventHashId} cannot also be a merged hash.`,
      );
    }
  }

  const assetById = new Map(
    bundle.assets.map((asset) => [asset.assetId, asset]),
  );
  if (assetById.size !== bundle.assets.length) {
    throw createKnowledgeError(
      'INVALID_EVIDENCE_BUNDLE',
      'Screenshot assets contain duplicate assetId values.',
    );
  }

  const referencedAssetIds = new Set<string>();
  for (const event of bundle.events) {
    const roleKeys = new Set<string>();
    if (
      event.knowledgeRole === 'initial-state' &&
      (event.evidenceRefs.length !== 1 ||
        event.evidenceRefs[0].frameRole === 'target-marked-before')
    ) {
      throw createKnowledgeError(
        'INVALID_EVIDENCE_BUNDLE',
        `Initial state ${event.eventHashId} must contain exactly one before or after image.`,
      );
    }
    for (const ref of event.evidenceRefs) {
      if (ref.eventHashId !== event.eventHashId) {
        throw createKnowledgeError(
          'INVALID_EVIDENCE_BUNDLE',
          `Evidence ref ${evidenceRefKey(ref)} belongs to the wrong event.`,
        );
      }
      if (roleKeys.has(ref.frameRole)) {
        throw createKnowledgeError(
          'INVALID_EVIDENCE_BUNDLE',
          `Event ${event.eventHashId} contains duplicate ${ref.frameRole} evidence.`,
        );
      }
      if (!assetById.has(ref.assetId)) {
        throw createKnowledgeError(
          'INVALID_EVIDENCE_BUNDLE',
          `Evidence ref uses missing asset ${ref.assetId}.`,
        );
      }
      roleKeys.add(ref.frameRole);
      referencedAssetIds.add(ref.assetId);
    }
  }

  for (const asset of bundle.assets) {
    const encoded = asset.dataUrl.slice(asset.dataUrl.indexOf(',') + 1);
    if (
      encoded.length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        encoded,
      )
    ) {
      throw createKnowledgeError(
        'INVALID_EVIDENCE_BUNDLE',
        `Screenshot asset ${asset.assetId} is not canonical base64.`,
      );
    }
    const bytes = Buffer.from(encoded, 'base64');
    const actualAssetId = `sha256:${createHash('sha256')
      .update(bytes)
      .digest('hex')}`;
    if (
      bytes.byteLength !== asset.encodedBytes ||
      actualAssetId !== asset.assetId
    ) {
      throw createKnowledgeError(
        'INVALID_EVIDENCE_BUNDLE',
        `Screenshot asset integrity check failed for ${asset.assetId}.`,
      );
    }
    if (!referencedAssetIds.has(asset.assetId)) {
      throw createKnowledgeError(
        'INVALID_EVIDENCE_BUNDLE',
        `Unreferenced screenshot asset ${asset.assetId} must not be uploaded.`,
      );
    }
  }

  return bundle;
}

interface EventObservationRecord {
  eventHashId: string;
  observation: unknown;
}

function buildSynthesisPromptMessages(
  bundle: SessionEvidenceBundle,
  observations: EventObservationRecord[],
): ChatCompletionMessageParam[] {
  const observationByEventHashId = new Map(
    observations.map((record) => [record.eventHashId, record.observation]),
  );
  if (observationByEventHashId.size !== bundle.events.length) {
    throw createKnowledgeError(
      'INVALID_MODEL_RESPONSE',
      'Event observation count does not match the evidence event count.',
    );
  }

  const content: ChatCompletionUserContent = [
    {
      type: 'text',
      text: `<recording_session>
${JSON.stringify({ session: bundle.session, inputStats: bundle.inputStats }, null, 2)}
</recording_session>

<event_observations>`,
    },
  ];

  const sortedEvents = [...bundle.events].sort(
    (left, right) => left.sequence - right.sequence,
  );
  for (const [index, event] of sortedEvents.entries()) {
    const eventIndex = index + 1;
    const observation = observationByEventHashId.get(event.eventHashId);
    if (!observation) {
      throw createKnowledgeError(
        'INVALID_MODEL_RESPONSE',
        `Missing visual observation for event ${event.eventHashId}.`,
      );
    }
    const eventContext =
      event.knowledgeRole === 'user-action'
        ? {
            eventIndex,
            knowledgeRole: event.knowledgeRole,
            actionName: event.action.name,
          }
        : {
            eventIndex,
            knowledgeRole: event.knowledgeRole,
          };
    content.push({
      type: 'text',
      text: `EVENT_INDEX ${eventIndex}
${JSON.stringify({ ...eventContext, observation }, null, 2)}`,
    });
  }

  content.push({
    type: 'text',
    text: `</event_observations>

请将 core_principles 作为最高优先级目标：页面知识 = 页面方位 + 区域 + 组件；交互知识 = 目标组件 + 交互方式 + 组件变化；跨页知识 = 目标组件 + 交互方式 + 目标页面。逐条消费 observation 中拍平的 beforePage、beforeComponents、afterPage、afterComponents 和 change，按页面合并组件知识，并将同页变化与跨页面变化分别写入 interactions 和 navigations。只返回 contents、interactions、navigations 三个数组。`,
  });

  return [
    {
      role: 'system',
      content: KNOWLEDGE_SYNTHESIS_SYSTEM_PROMPT,
    },
    { role: 'user', content },
  ];
}

function calculatePromptTextChars(messages: ChatCompletionMessageParam[]) {
  return messages.reduce((total, message) => {
    if (typeof message.content === 'string') {
      return total + message.content.length;
    }
    if (!Array.isArray(message.content)) {
      return total;
    }
    return (
      total +
      message.content.reduce(
        (messageTotal, part) =>
          messageTotal +
          (part && typeof part === 'object' && 'text' in part
            ? String(part.text).length
            : 0),
        0,
      )
    );
  }, 0);
}

function enrichRecordedActionRefs(
  draft: UIKnowledgeDraft,
  bundle: SessionEvidenceBundle,
): UIKnowledge {
  const sortedEvents = [...bundle.events].sort(
    (left, right) => left.sequence - right.sequence,
  );
  const allEvidenceRefs = Array.from(
    new Map(
      sortedEvents
        .flatMap((event) => event.evidenceRefs)
        .map((ref) => [evidenceRefKey(ref), ref]),
    ).values(),
  );

  const capabilityTypeFor = (
    action: RecordedActionEvidence,
    isNavigation: boolean,
  ): ProductCapabilityType => {
    if (isNavigation) {
      return 'navigate';
    }
    switch (action.name) {
      case 'Input':
        return 'data-entry';
      case 'Scroll':
      case 'Swipe':
        return 'browse';
      case 'GoBack':
      case 'GoForward':
      case 'Reload':
        return 'navigate';
      default:
        return 'other';
    }
  };
  const effectTypeFor = (action: RecordedActionEvidence): VisibleEffectType =>
    action.name === 'Scroll' || action.name === 'Swipe'
      ? 'reveal-content'
      : 'update-content';

  const enrichActions = (
    actions: UIKnowledgeDraft['interactions'],
    isNavigation: boolean,
  ): UIKnowledge['interactions'] => {
    const enriched: UIKnowledge['interactions'] = [];
    for (const item of actions) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        continue;
      }
      const eventIndex = item.eventIndex;
      const description =
        typeof item.description === 'string' ? item.description.trim() : '';
      const event =
        Number.isInteger(eventIndex) && eventIndex > 0
          ? sortedEvents[eventIndex - 1]
          : undefined;
      if (!event || event.knowledgeRole !== 'user-action' || !description) {
        continue;
      }
      enriched.push({
        eventIndex,
        description,
        sourceAction: {
          eventHashId: event.eventHashId,
          ...event.action,
        },
        evidenceRefs: event.evidenceRefs,
        primaryProductCapabilityType: capabilityTypeFor(
          event.action,
          isNavigation,
        ),
        primaryEffectType: effectTypeFor(event.action),
      });
    }
    return enriched;
  };

  return {
    schemaVersion: UI_KNOWLEDGE_SCHEMA_VERSION,
    sessionId: bundle.session.sessionId,
    contents: draft.contents
      .filter((content): content is string => typeof content === 'string')
      .map((content) => content.trim())
      .filter(Boolean)
      .map((description) => ({ description, evidenceRefs: allEvidenceRefs })),
    interactions: enrichActions(draft.interactions, false),
    navigations: enrichActions(draft.navigations, true),
  };
}

function normalizeUsage(
  usage:
    | {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      }
    | undefined,
) {
  if (!usage) {
    return undefined;
  }
  return {
    promptTokens: usage.prompt_tokens ?? 0,
    completionTokens: usage.completion_tokens ?? 0,
    totalTokens: usage.total_tokens ?? 0,
  };
}

function aggregateUsage(
  usages: Array<UIKnowledgeGenerationUsage | undefined>,
): UIKnowledgeGenerationUsage | undefined {
  const availableUsages = usages.filter(
    (usage): usage is UIKnowledgeGenerationUsage => usage !== undefined,
  );
  if (availableUsages.length === 0) {
    return undefined;
  }
  return availableUsages.reduce<UIKnowledgeGenerationUsage>(
    (total, usage) => ({
      promptTokens: total.promptTokens + usage.promptTokens,
      completionTokens: total.completionTokens + usage.completionTokens,
      totalTokens: total.totalTokens + usage.totalTokens,
    }),
    { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  );
}

function responseHashOf(content: string) {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

async function callKnowledgeModel(
  messages: ChatCompletionMessageParam[],
  modelRuntime: ReturnType<typeof getModelRuntime>,
  phase: string,
) {
  const promptTextChars = calculatePromptTextChars(messages);
  if (promptTextChars > MVP_KNOWLEDGE_INPUT_BUDGET.maxTextChars) {
    throw createKnowledgeError(
      'INPUT_TOO_LARGE',
      `${phase} prompt contains ${promptTextChars} text characters, exceeding the ${MVP_KNOWLEDGE_INPUT_BUDGET.maxTextChars} character limit.`,
    );
  }

  try {
    const response = await callAIWithObjectResponse<unknown>(
      messages,
      modelRuntime,
      { jsonParserSource: 'generic-object' },
    );
    return {
      response,
      responseHash: responseHashOf(response.contentString),
    };
  } catch (error) {
    if (error instanceof AIResponseParseError) {
      throw createKnowledgeError(
        'INVALID_MODEL_RESPONSE',
        `${phase} response was not valid JSON (responseHash=${responseHashOf(error.rawResponse)}).`,
        error,
      );
    }
    throw error;
  }
}

const EVENT_OBSERVATION_CONCURRENCY = 3;

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex], currentIndex);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

export async function generateRecorderKnowledgeInMain(
  request: GenerateRecorderKnowledgeRequest,
): Promise<GenerateRecorderKnowledgeResult> {
  assertModelConfig(request?.modelConfig);
  const descriptor = resolveModelEgressDescriptor(request.modelConfig);
  if (descriptor.hasOpaqueCustomClient) {
    throw createKnowledgeError(
      'OPAQUE_MODEL_CLIENT',
      'Knowledge generation does not support an opaque createOpenAIClient.',
    );
  }
  if (request.descriptorId !== descriptor.descriptorId) {
    throw createKnowledgeError(
      'EGRESS_CHANGED',
      'Model egress changed after confirmation. Review and confirm the new destination.',
    );
  }

  const evidenceBundle = parseAndValidateEvidenceBundle(request.evidenceBundle);
  const startedAt = Date.now();
  debugKnowledgeGenerator('start recorder knowledge generation %o', {
    sessionId: evidenceBundle.session.sessionId,
    modelName: descriptor.modelName,
    providerLabel: descriptor.providerLabel,
    endpointOrigin: descriptor.endpointOrigin,
    assetIds: evidenceBundle.assets.map((asset) => asset.assetId),
    inputStats: evidenceBundle.inputStats,
    attemptCount: 1,
    observationCallCount: evidenceBundle.events.length,
    observationConcurrency: EVENT_OBSERVATION_CONCURRENCY,
  });

  const modelRuntime = getModelRuntime({
    ...request.modelConfig,
    retryCount: 0,
  });
  const assetById = new Map(
    evidenceBundle.assets.map((asset) => [asset.assetId, asset]),
  );
  const observationCalls = await mapWithConcurrency(
    evidenceBundle.events,
    EVENT_OBSERVATION_CONCURRENCY,
    async (event) => {
      const call = await callKnowledgeModel(
        buildEventObservationMessages(event, assetById),
        modelRuntime,
        `Event ${event.eventHashId} observation`,
      );
      return {
        record: {
          eventHashId: event.eventHashId,
          observation: call.response.content,
        },
        usage: normalizeUsage(call.response.usage),
      };
    },
  );

  const synthesisCall = await callKnowledgeModel(
    buildSynthesisPromptMessages(
      evidenceBundle,
      observationCalls.map((call) => call.record),
    ),
    modelRuntime,
    'Knowledge synthesis',
  );
  const responseHash = synthesisCall.responseHash;
  const parsedDraft = uiKnowledgeDraftSchema.safeParse(
    synthesisCall.response.content,
  );
  if (!parsedDraft.success) {
    throw createKnowledgeError(
      'INVALID_MODEL_RESPONSE',
      `Knowledge synthesis must return contents, interactions, and navigations arrays (responseHash=${responseHash}).`,
    );
  }
  const draft = parsedDraft.data as unknown as UIKnowledgeDraft;
  const knowledge = enrichRecordedActionRefs(draft, evidenceBundle);

  const generatedAt = Date.now();
  const metadata = {
    promptVersion: UI_KNOWLEDGE_PROMPT_VERSION,
    attemptCount: 1 as const,
    generatedAt,
    durationMs: generatedAt - startedAt,
    modelName: descriptor.modelName,
    providerLabel: descriptor.providerLabel,
    endpointOrigin: descriptor.endpointOrigin,
    inputStats: evidenceBundle.inputStats,
    responseHash,
    usage: aggregateUsage([
      ...observationCalls.map((call) => call.usage),
      normalizeUsage(synthesisCall.response.usage),
    ]),
  };
  debugKnowledgeGenerator('completed recorder knowledge generation %o', {
    sessionId: evidenceBundle.session.sessionId,
    durationMs: metadata.durationMs,
    responseHash,
    contentCount: knowledge.contents.length,
    interactionCount: knowledge.interactions.length,
    navigationCount: knowledge.navigations.length,
    modelCallCount: observationCalls.length + 1,
  });

  return { knowledge, metadata };
}
