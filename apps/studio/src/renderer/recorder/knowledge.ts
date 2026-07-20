import {
  imageInfoOfBase64,
  normalizeBase64Image,
  parseBase64,
  resizeImgBase64,
} from '@midscene/shared/img';
import type {
  EventEvidenceUnit,
  EvidenceFrameRole,
  EvidenceRef,
  ModelEgressDescriptor,
  RecordedActionEvidence,
  RecordedActionObservedParams,
  ScreenshotAsset,
  SessionEvidenceBundle,
  UIKnowledge,
  UIKnowledgeArtifact,
  UIKnowledgeEgressDecision,
} from '@shared/ui-knowledge-contract';
import {
  MVP_KNOWLEDGE_INPUT_BUDGET,
  SESSION_EVIDENCE_SCHEMA_VERSION,
  calculateUIKnowledgeInputStats,
  sessionEvidenceBundleSchema,
} from '@shared/ui-knowledge-contract';
import {
  resolveStudioRecorderModelConfig,
  toSerializableStudioRecorderModelConfig,
} from './model-config';
import type { StudioRecordedEvent, StudioRecordingSession } from './types';

const POINT_ACTIONS = new Set([
  'Tap',
  'DoubleClick',
  'LongPress',
  'RightClick',
]);
const CONTROL_KEYS = new Set([
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
]);
const MODIFIER_ORDER = ['Control', 'Meta', 'Alt', 'Shift'] as const;

type KnowledgeModifier = (typeof MODIFIER_ORDER)[number];

interface PreparedScreenshot {
  asset: ScreenshotAsset;
  ref: EvidenceRef;
}

function requireStudioRuntime() {
  if (!window.studioRuntime) {
    throw new Error('Studio runtime bridge is unavailable.');
  }
  return window.studioRuntime;
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function nonNegativeNumber(value: unknown) {
  const number = finiteNumber(value);
  return number !== undefined && number >= 0 ? number : undefined;
}

function positiveInteger(value: unknown) {
  const number = finiteNumber(value);
  return number !== undefined && Number.isInteger(number) && number > 0
    ? number
    : undefined;
}

function sanitizeUrl(value?: string) {
  if (!value?.trim()) {
    return undefined;
  }
  try {
    const url = new URL(value);
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return value.split(/[?#]/, 1)[0] || undefined;
  }
}

function sanitizeSemanticDescription(
  event: StudioRecordedEvent,
): string | undefined {
  if (event.type === 'input' || event.type === 'keydown') {
    return undefined;
  }
  const description = event.semantic?.elementDescription?.trim();
  if (
    !description ||
    /(?:api[_-]?key|access[_-]?token|authorization|bearer\s+|password|secret|sk-[a-z0-9])/i.test(
      description,
    )
  ) {
    return undefined;
  }
  return description.slice(0, 500);
}

function buildSemanticEvidence(event: StudioRecordedEvent) {
  const semantic = event.semantic;
  if (!semantic) {
    return undefined;
  }
  const elementDescription = sanitizeSemanticDescription(event);
  return {
    source: semantic.source,
    status: semantic.status,
    ...(semantic.confidence ? { confidence: semantic.confidence } : {}),
    ...(elementDescription ? { elementDescription } : {}),
    ...(semantic.aiDescribe
      ? {
          aiDescribe: {
            verifyPrompt: semantic.aiDescribe.verifyPrompt,
            ...(semantic.aiDescribe.verifyPassed !== undefined
              ? { verifyPassed: semantic.aiDescribe.verifyPassed }
              : {}),
            ...(semantic.aiDescribe.deepLocate !== undefined
              ? { deepLocate: semantic.aiDescribe.deepLocate }
              : {}),
            ...(nonNegativeNumber(semantic.aiDescribe.centerDistance) !==
            undefined
              ? {
                  centerDistance: nonNegativeNumber(
                    semantic.aiDescribe.centerDistance,
                  ),
                }
              : {}),
          },
        }
      : {}),
    ...(semantic.fallbackFrom
      ? {
          fallbackFrom: {
            source: semantic.fallbackFrom.source,
            status: semantic.fallbackFrom.status,
            ...(semantic.fallbackFrom.confidence
              ? { confidence: semantic.fallbackFrom.confidence }
              : {}),
          },
        }
      : {}),
  };
}

function normalizeModifiers(parts: string[]) {
  const modifierAliases: Record<string, KnowledgeModifier> = {
    Control: 'Control',
    Ctrl: 'Control',
    Meta: 'Meta',
    Command: 'Meta',
    Cmd: 'Meta',
    Alt: 'Alt',
    Option: 'Alt',
    Shift: 'Shift',
  };
  const modifiers = new Set<KnowledgeModifier>();
  for (const part of parts) {
    const modifier = modifierAliases[part];
    if (modifier) {
      modifiers.add(modifier);
    }
  }
  return MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier));
}

function buildSafeKeyboardParams(
  event: StudioRecordedEvent,
): RecordedActionObservedParams {
  const rawKey =
    typeof event.rawPayload.keyName === 'string'
      ? event.rawPayload.keyName
      : event.value || '';
  const parts = rawKey
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
  const keyValue = parts.at(-1) || '';
  const modifiers = normalizeModifiers(parts.slice(0, -1));
  const normalizedControlKey = keyValue === ' ' ? 'Space' : keyValue;

  if (CONTROL_KEYS.has(normalizedControlKey)) {
    return {
      kind: 'keydown',
      modifiers,
      key: {
        kind: 'control',
        value: normalizedControlKey as
          | 'Enter'
          | 'Escape'
          | 'Tab'
          | 'ArrowUp'
          | 'ArrowDown'
          | 'ArrowLeft'
          | 'ArrowRight'
          | 'Backspace'
          | 'Delete'
          | 'Home'
          | 'End'
          | 'PageUp'
          | 'PageDown'
          | 'Space',
      },
    };
  }
  if (
    /^[A-Za-z0-9]$/.test(keyValue) &&
    modifiers.some(
      (modifier) =>
        modifier === 'Control' || modifier === 'Meta' || modifier === 'Alt',
    )
  ) {
    return {
      kind: 'keydown',
      modifiers,
      key: { kind: 'shortcut', value: keyValue },
    };
  }
  return { kind: 'keydown', modifiers, key: { kind: 'redacted' } };
}

function buildRecordedActionEvidence(
  event: StudioRecordedEvent,
): RecordedActionEvidence {
  if (!event.actionType?.trim()) {
    throw new Error(
      `INVALID_RECORDER_EVENT: event ${event.hashId} has no actionType.`,
    );
  }
  if (event.actionTypeOrigin !== 'recorded') {
    throw new Error(
      `INEXACT_ACTION_IDENTITY: event ${event.hashId} must be recorded again.`,
    );
  }

  const raw = event.rawPayload;
  let observedParams: RecordedActionObservedParams;
  if (POINT_ACTIONS.has(event.actionType)) {
    const durationMs = nonNegativeNumber(raw.duration);
    if (raw.duration !== undefined && durationMs === undefined) {
      throw new Error(
        `INVALID_RECORDER_EVENT: ${event.actionType} ${event.hashId} has an invalid duration.`,
      );
    }
    observedParams = {
      kind: 'point',
      ...(durationMs !== undefined ? { durationMs } : {}),
    };
  } else if (event.actionType === 'Swipe') {
    const x = finiteNumber(raw.x);
    const y = finiteNumber(raw.y);
    const endX = finiteNumber(raw.endX);
    const endY = finiteNumber(raw.endY);
    if (
      x === undefined ||
      y === undefined ||
      endX === undefined ||
      endY === undefined
    ) {
      throw new Error(
        `INVALID_RECORDER_EVENT: Swipe ${event.hashId} has incomplete coordinates.`,
      );
    }
    const durationMs =
      raw.duration === undefined ? 300 : nonNegativeNumber(raw.duration);
    const repeat = raw.repeat === undefined ? 1 : positiveInteger(raw.repeat);
    if (durationMs === undefined || repeat === undefined) {
      throw new Error(
        `INVALID_RECORDER_EVENT: Swipe ${event.hashId} has invalid duration or repeat parameters.`,
      );
    }
    observedParams = {
      kind: 'drag',
      deltaX: endX - x,
      deltaY: endY - y,
      durationMs,
      repeat,
    };
  } else if (event.actionType === 'DragAndDrop') {
    observedParams = { kind: 'drag' };
  } else if (event.actionType === 'Input') {
    const rawMode = typeof raw.mode === 'string' ? raw.mode : 'replace';
    if (!['replace', 'clear', 'typeOnly'].includes(rawMode)) {
      throw new Error(
        `INVALID_RECORDER_EVENT: Input ${event.hashId} uses unsupported mode ${rawMode}.`,
      );
    }
    observedParams = {
      kind: 'input',
      mode: rawMode as 'replace' | 'clear' | 'typeOnly',
      valueRedacted: true,
      hasValue:
        typeof event.value === 'string'
          ? event.value.length > 0
          : typeof raw.value === 'string' && raw.value.length > 0,
    };
  } else if (event.actionType === 'KeyboardPress') {
    observedParams = buildSafeKeyboardParams(event);
  } else if (event.actionType === 'Scroll') {
    const rawScrollType =
      typeof raw.scrollType === 'string' ? raw.scrollType : 'singleAction';
    const scrollTypes = [
      'singleAction',
      'scrollToBottom',
      'scrollToTop',
      'scrollToRight',
      'scrollToLeft',
    ];
    const rawDirection =
      typeof raw.direction === 'string' ? raw.direction : 'down';
    const directions = ['up', 'down', 'left', 'right'];
    if (
      !scrollTypes.includes(rawScrollType) ||
      !directions.includes(rawDirection)
    ) {
      throw new Error(
        `INVALID_RECORDER_EVENT: Scroll ${event.hashId} has unsupported parameters.`,
      );
    }
    const distance = nonNegativeNumber(raw.distance);
    if (raw.distance !== undefined && distance === undefined) {
      throw new Error(
        `INVALID_RECORDER_EVENT: Scroll ${event.hashId} has an invalid distance.`,
      );
    }
    observedParams = {
      kind: 'scroll',
      scrollType: rawScrollType as
        | 'singleAction'
        | 'scrollToBottom'
        | 'scrollToTop'
        | 'scrollToRight'
        | 'scrollToLeft',
      direction: rawDirection as 'up' | 'down' | 'left' | 'right',
      ...(distance !== undefined ? { distance } : {}),
    };
  } else if (
    event.actionType === 'GoBack' ||
    event.actionType === 'GoForward' ||
    event.actionType === 'Reload'
  ) {
    observedParams = { kind: 'navigation' };
  } else {
    throw new Error(
      `UNSUPPORTED_ACTION: ${event.actionType} is not supported by the knowledge MVP.`,
    );
  }

  return {
    name: event.actionType,
    eventType: event.type,
    observedParams,
  };
}

function buildEvidenceTarget(event: StudioRecordedEvent) {
  const x =
    finiteNumber(event.rawPayload.x) ?? finiteNumber(event.elementRect?.x);
  const y =
    finiteNumber(event.rawPayload.y) ?? finiteNumber(event.elementRect?.y);
  const endX = finiteNumber(event.rawPayload.endX);
  const endY = finiteNumber(event.rawPayload.endY);
  const rect = event.elementRect;
  const elementRect = rect
    ? Object.fromEntries(
        Object.entries(rect).filter(
          ([, value]) => typeof value === 'number' && Number.isFinite(value),
        ),
      )
    : undefined;
  const target = {
    ...(x !== undefined && y !== undefined ? { x, y } : {}),
    ...(endX !== undefined && endY !== undefined ? { endX, endY } : {}),
    ...(elementRect && Object.keys(elementRect).length > 0
      ? { elementRect }
      : {}),
  };
  return Object.keys(target).length > 0 ? target : undefined;
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

function base64BodyToBytes(body: string) {
  const binary = window.atob(body);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function prepareScreenshotAsset(
  screenshot: string,
  eventHashId: string,
  frameRole: EvidenceFrameRole,
): Promise<PreparedScreenshot> {
  const normalized = normalizeBase64Image(screenshot);
  const original = await imageInfoOfBase64(normalized);
  const scale = Math.min(
    1,
    MVP_KNOWLEDGE_INPUT_BUDGET.maxImageLongEdge /
      Math.max(original.width, original.height),
  );
  const requestWidth = Math.max(1, Math.round(original.width * scale));
  const requestHeight = Math.max(1, Math.round(original.height * scale));
  const dataUrl =
    scale < 1
      ? await resizeImgBase64(normalized, {
          width: requestWidth,
          height: requestHeight,
        })
      : normalized;
  const { body, mimeType } = parseBase64(dataUrl);
  if (
    mimeType !== 'image/jpeg' &&
    mimeType !== 'image/png' &&
    mimeType !== 'image/webp'
  ) {
    throw new Error(`Unsupported recorder screenshot format: ${mimeType}.`);
  }
  const encodedBytes = base64BodyToBytes(body);
  const hash = await globalThis.crypto.subtle.digest('SHA-256', encodedBytes);
  const assetId = `sha256:${toHex(new Uint8Array(hash))}`;
  const asset: ScreenshotAsset = {
    assetId,
    mimeType,
    originalWidth: original.width,
    originalHeight: original.height,
    requestWidth,
    requestHeight,
    encodedBytes: encodedBytes.byteLength,
    requestChars: dataUrl.length,
    dataUrl,
  };
  return {
    asset,
    ref: { eventHashId, frameRole, assetId },
  };
}

async function compareUnmarkedEventFrames(event: StudioRecordedEvent) {
  if (!event.screenshotBefore || !event.screenshotAfter) {
    return {
      algorithm: 'normalized-byte-sha256/v1' as const,
      result: 'unavailable' as const,
    };
  }
  const [before, after] = await Promise.all([
    prepareScreenshotAsset(event.screenshotBefore, event.hashId, 'before'),
    prepareScreenshotAsset(event.screenshotAfter, event.hashId, 'after'),
  ]);
  return {
    algorithm: 'normalized-byte-sha256/v1' as const,
    result:
      before.asset.assetId === after.asset.assetId
        ? ('identical' as const)
        : ('non-identical' as const),
  };
}

function getEventScreenshotCandidates(event: StudioRecordedEvent) {
  if (event.actionType === 'InitialNavigation') {
    if (event.screenshotAfter) {
      return [{ role: 'after' as const, screenshot: event.screenshotAfter }];
    }
    return event.screenshotBefore
      ? [{ role: 'before' as const, screenshot: event.screenshotBefore }]
      : [];
  }

  const before =
    event.screenshotBefore &&
    event.screenshotWithBox &&
    !event.mergedHashIds?.length
      ? {
          role: 'target-marked-before' as const,
          screenshot: event.screenshotWithBox,
        }
      : event.screenshotBefore
        ? { role: 'before' as const, screenshot: event.screenshotBefore }
        : undefined;
  const after = event.screenshotAfter
    ? { role: 'after' as const, screenshot: event.screenshotAfter }
    : undefined;
  return [before, after].filter(
    (candidate): candidate is NonNullable<typeof candidate> =>
      candidate !== undefined,
  );
}

function buildEventBase(
  event: StudioRecordedEvent,
  sequence: number,
  evidenceRefs: EvidenceRef[],
) {
  return {
    eventHashId: event.hashId,
    mergedEventHashIds: (event.mergedHashIds || []).filter(
      (hashId) => hashId !== event.hashId,
    ),
    sequence,
    timestamp: Number.isFinite(event.timestamp) ? event.timestamp : 0,
    ...(buildEvidenceTarget(event)
      ? { target: buildEvidenceTarget(event) }
      : {}),
    page: {
      ...(sanitizeUrl(event.url) ? { url: sanitizeUrl(event.url) } : {}),
      ...(event.title?.trim()
        ? { title: event.title.trim().slice(0, 300) }
        : {}),
      width: Math.max(1, Math.round(event.pageInfo?.width || 1)),
      height: Math.max(1, Math.round(event.pageInfo?.height || 1)),
    },
    ...(buildSemanticEvidence(event)
      ? { semantic: buildSemanticEvidence(event) }
      : {}),
    evidenceRefs,
  };
}

export async function buildStudioRecorderEvidenceBundle(
  session: StudioRecordingSession,
): Promise<SessionEvidenceBundle> {
  if (session.status !== 'completed') {
    throw new Error('Stop the recording before generating a knowledge base.');
  }

  const assetsById = new Map<string, ScreenshotAsset>();
  const events: EventEvidenceUnit[] = [];
  for (let index = 0; index < session.events.length; index += 1) {
    const event = session.events[index];
    if (event.type === 'setViewport' || event.actionType === 'Stop') {
      continue;
    }
    if (event.actionType === 'NavigationChanged') {
      continue;
    }
    const isInitialState = event.actionType === 'InitialNavigation';
    const nextEvent = session.events[index + 1];
    const prepared = await Promise.all(
      getEventScreenshotCandidates(event).map((candidate) =>
        prepareScreenshotAsset(
          candidate.screenshot,
          event.hashId,
          candidate.role,
        ),
      ),
    );
    const evidenceRefs = prepared.map(({ asset, ref }) => {
      assetsById.set(asset.assetId, asset);
      return ref;
    });
    if (evidenceRefs.length === 0) {
      throw new Error(
        `INVALID_RECORDER_EVENT: event ${event.hashId} has no usable screenshot.`,
      );
    }

    const base = buildEventBase(event, events.length, evidenceRefs);
    if (isInitialState) {
      events.push({ ...base, knowledgeRole: 'initial-state' });
      continue;
    }

    const action = buildRecordedActionEvidence(event);
    events.push({
      ...base,
      knowledgeRole: 'user-action',
      action,
      frameComparison: await compareUnmarkedEventFrames(event),
      ...(nextEvent?.actionType === 'NavigationChanged'
        ? {
            observedNavigation: {
              navigationEventHashId: nextEvent.hashId,
              ...(sanitizeUrl(event.url)
                ? { beforeUrl: sanitizeUrl(event.url) }
                : {}),
              ...(sanitizeUrl(nextEvent.url)
                ? { afterUrl: sanitizeUrl(nextEvent.url) }
                : {}),
              ...(nextEvent.title?.trim()
                ? { title: nextEvent.title.trim().slice(0, 300) }
                : {}),
              pageInfo: {
                width: Math.max(1, Math.round(nextEvent.pageInfo?.width || 1)),
                height: Math.max(
                  1,
                  Math.round(nextEvent.pageInfo?.height || 1),
                ),
              },
            },
          }
        : {}),
    });
  }

  const assets = Array.from(assetsById.values());
  const bundleWithoutStats = {
    schemaVersion: SESSION_EVIDENCE_SCHEMA_VERSION,
    session: {
      sessionId: session.id,
      platformId: session.target.platformId,
      createdAt: session.createdAt,
      ...(session.startedAt !== undefined
        ? { startedAt: session.startedAt }
        : {}),
      ...(session.stoppedAt !== undefined
        ? { endedAt: session.stoppedAt }
        : {}),
    },
    events,
    assets,
  };
  const inputStats = calculateUIKnowledgeInputStats(bundleWithoutStats);

  if (events.length === 0) {
    throw new Error(
      'Record at least one supported event before generating knowledge.',
    );
  }
  if (inputStats.textChars > MVP_KNOWLEDGE_INPUT_BUDGET.maxTextChars) {
    throw new Error(
      `INPUT_TOO_LARGE: ${inputStats.textChars} text characters exceed the MVP text budget. Record a shorter session.`,
    );
  }

  return sessionEvidenceBundleSchema.parse({
    ...bundleWithoutStats,
    inputStats,
  });
}

export function applyStudioRecorderEvidenceExclusions(
  bundle: SessionEvidenceBundle,
  decision: Pick<
    UIKnowledgeEgressDecision,
    'excludedAssetIds' | 'excludedEventHashIds'
  >,
): SessionEvidenceBundle {
  const availableAssetIds = new Set(
    bundle.assets.map((asset) => asset.assetId),
  );
  const availableEventHashIds = new Set(
    bundle.events.map((event) => event.eventHashId),
  );
  const excludedAssetIds = new Set(decision.excludedAssetIds);
  const excludedEventHashIds = new Set(decision.excludedEventHashIds);

  for (const assetId of excludedAssetIds) {
    if (!availableAssetIds.has(assetId)) {
      throw new Error(`INVALID_EXCLUSION: unknown screenshot ${assetId}.`);
    }
  }
  for (const eventHashId of excludedEventHashIds) {
    if (!availableEventHashIds.has(eventHashId)) {
      throw new Error(`INVALID_EXCLUSION: unknown event ${eventHashId}.`);
    }
  }

  const events = bundle.events
    .filter((event) => !excludedEventHashIds.has(event.eventHashId))
    .map((event) => ({
      ...event,
      evidenceRefs: event.evidenceRefs.filter(
        (ref) => !excludedAssetIds.has(ref.assetId),
      ),
    }));
  if (events.length === 0) {
    throw new Error(
      'INVALID_EXCLUSION: keep at least one event for knowledge generation.',
    );
  }
  const eventWithoutEvidence = events.find(
    (event) => event.evidenceRefs.length === 0,
  );
  if (eventWithoutEvidence) {
    throw new Error(
      `INVALID_EXCLUSION: event ${eventWithoutEvidence.eventHashId} has no screenshot left. Exclude the event or keep one of its screenshots.`,
    );
  }

  const referencedAssetIds = new Set(
    events.flatMap((event) =>
      event.evidenceRefs.map((evidenceRef) => evidenceRef.assetId),
    ),
  );
  const assets = bundle.assets.filter(
    (asset) =>
      referencedAssetIds.has(asset.assetId) &&
      !excludedAssetIds.has(asset.assetId),
  );
  const bundleWithoutStats = {
    schemaVersion: bundle.schemaVersion,
    session: bundle.session,
    events,
    assets,
  };
  const inputStats = calculateUIKnowledgeInputStats(bundleWithoutStats);

  if (inputStats.textChars > MVP_KNOWLEDGE_INPUT_BUDGET.maxTextChars) {
    throw new Error(
      'INPUT_TOO_LARGE: the selected evidence exceeds the knowledge MVP budget.',
    );
  }

  return sessionEvidenceBundleSchema.parse({
    ...bundleWithoutStats,
    inputStats,
  });
}

function markdownInline(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function renderStudioRecorderKnowledgeMarkdown(knowledge: UIKnowledge) {
  const lines = [
    '# 界面知识库',
    '',
    '> 本知识库只描述本次录制中有界面证据支持的内容和交互。',
    '',
    '## 内容罗列',
    '',
  ];

  for (const content of knowledge.contents) {
    lines.push(`- ${markdownInline(content.description)}`);
  }

  lines.push('', '## 预知交互', '');
  for (const interaction of knowledge.interactions) {
    lines.push(`- ${markdownInline(interaction.description)}`);
  }

  lines.push('', '## 跨页面效果', '');
  for (const navigation of knowledge.navigations) {
    lines.push(`- ${markdownInline(navigation.description)}`);
  }
  return `${lines.join('\n').trim()}\n`;
}

export async function generateStudioRecorderKnowledgeWithAI(
  session: StudioRecordingSession,
  options: {
    confirmEgress: (
      descriptor: ModelEgressDescriptor,
      evidenceBundle: SessionEvidenceBundle,
    ) => Promise<UIKnowledgeEgressDecision>;
  },
): Promise<UIKnowledgeArtifact | null> {
  const modelConfig = resolveStudioRecorderModelConfig();
  if (modelConfig.createOpenAIClient) {
    throw new Error(
      'OPAQUE_MODEL_CLIENT: knowledge generation requires a model endpoint that Studio can describe before uploading screenshots.',
    );
  }
  const evidenceBundle = await buildStudioRecorderEvidenceBundle(session);
  const runtime = requireStudioRuntime();
  if (
    typeof runtime.describeRecorderKnowledgeEgress !== 'function' ||
    typeof runtime.generateRecorderKnowledge !== 'function'
  ) {
    throw new Error('Studio knowledge generation bridge is unavailable.');
  }
  const serializableModelConfig =
    toSerializableStudioRecorderModelConfig(modelConfig);
  const { descriptor } = await runtime.describeRecorderKnowledgeEgress({
    modelConfig: serializableModelConfig,
  });
  if (descriptor.hasOpaqueCustomClient) {
    throw new Error(
      'OPAQUE_MODEL_CLIENT: the configured model route cannot be verified.',
    );
  }
  const decision = await options.confirmEgress(descriptor, evidenceBundle);
  if (!decision.confirmed) {
    return null;
  }
  const selectedEvidenceBundle = applyStudioRecorderEvidenceExclusions(
    evidenceBundle,
    decision,
  );
  const result = await runtime.generateRecorderKnowledge({
    descriptorId: descriptor.descriptorId,
    evidenceBundle: selectedEvidenceBundle,
    modelConfig: serializableModelConfig,
  });
  return {
    sessionId: session.id,
    sourceEvidenceRevision: session.evidenceRevision || 0,
    knowledge: result.knowledge,
    markdown: renderStudioRecorderKnowledgeMarkdown(result.knowledge),
    metadata: result.metadata,
  };
}
