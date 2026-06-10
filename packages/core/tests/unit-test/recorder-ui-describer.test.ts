import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  describeRecorderUIEvent,
  describeRecorderUIEvents,
  getRecorderUIEventTargetRect,
} from '../../src/ai-model';
import { callAIWithObjectResponse } from '../../src/ai-model/service-caller';

vi.mock('../../src/ai-model/service-caller', () => ({
  callAIWithObjectResponse: vi.fn(),
}));

const modelConfig = {
  modelName: 'mock',
  modelDescription: 'mock',
  intent: 'default',
  slot: 'default',
} as const;

const screenshot =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lBtrWQAAAABJRU5ErkJggg==';

describe('recorder-ui-describer', () => {
  beforeEach(() => {
    vi.mocked(callAIWithObjectResponse).mockReset();
  });

  it('converts point-only recorder events into bounded target rectangles', () => {
    const rect = getRecorderUIEventTargetRect({
      type: 'click',
      source: 'studio-preview',
      timestamp: 1000,
      hashId: 'click-1',
      pageInfo: { width: 100, height: 80 },
      elementRect: { x: 4, y: 6 },
    });

    expect(rect).toEqual({
      left: 0,
      top: 0,
      width: 36,
      height: 36,
    });
  });

  it('marks events without screenshots as heuristic descriptions', async () => {
    const result = await describeRecorderUIEvent(
      {
        event: {
          type: 'click',
          source: 'studio-preview',
          timestamp: 1000,
          hashId: 'click-1',
          pageInfo: { width: 1280, height: 720 },
          elementRect: { x: 120, y: 160 },
        },
        target: {
          platformId: 'computer',
          label: 'DELL U2720Q',
          values: { displayId: '2' },
        },
      },
      modelConfig,
    );

    expect(result.usedFallback).toBe(true);
    expect(result.event.semantic).toMatchObject({
      source: 'heuristic',
      status: 'ready',
      error: 'Recorder event has no screenshot.',
      elementDescription: 'control on the current desktop screen',
      replayInstruction:
        'Click on the element described as "control on the current desktop screen".',
      confidence: 'low',
    });
  });

  it('keeps batch result order when falling back', async () => {
    const results = await describeRecorderUIEvents(
      [
        {
          event: {
            type: 'scroll',
            source: 'studio-preview',
            timestamp: 1000,
            hashId: 'scroll-1',
            pageInfo: { width: 1280, height: 720 },
            elementRect: { x: 240, y: 360 },
          },
        },
        {
          event: {
            type: 'input',
            source: 'studio-preview',
            timestamp: 2000,
            hashId: 'input-1',
            pageInfo: { width: 1280, height: 720 },
            elementRect: { x: 320, y: 200 },
          },
        },
      ],
      modelConfig,
      { concurrency: 2 },
    );

    expect(results.map((result) => result.event.hashId)).toEqual([
      'scroll-1',
      'input-1',
    ]);
    expect(results.map((result) => result.event.semantic?.source)).toEqual([
      'heuristic',
      'heuristic',
    ]);
  });

  it('rejects coordinate-based AI descriptions for click events', async () => {
    vi.mocked(callAIWithObjectResponse).mockResolvedValueOnce({
      content: {
        elementDescription: 'element near coordinates (537, 450)',
        replayInstruction: 'Click on the element near coordinates (537, 450).',
        actionSummary: 'Click nearby element',
        confidence: 'low',
      },
    } as any);

    const result = await describeRecorderUIEvent(
      {
        event: {
          type: 'click',
          source: 'studio-preview',
          timestamp: 1000,
          hashId: 'click-weak',
          pageInfo: { width: 1280, height: 720 },
          elementRect: { x: 537, y: 450 },
          title: 'Semi Design Form',
          screenshotWithBox: screenshot,
        },
      },
      modelConfig,
      { maxRetries: 1 },
    );

    expect(result.usedFallback).toBe(true);
    expect(result.event.semantic).toMatchObject({
      source: 'heuristic',
      error: 'AI returned a weak recorder event description.',
      elementDescription: 'control in Semi Design Form',
    });
  });

  it.each([
    [
      'Tap',
      'Tap on the element described as "Settings menu item".',
      'Tap Settings menu item',
    ],
    [
      'DoubleClick',
      'Double click on the element described as "Settings menu item".',
      'Double click Settings menu item',
    ],
    [
      'LongPress',
      'Long press the element described as "Settings menu item".',
      'Long press Settings menu item',
    ],
    [
      'RightClick',
      'Right click on the element described as "Settings menu item".',
      'Right click Settings menu item',
    ],
  ])(
    'preserves %s semantics in generated fallback replay text',
    async (actionType, replayInstruction, actionSummary) => {
      vi.mocked(callAIWithObjectResponse).mockResolvedValueOnce({
        content: {
          elementDescription: 'Settings menu item',
          confidence: 'high',
        },
      } as any);

      const result = await describeRecorderUIEvent(
        {
          event: {
            type: 'click',
            actionType,
            source: 'studio-preview',
            timestamp: 1000,
            hashId: `click-${actionType}`,
            pageInfo: { width: 1280, height: 720 },
            elementRect: { x: 537, y: 450 },
            screenshotWithBox: screenshot,
          },
        },
        modelConfig,
        { maxRetries: 1 },
      );

      expect(result.usedFallback).toBe(false);
      expect(result.event.semantic?.replayInstruction).toBe(replayInstruction);
      expect(result.event.semantic?.actionSummary).toBe(actionSummary);
    },
  );

  it.each([
    [
      'Tap',
      'Tap on the element described as "Settings menu item".',
      'Tap Settings menu item',
    ],
    [
      'DoubleClick',
      'Double click on the element described as "Settings menu item".',
      'Double click Settings menu item',
    ],
    [
      'LongPress',
      'Long press the element described as "Settings menu item".',
      'Long press Settings menu item',
    ],
    [
      'RightClick',
      'Right click on the element described as "Settings menu item".',
      'Right click Settings menu item',
    ],
  ])(
    'rewrites AI click replay text to preserve %s semantics',
    async (actionType, replayInstruction, actionSummary) => {
      vi.mocked(callAIWithObjectResponse).mockResolvedValueOnce({
        content: {
          elementDescription: 'Settings menu item',
          replayInstruction:
            'Click on the element described as "Settings menu item".',
          actionSummary: 'Click Settings menu item',
          confidence: 'high',
        },
      } as any);

      const result = await describeRecorderUIEvent(
        {
          event: {
            type: 'click',
            actionType,
            source: 'studio-preview',
            timestamp: 1000,
            hashId: `click-ai-${actionType}`,
            pageInfo: { width: 1280, height: 720 },
            elementRect: { x: 537, y: 450 },
            screenshotWithBox: screenshot,
          },
        },
        modelConfig,
        { maxRetries: 1 },
      );

      expect(result.usedFallback).toBe(false);
      expect(result.event.semantic?.replayInstruction).toBe(replayInstruction);
      expect(result.event.semantic?.actionSummary).toBe(actionSummary);
    },
  );

  it('rewrites AI drag replay text to preserve Swipe semantics', async () => {
    vi.mocked(callAIWithObjectResponse).mockResolvedValueOnce({
      content: {
        elementDescription: 'Notifications list',
        replayInstruction:
          'Drag through the area described as "Notifications list".',
        actionSummary: 'Drag Notifications list',
        confidence: 'high',
      },
    } as any);

    const result = await describeRecorderUIEvent(
      {
        event: {
          type: 'drag',
          actionType: 'Swipe',
          source: 'studio-preview',
          timestamp: 1000,
          hashId: 'swipe-ai-drag',
          value: 'down 509',
          pageInfo: { width: 1280, height: 720 },
          elementRect: { x: 537, y: 450 },
          screenshotWithBox: screenshot,
        },
      },
      modelConfig,
      { maxRetries: 1 },
    );

    expect(result.usedFallback).toBe(false);
    expect(result.event.semantic?.replayInstruction).toBe(
      'Swipe through the area described as "Notifications list".',
    );
    expect(result.event.semantic?.actionSummary).toBe(
      'Swipe Notifications list',
    );
  });

  it('accepts semantic scroll descriptions with page context', async () => {
    vi.mocked(callAIWithObjectResponse).mockResolvedValueOnce({
      content: {
        elementDescription:
          '集成到 Playwright - Midscene - Vision-Driven UI Automation page',
        scrollDestinationDescription: 'API reference section',
        replayInstruction:
          'Scroll the page/region with description "集成到 Playwright - Midscene - Vision-Driven UI Automation page" by value "0,514" until "API reference section" is visible.',
        actionSummary:
          'Scroll 集成到 Playwright - Midscene - Vision-Driven UI Automation page toward API reference section',
        confidence: 'high',
      },
    } as any);

    const result = await describeRecorderUIEvent(
      {
        event: {
          type: 'scroll',
          source: 'studio-preview',
          timestamp: 1000,
          hashId: 'scroll-semantic',
          value: '0,514',
          pageInfo: { width: 1280, height: 720 },
          elementRect: { x: 600, y: 520 },
          title: '集成到 Playwright - Midscene - Vision-Driven UI Automation',
          screenshotWithBox: screenshot,
        },
      },
      modelConfig,
      { maxRetries: 1 },
    );

    expect(result.usedFallback).toBe(false);
    expect(result.event.semantic?.elementDescription).toBe(
      '集成到 Playwright - Midscene - Vision-Driven UI Automation page',
    );
    expect(result.event.semantic?.replayInstruction).toBe(
      'Scroll the page/region with description "集成到 Playwright - Midscene - Vision-Driven UI Automation page" by value "0,514" until "API reference section" is visible.',
    );
    expect(result.event.semantic?.actionSummary).toBe(
      'Scroll 集成到 Playwright - Midscene - Vision-Driven UI Automation page toward API reference section',
    );
  });

  it('rejects scroll descriptions without a replay destination', async () => {
    vi.mocked(callAIWithObjectResponse).mockResolvedValueOnce({
      content: {
        elementDescription: 'Android - 开始使用 documentation page',
        replayInstruction:
          'Scroll the page/region with description "Android - 开始使用 documentation page" by value "down 509".',
        actionSummary: 'Scroll Android - 开始使用 documentation page',
        confidence: 'medium',
      },
    } as any);

    const result = await describeRecorderUIEvent(
      {
        event: {
          type: 'scroll',
          source: 'studio-preview',
          timestamp: 1000,
          hashId: 'scroll-without-destination',
          value: 'down 509',
          pageInfo: { width: 1280, height: 720 },
          elementRect: { x: 600, y: 520 },
          title: 'Android - 开始使用 documentation page',
          screenshotWithBox: screenshot,
          screenshotAfter: screenshot,
        },
      },
      modelConfig,
      { maxRetries: 1 },
    );

    expect(result.usedFallback).toBe(true);
    expect(result.event.semantic?.error).toBe(
      'AI returned a scroll description without a destination.',
    );
  });

  it('rejects scroll descriptions with a generic destination', async () => {
    vi.mocked(callAIWithObjectResponse).mockResolvedValueOnce({
      content: {
        elementDescription: 'Android settings page',
        scrollDestinationDescription: 'more content',
        replayInstruction:
          'Scroll the page/region with description "Android settings page" by value "down 509" until "more content" is visible.',
        actionSummary: 'Scroll Android settings page toward more content',
        confidence: 'medium',
      },
    } as any);

    const result = await describeRecorderUIEvent(
      {
        event: {
          type: 'scroll',
          source: 'studio-preview',
          timestamp: 1000,
          hashId: 'scroll-generic-destination',
          value: 'down 509',
          pageInfo: { width: 1280, height: 720 },
          elementRect: { x: 600, y: 520 },
          title: 'Android settings',
          screenshotWithBox: screenshot,
          screenshotAfter: screenshot,
        },
      },
      modelConfig,
      { maxRetries: 1 },
    );

    expect(result.usedFallback).toBe(true);
    expect(result.event.semantic?.error).toBe(
      'AI returned a scroll description without a destination.',
    );
    expect(result.event.semantic?.elementDescription).toBe(
      'Android settings scrollable content',
    );
  });

  it('accepts semantic input field descriptions and preserves the typed value', async () => {
    vi.mocked(callAIWithObjectResponse).mockResolvedValueOnce({
      content: {
        elementDescription: '数量 input in the basic form',
        replayInstruction:
          'Input "2" into the element described as "数量 input in the basic form".',
        actionSummary: 'Input into 数量 input in the basic form',
        confidence: 'high',
      },
    } as any);

    const result = await describeRecorderUIEvent(
      {
        event: {
          type: 'input',
          source: 'studio-preview',
          timestamp: 1000,
          hashId: 'input-semantic',
          value: '2',
          pageInfo: { width: 1280, height: 720 },
          elementRect: { x: 537, y: 450 },
          title: 'Semi Design Form',
          screenshotWithBox: screenshot,
          screenshotAfter: screenshot,
        },
      },
      modelConfig,
      { maxRetries: 1 },
    );

    expect(result.usedFallback).toBe(false);
    expect(result.event.semantic?.elementDescription).toBe(
      '数量 input in the basic form',
    );
    expect(result.event.semantic?.replayInstruction).toBe(
      'Input "2" into the element described as "数量 input in the basic form".',
    );
  });

  it('rejects input field descriptions that use the typed value as the field name', async () => {
    vi.mocked(callAIWithObjectResponse).mockResolvedValueOnce({
      content: {
        elementDescription: '"hello" input',
        replayInstruction:
          'Input "hello" into the element described as "hello input".',
        actionSummary: 'Input into hello input',
        confidence: 'medium',
      },
    } as any);

    const result = await describeRecorderUIEvent(
      {
        event: {
          type: 'input',
          source: 'studio-preview',
          timestamp: 1000,
          hashId: 'input-value-as-field',
          value: 'hello',
          pageInfo: { width: 1280, height: 720 },
          elementRect: { x: 537, y: 450 },
          title: 'Search Page',
          screenshotWithBox: screenshot,
          screenshotAfter: screenshot,
        },
      },
      modelConfig,
      { maxRetries: 1 },
    );

    expect(result.usedFallback).toBe(true);
    expect(result.event.semantic?.error).toBe(
      'AI used the recorded input value as the field description.',
    );
    expect(result.event.semantic?.elementDescription).toBe(
      'unresolved input field on the current UI',
    );
  });

  it('rejects weak replay instructions that reference highlighted markers', async () => {
    vi.mocked(callAIWithObjectResponse).mockResolvedValueOnce({
      content: {
        elementDescription: 'Save button',
        replayInstruction: 'Click the highlighted element in the red marker.',
        actionSummary: 'Click highlighted element',
        confidence: 'medium',
      },
    } as any);

    const result = await describeRecorderUIEvent(
      {
        event: {
          type: 'click',
          actionType: 'Tap',
          source: 'studio-preview',
          timestamp: 1000,
          hashId: 'click-highlighted-marker',
          pageInfo: { width: 1280, height: 720 },
          elementRect: { x: 537, y: 450 },
          title: 'Settings',
          screenshotWithBox: screenshot,
        },
      },
      modelConfig,
      { maxRetries: 1 },
    );

    expect(result.usedFallback).toBe(true);
    expect(result.event.semantic?.error).toBe(
      'AI returned a weak recorder replay instruction.',
    );
    expect(result.event.semantic?.elementDescription).toBe(
      'control in Settings',
    );
  });

  it.each([
    ['web', 'For web targets'],
    ['android', 'For mobile targets'],
    ['computer', 'For desktop/computer targets'],
  ])(
    'includes platform-aware guidance for %s targets',
    async (platformId, expectedGuidance) => {
      vi.mocked(callAIWithObjectResponse).mockResolvedValueOnce({
        content: {
          elementDescription: 'Save button',
          replayInstruction: 'Tap on the element described as "Save button".',
          actionSummary: 'Tap Save button',
          confidence: 'high',
        },
      } as any);

      const result = await describeRecorderUIEvent(
        {
          event: {
            type: 'click',
            actionType: 'Tap',
            source: 'studio-preview',
            timestamp: 1000,
            hashId: `click-${platformId}`,
            pageInfo: { width: 1280, height: 720 },
            elementRect: { x: 537, y: 450 },
            screenshotWithBox: screenshot,
          },
          target: {
            platformId,
            label: platformId,
            values: {},
          },
        },
        modelConfig,
        { maxRetries: 1 },
      );

      const calls = vi.mocked(callAIWithObjectResponse).mock.calls;
      const prompt = calls[calls.length - 1]?.[0];
      expect(result.usedFallback).toBe(false);
      expect(JSON.stringify(prompt)).toContain(expectedGuidance);
    },
  );

  it('uses generic dynamic UI guidance without business-specific examples', async () => {
    vi.mocked(callAIWithObjectResponse).mockResolvedValueOnce({
      content: {
        elementDescription: 'field in the active form section',
        replayInstruction:
          'Input "value" into the element described as "field in the active form section".',
        actionSummary: 'Input into field in the active form section',
        confidence: 'high',
      },
    } as any);

    const result = await describeRecorderUIEvent(
      {
        event: {
          type: 'input',
          source: 'studio-preview',
          timestamp: 1000,
          hashId: 'input-generic-guidance',
          value: 'value',
          pageInfo: { width: 1280, height: 720 },
          elementRect: { x: 537, y: 450 },
          screenshotWithBox: screenshot,
        },
      },
      modelConfig,
      { maxRetries: 1 },
    );

    const calls = vi.mocked(callAIWithObjectResponse).mock.calls;
    const prompt = JSON.stringify(calls[calls.length - 1]?.[0]);
    expect(result.usedFallback).toBe(false);
    expect(prompt).toContain('placeholder or hint text that can change');
    expect(prompt).toContain('For repeated collections');
    expect(prompt).toContain('For consecutive input events');
    expect(prompt).not.toMatch(
      /recommendations|hot search|product names|login|SMS|phone|one-tap/i,
    );
  });

  it('rejects pending placeholder descriptions returned by AI', async () => {
    vi.mocked(callAIWithObjectResponse).mockResolvedValueOnce({
      content: {
        elementDescription: 'AI is analyzing element...',
        replayInstruction:
          'Input "2" into the element described as "AI is analyzing element...".',
        actionSummary: 'Input into AI is analyzing element...',
        confidence: 'low',
      },
    } as any);

    const result = await describeRecorderUIEvent(
      {
        event: {
          type: 'input',
          source: 'studio-preview',
          timestamp: 1000,
          hashId: 'input-placeholder',
          value: '2',
          pageInfo: { width: 1280, height: 720 },
          elementRect: { x: 537, y: 450 },
          title: 'Semi Design Form',
          screenshotWithBox: screenshot,
        },
      },
      modelConfig,
      { maxRetries: 1 },
    );

    expect(result.usedFallback).toBe(true);
    expect(result.event.semantic?.source).toBe('heuristic');
    expect(result.event.semantic?.elementDescription).toBe(
      'unresolved input field on the current UI',
    );
  });
});
