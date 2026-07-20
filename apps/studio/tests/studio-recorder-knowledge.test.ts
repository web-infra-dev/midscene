/* @vitest-environment jsdom */

import { webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const aiMocks = vi.hoisted(() => ({
  callAIWithObjectResponse: vi.fn(),
  getModelRuntime: vi.fn((config) => ({ config })),
}));

vi.mock('@midscene/core/ai-model', () => ({
  AIResponseParseError: class AIResponseParseError extends Error {
    rawResponse: string;

    constructor(rawResponse: string) {
      super('Invalid AI response');
      this.rawResponse = rawResponse;
    }
  },
  callAIWithObjectResponse: aiMocks.callAIWithObjectResponse,
  getModelRuntime: aiMocks.getModelRuntime,
}));

vi.mock('@midscene/shared/img', () => ({
  imageInfoOfBase64: vi.fn(async () => ({ width: 640, height: 480 })),
  normalizeBase64Image: vi.fn((value: string) => value),
  parseBase64: vi.fn((value: string) => {
    const marker = ';base64,';
    const markerIndex = value.indexOf(marker);
    return {
      mimeType: value.slice('data:'.length, markerIndex),
      body: value.slice(markerIndex + marker.length),
    };
  }),
  resizeImgBase64: vi.fn(async (value: string) => value),
}));

import type { IModelConfig } from '@midscene/shared/env';
import {
  describeRecorderKnowledgeEgressInMain,
  generateRecorderKnowledgeInMain,
} from '../src/main/recorder/knowledge-generator';
import {
  applyStudioRecorderEvidenceExclusions,
  buildStudioRecorderEvidenceBundle,
  renderStudioRecorderKnowledgeMarkdown,
} from '../src/renderer/recorder/knowledge';
import type { StudioRecordingSession } from '../src/renderer/recorder/types';
import {
  EVENT_VISUAL_OBSERVATION_DRAFT_JSON_SCHEMA,
  type UIKnowledge,
  UI_KNOWLEDGE_DRAFT_JSON_SCHEMA,
} from '../src/shared/ui-knowledge-contract';

const BEFORE_SCREENSHOT = 'data:image/png;base64,AQIDBA==';
const AFTER_SCREENSHOT = 'data:image/png;base64,BQYHCA==';

function createCompletedSession(
  overrides: Partial<StudioRecordingSession> = {},
): StudioRecordingSession {
  return {
    id: 'session-1',
    name: 'Knowledge fixture',
    description: '',
    status: 'completed',
    target: {
      platformId: 'web',
      values: {},
    },
    events: [
      {
        hashId: 'event-1',
        mergedHashIds: ['event-1', 'event-2'],
        timestamp: 1,
        type: 'click',
        actionType: 'Tap',
        actionTypeOrigin: 'recorded',
        rawPayload: { actionType: 'Tap', x: 20, y: 30 },
        target: {
          platformId: 'web',
          values: {},
        },
        platformId: 'web',
        pageInfo: { width: 640, height: 480 },
        screenshotBefore: BEFORE_SCREENSHOT,
        screenshotAfter: AFTER_SCREENSHOT,
      },
    ],
    evidenceRevision: 2,
    createdAt: 1,
    updatedAt: 2,
    startedAt: 1,
    stoppedAt: 2,
    ...overrides,
  } as StudioRecordingSession;
}

function createEventObservationResponse(messages: unknown[]) {
  const systemPrompt = messages.find(
    (message) =>
      typeof message === 'object' &&
      message !== null &&
      'role' in message &&
      message.role === 'system',
  ) as { content?: unknown } | undefined;
  if (
    typeof systemPrompt?.content !== 'string' ||
    !systemPrompt.content.includes('逐事件 UI 观察器')
  ) {
    return null;
  }

  const userMessage = messages.find(
    (message) =>
      typeof message === 'object' &&
      message !== null &&
      'role' in message &&
      message.role === 'user',
  ) as { content?: unknown } | undefined;
  const text = Array.isArray(userMessage?.content)
    ? userMessage.content
        .filter(
          (part): part is { type: 'text'; text: string } =>
            typeof part === 'object' &&
            part !== null &&
            'type' in part &&
            part.type === 'text' &&
            'text' in part &&
            typeof part.text === 'string',
        )
        .map((part) => part.text)
        .join('\n')
    : '';
  const frameRoles = Array.from(
    text.matchAll(/FRAME (before|after|target-marked-before) \/ /g),
    (match) => match[1],
  );
  const isInitialState = text.includes('"knowledgeRole": "initial-state"');
  const hasBefore = frameRoles.some(
    (frameRole) =>
      frameRole === 'before' || frameRole === 'target-marked-before',
  );
  const hasAfter = frameRoles.includes('after');
  return {
    beforePage: hasBefore ? '搜索页' : '',
    beforeComponents: hasBefore ? ['页面主内容区：搜索输入框'] : [],
    afterPage: hasAfter ? '搜索页' : '',
    afterComponents: hasAfter ? ['页面主内容区：搜索输入框和搜索结果区域'] : [],
    change: isInitialState ? '显示初始页面状态' : '操作后页面显示搜索结果',
  };
}

function mockKnowledgePipeline(...synthesisDrafts: unknown[]) {
  let synthesisIndex = 0;
  aiMocks.callAIWithObjectResponse.mockImplementation(
    async (messages: unknown[]) => {
      const observation = createEventObservationResponse(messages);
      const content = observation ?? synthesisDrafts[synthesisIndex++];
      if (!content) {
        throw new Error('Missing mocked synthesis response.');
      }
      return {
        content,
        contentString: JSON.stringify(content),
        usage: undefined,
      };
    },
  );
}

beforeEach(() => {
  aiMocks.callAIWithObjectResponse.mockReset();
  aiMocks.getModelRuntime.mockClear();
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: webcrypto,
  });
  vi.stubEnv('MIDSCENE_LANGSMITH_DEBUG', 'false');
  vi.stubEnv('MIDSCENE_LANGFUSE_DEBUG', 'false');
});

describe('Studio recorder UI knowledge evidence', () => {
  it('accepts materialized and legacy single-frame screenshots', async () => {
    const baseEvent = createCompletedSession().events[0];
    const bundle = await buildStudioRecorderEvidenceBundle(
      createCompletedSession({
        events: [
          {
            ...baseEvent,
            hashId: 'initial-navigation',
            mergedHashIds: [],
            type: 'navigation',
            actionType: 'InitialNavigation',
            rawPayload: {
              actionType: 'InitialNavigation',
              url: 'https://example.com',
            },
            screenshotBefore: undefined,
            screenshotAfter: undefined,
            screenshotWithBox: BEFORE_SCREENSHOT,
          },
          {
            ...baseEvent,
            hashId: 'asset-backed-click',
            mergedHashIds: [],
            screenshotBefore: undefined,
            screenshotAfter: undefined,
            screenshotWithBox: AFTER_SCREENSHOT,
          },
        ],
      }),
    );

    expect(bundle.events).toMatchObject([
      {
        eventHashId: 'initial-navigation',
        knowledgeRole: 'initial-state',
        evidenceRefs: [expect.objectContaining({ frameRole: 'after' })],
      },
      {
        eventHashId: 'asset-backed-click',
        knowledgeRole: 'user-action',
        evidenceRefs: [
          expect.objectContaining({ frameRole: 'target-marked-before' }),
        ],
      },
    ]);
  });

  it('keeps exact action identity and removes the canonical ID from merged lineage', async () => {
    const bundle = await buildStudioRecorderEvidenceBundle(
      createCompletedSession(),
    );

    expect(bundle.events).toHaveLength(1);
    expect(bundle.events[0]).toMatchObject({
      eventHashId: 'event-1',
      mergedEventHashIds: ['event-2'],
      knowledgeRole: 'user-action',
      action: {
        name: 'Tap',
        eventType: 'click',
        observedParams: { kind: 'point' },
      },
      frameComparison: {
        algorithm: 'normalized-byte-sha256/v1',
        result: 'non-identical',
      },
    });
    expect(bundle.inputStats).toMatchObject({
      eligibleEventCount: 1,
      imageReferenceCount: 2,
      uniqueImageCount: 2,
    });
  });

  it('folds a completed navigation update into the preceding user action', async () => {
    const actionEvent = {
      ...createCompletedSession().events[0],
      hashId: 'tap-search',
      mergedHashIds: [],
      url: 'https://example.com/search?draft=1',
    };
    const completedNavigation = {
      ...actionEvent,
      hashId: 'navigation-after-search',
      type: 'navigation' as const,
      actionType: 'Navigate',
      actionTypeOrigin: 'fallback' as const,
      rawPayload: {
        actionType: 'Navigate',
        afterUrl: 'https://example.com/results?q=midscene',
        navigationCompleted: true,
      },
      url: 'https://example.com/results?q=midscene',
      title: 'Search results',
      screenshotBefore: undefined,
      screenshotAfter: undefined,
      screenshotWithBox: undefined,
    };

    const bundle = await buildStudioRecorderEvidenceBundle(
      createCompletedSession({
        events: [actionEvent, completedNavigation],
      }),
    );

    expect(bundle.events).toHaveLength(1);
    expect(bundle.events[0]).toMatchObject({
      eventHashId: 'tap-search',
      observedNavigation: {
        navigationEventHashId: 'navigation-after-search',
        beforeUrl: 'https://example.com/search',
        afterUrl: 'https://example.com/results',
        title: 'Search results',
      },
    });
  });

  it('links a delayed completed navigation through merged event lineage', async () => {
    const baseEvent = createCompletedSession().events[0];
    const triggerEvent = {
      ...baseEvent,
      hashId: 'merged-input',
      mergedHashIds: ['merged-input', 'raw-input'],
      url: 'https://example.com/form',
    };
    const unrelatedEvent = {
      ...baseEvent,
      hashId: 'unrelated-tap',
      mergedHashIds: [],
      timestamp: 2,
    };
    const completedNavigation = {
      ...baseEvent,
      hashId: 'delayed-navigation',
      mergedHashIds: [],
      timestamp: 3,
      type: 'navigation' as const,
      actionType: 'Navigate',
      actionTypeOrigin: 'fallback' as const,
      rawPayload: {
        actionType: 'Navigate',
        triggerEventHashId: 'raw-input',
        afterUrl: 'https://example.com/complete?token=redacted',
        navigationCompleted: true,
      },
      url: 'https://example.com/complete?token=redacted',
      screenshotBefore: undefined,
      screenshotAfter: undefined,
      screenshotWithBox: undefined,
    };

    const bundle = await buildStudioRecorderEvidenceBundle(
      createCompletedSession({
        events: [triggerEvent, unrelatedEvent, completedNavigation],
      }),
    );

    expect(bundle.events).toHaveLength(2);
    expect(bundle.events[0]).toMatchObject({
      eventHashId: 'merged-input',
      mergedEventHashIds: ['raw-input'],
      observedNavigation: {
        navigationEventHashId: 'delayed-navigation',
        afterUrl: 'https://example.com/complete',
      },
    });
    expect(bundle.events[1]).not.toHaveProperty('observedNavigation');
  });

  it('rejects provided invalid action parameters instead of replacing them with defaults', async () => {
    const session = createCompletedSession({
      events: [
        {
          ...createCompletedSession().events[0],
          type: 'drag',
          actionType: 'Swipe',
          rawPayload: {
            actionType: 'Swipe',
            x: 10,
            y: 20,
            endX: 30,
            endY: 40,
            repeat: 0,
          },
        },
      ],
    });

    await expect(buildStudioRecorderEvidenceBundle(session)).rejects.toThrow(
      'invalid duration or repeat',
    );
  });

  it('applies screenshot exclusions globally and reruns preflight', async () => {
    const bundle = await buildStudioRecorderEvidenceBundle(
      createCompletedSession(),
    );
    const beforeAssetId = bundle.events[0].evidenceRefs.find(
      (ref) => ref.frameRole === 'before',
    )?.assetId;
    expect(beforeAssetId).toBeTruthy();

    const selected = applyStudioRecorderEvidenceExclusions(bundle, {
      excludedAssetIds: [beforeAssetId!],
      excludedEventHashIds: [],
    });
    expect(selected.assets).toHaveLength(1);
    expect(selected.events[0].evidenceRefs).toHaveLength(1);
    expect(selected.inputStats.uniqueImageCount).toBe(1);

    expect(() =>
      applyStudioRecorderEvidenceExclusions(bundle, {
        excludedAssetIds: bundle.assets.map((asset) => asset.assetId),
        excludedEventHashIds: [],
      }),
    ).toThrow('has no screenshot left');
  });
});

describe('Studio recorder UI knowledge generation', () => {
  it('derives the model JSON Schema from the Zod output contract', () => {
    expect(EVENT_VISUAL_OBSERVATION_DRAFT_JSON_SCHEMA).toMatchObject({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
      required: [
        'beforePage',
        'beforeComponents',
        'afterPage',
        'afterComponents',
        'change',
      ],
      properties: {
        beforePage: {
          type: 'string',
          description: expect.stringContaining('操作前截图'),
        },
        beforeComponents: {
          type: 'array',
          description: expect.stringContaining('方位或区域'),
          items: { description: expect.stringContaining('可见区域或组件') },
        },
        afterPage: {
          type: 'string',
          description: expect.stringContaining('操作后截图'),
        },
        afterComponents: {
          type: 'array',
          description: expect.stringContaining('方位或区域'),
          items: { description: expect.stringContaining('可见区域或组件') },
        },
        change: {
          type: 'string',
          description: expect.stringContaining('页面发生了什么可见变化'),
        },
      },
    });
    expect(UI_KNOWLEDGE_DRAFT_JSON_SCHEMA).toMatchObject({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      required: ['contents', 'interactions', 'navigations'],
      properties: {
        contents: {
          type: 'array',
          description: expect.stringContaining('页面内容知识'),
        },
        interactions: {
          type: 'array',
          description: expect.stringContaining(
            '目标组件 + 交互方式 + 组件变化',
          ),
        },
        navigations: {
          type: 'array',
          description: expect.stringContaining(
            '目标组件 + 交互方式 + 目标页面',
          ),
        },
      },
    });
  });

  it('accepts input above the former event, image, and image-payload caps', async () => {
    const baseEvent = createCompletedSession().events[0];
    const imagePadding = 'x'.repeat(30_000);
    const session = createCompletedSession({
      events: Array.from({ length: 11 }, (_, index) => ({
        ...baseEvent,
        hashId: `event-${index + 1}`,
        mergedHashIds: [],
        timestamp: index + 1,
        rawPayload: {
          actionType: 'Tap',
          x: 20 + index,
          y: 30 + index,
        },
        screenshotBefore: `data:image/png;base64,${Buffer.from(
          `before-${index}-${imagePadding}`,
        ).toString('base64')}`,
        screenshotAfter: `data:image/png;base64,${Buffer.from(
          `after-${index}-${imagePadding}`,
        ).toString('base64')}`,
      })),
    });
    const bundle = await buildStudioRecorderEvidenceBundle(session);
    expect(bundle.inputStats).toMatchObject({
      eligibleEventCount: 11,
      uniqueImageCount: 22,
    });
    expect(bundle.inputStats.totalImageDataUrlChars).toBeGreaterThan(600_000);

    const draft = {
      contents: ['页面主内容区：包含录制内容'],
      interactions: [],
      navigations: [],
    };
    mockKnowledgePipeline(draft);
    const modelConfig = {
      modelName: 'fixture-vlm',
      openaiBaseURL: 'https://models.example.test/v1',
      openaiApiKey: 'test-key',
    } as unknown as IModelConfig;
    const descriptor = describeRecorderKnowledgeEgressInMain({
      modelConfig,
    }).descriptor;

    const result = await generateRecorderKnowledgeInMain({
      descriptorId: descriptor.descriptorId,
      evidenceBundle: bundle,
      modelConfig,
    });

    expect(aiMocks.callAIWithObjectResponse).toHaveBeenCalledTimes(12);
    const assetById = new Map(
      bundle.assets.map((asset) => [asset.assetId, asset]),
    );
    for (const [index, event] of bundle.events.entries()) {
      const messages = aiMocks.callAIWithObjectResponse.mock.calls[index][0];
      const userMessage = messages.find((message) => message.role === 'user');
      const parts = Array.isArray(userMessage?.content)
        ? userMessage.content
        : [];
      const eventText = parts
        .filter(
          (part): part is { type: 'text'; text: string } =>
            typeof part === 'object' &&
            part !== null &&
            part.type === 'text' &&
            'text' in part &&
            typeof part.text === 'string',
        )
        .map((part) => part.text)
        .join('\n');
      const imageUrls = parts.flatMap((part) =>
        typeof part === 'object' &&
        part !== null &&
        part.type === 'image_url' &&
        'image_url' in part &&
        typeof part.image_url === 'object' &&
        part.image_url !== null &&
        'url' in part.image_url &&
        typeof part.image_url.url === 'string'
          ? [part.image_url.url]
          : [],
      );

      expect(eventText).toContain(`\"eventHashId\": \"${event.eventHashId}\"`);
      expect(imageUrls).toEqual(
        event.evidenceRefs.map((ref) => assetById.get(ref.assetId)?.dataUrl),
      );
    }
    const synthesisMessages =
      aiMocks.callAIWithObjectResponse.mock.calls.at(-1)?.[0] ?? [];
    expect(
      synthesisMessages.every(
        (message) =>
          !Array.isArray(message.content) ||
          message.content.every(
            (part) =>
              typeof part !== 'object' ||
              part === null ||
              part.type !== 'image_url',
          ),
      ),
    ).toBe(true);
    expect(result.knowledge.contents).toHaveLength(1);
    expect(result.knowledge.contents[0].evidenceRefs).toHaveLength(22);
  });

  it('uses the Midscene object-response path, enriches actions, and leaves semantic rules to the prompt', async () => {
    const bundle = await buildStudioRecorderEvidenceBundle(
      createCompletedSession(),
    );
    const draft = {
      contents: ['页面主内容区：搜索输入框和搜索结果区域'],
      interactions: [
        {
          eventIndex: 1,
          description: '点击搜索输入框后，页面显示搜索结果',
        },
      ],
      navigations: [],
    };
    mockKnowledgePipeline(draft);
    const modelConfig = {
      modelName: 'fixture-vlm',
      openaiBaseURL: 'https://models.example.test/v1',
      openaiApiKey: 'test-key',
    } as unknown as IModelConfig;
    const descriptor = describeRecorderKnowledgeEgressInMain({
      modelConfig,
    }).descriptor;

    const result = await generateRecorderKnowledgeInMain({
      descriptorId: descriptor.descriptorId,
      evidenceBundle: bundle,
      modelConfig,
    });

    expect(aiMocks.callAIWithObjectResponse).toHaveBeenCalledTimes(2);
    const observationMessages =
      aiMocks.callAIWithObjectResponse.mock.calls[0][0];
    expect(observationMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'system',
          content: expect.stringContaining(
            JSON.stringify(EVENT_VISUAL_OBSERVATION_DRAFT_JSON_SCHEMA, null, 2),
          ),
        }),
        expect.objectContaining({
          role: 'user',
          content: expect.arrayContaining([
            expect.objectContaining({
              type: 'text',
              text: expect.stringContaining('FRAME before'),
            }),
            expect.objectContaining({ type: 'image_url' }),
          ]),
        }),
      ]),
    );

    const synthesisMessages = aiMocks.callAIWithObjectResponse.mock.calls[1][0];
    expect(synthesisMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'system',
          content: expect.stringContaining(
            JSON.stringify(UI_KNOWLEDGE_DRAFT_JSON_SCHEMA, null, 2),
          ),
        }),
        expect.objectContaining({
          role: 'system',
          content: expect.stringContaining('页面知识 = 页面方位 + 区域 + 组件'),
        }),
        expect.objectContaining({
          role: 'system',
          content: expect.stringContaining(
            '交互知识 = 目标组件 + 交互方式 + 组件变化',
          ),
        }),
        expect.objectContaining({
          role: 'system',
          content: expect.stringContaining(
            '跨页知识 = 目标组件 + 交互方式 + 目标页面',
          ),
        }),
        expect.objectContaining({
          role: 'system',
          content: expect.stringContaining('合并相同组件和相同效果的重复事件'),
        }),
        expect.objectContaining({
          role: 'user',
          content: expect.arrayContaining([
            expect.objectContaining({
              type: 'text',
              text: expect.stringContaining('<event_observations>'),
            }),
          ]),
        }),
      ]),
    );
    const synthesisUserMessage = synthesisMessages.find(
      (message) => message.role === 'user',
    );
    expect(
      Array.isArray(synthesisUserMessage?.content) &&
        synthesisUserMessage.content.every(
          (part) => typeof part === 'object' && part?.type !== 'image_url',
        ),
    ).toBe(true);
    const synthesisUserContent = JSON.stringify(synthesisUserMessage?.content);
    expect(synthesisUserContent).toContain('EVENT_INDEX 1');
    expect(synthesisUserContent).toContain('\\"actionName\\": \\"Tap\\"');
    expect(synthesisUserContent).not.toContain('eventHashId');
    expect(synthesisUserContent).not.toContain('evidenceRefs');
    expect(aiMocks.getModelRuntime).toHaveBeenCalledWith(
      expect.objectContaining({ retryCount: 0 }),
    );
    expect(result.knowledge.interactions[0].sourceAction).toEqual({
      eventHashId: 'event-1',
      name: 'Tap',
      eventType: 'click',
      observedParams: { kind: 'point' },
    });
    expect(result.knowledge).toMatchObject({
      schemaVersion: 'ui-knowledge/v1',
      sessionId: 'session-1',
      contents: [{ description: '页面主内容区：搜索输入框和搜索结果区域' }],
      interactions: [
        {
          eventIndex: 1,
          description: '点击搜索输入框后，页面显示搜索结果',
          primaryProductCapabilityType: 'other',
          primaryEffectType: 'update-content',
        },
      ],
      navigations: [],
    });
  });

  it('only validates that the three synthesis arrays exist', async () => {
    const bundle = await buildStudioRecorderEvidenceBundle(
      createCompletedSession(),
    );
    mockKnowledgePipeline({ contents: [], interactions: [] });
    const modelConfig = {
      modelName: 'fixture-vlm',
      openaiBaseURL: 'https://models.example.test/v1',
      openaiApiKey: 'test-key',
    } as unknown as IModelConfig;
    const descriptor = describeRecorderKnowledgeEgressInMain({
      modelConfig,
    }).descriptor;

    await expect(
      generateRecorderKnowledgeInMain({
        descriptorId: descriptor.descriptorId,
        evidenceBundle: bundle,
        modelConfig,
      }),
    ).rejects.toThrow(
      'must return contents, interactions, and navigations arrays',
    );
  });

  it('describes the effective endpoint and rejects opaque routing overrides', () => {
    const descriptor = describeRecorderKnowledgeEgressInMain({
      modelConfig: {
        modelName: 'fixture-vlm',
        openaiBaseURL: 'https://configured.example.test/v1',
        openaiExtraConfig: {
          baseURL: 'https://effective.example.test/v2',
        },
      } as unknown as IModelConfig,
    }).descriptor;
    expect(descriptor.endpointOrigin).toBe('https://effective.example.test');

    const opaqueDescriptor = describeRecorderKnowledgeEgressInMain({
      modelConfig: {
        modelName: 'fixture-vlm',
        openaiBaseURL: 'https://configured.example.test/v1',
        openaiExtraConfig: { fetchOptions: {} },
      } as unknown as IModelConfig,
    }).descriptor;
    expect(opaqueDescriptor.hasOpaqueCustomClient).toBe(true);

    expect(() =>
      describeRecorderKnowledgeEgressInMain({
        modelConfig: {
          modelName: 'overridden-model',
          extraBody: { model: 'different-model' },
        } as unknown as IModelConfig,
      }),
    ).toThrow('does not allow extraBody');
  });
});

describe('Studio recorder knowledge Markdown', () => {
  it('renders the three model-owned knowledge collections', () => {
    const knowledge = {
      schemaVersion: 'ui-knowledge/v1',
      sessionId: 'session-1',
      contents: [
        {
          description: '页面主内容区：显示搜索框\n## injected',
          evidenceRefs: [],
        },
      ],
      interactions: [
        {
          eventIndex: 1,
          description: '点击搜索输入框后，显示结果列表\n## injected',
          sourceAction: {
            eventHashId: 'event-1',
            name: 'Tap',
            eventType: 'click',
            observedParams: { kind: 'point' },
          },
          evidenceRefs: [],
          primaryProductCapabilityType: 'other',
          primaryEffectType: 'update-content',
        },
      ],
      navigations: [
        {
          eventIndex: 2,
          description: '点击下一步按钮后，进入结果页',
          sourceAction: {
            eventHashId: 'event-2',
            name: 'Tap',
            eventType: 'click',
            observedParams: { kind: 'point' },
          },
          evidenceRefs: [],
          primaryProductCapabilityType: 'navigate',
          primaryEffectType: 'update-content',
        },
      ],
    } as UIKnowledge;

    const markdown = renderStudioRecorderKnowledgeMarkdown(knowledge);
    expect(markdown.match(/^## /gm)).toHaveLength(3);
    expect(markdown).toContain('- 点击搜索输入框后，显示结果列表 ## injected');
    expect(markdown).toContain('- 点击下一步按钮后，进入结果页');
    expect(markdown).not.toContain('\n## injected');
  });
});
