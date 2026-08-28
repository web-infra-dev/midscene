import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import { deepSeekAdapters } from '@/ai-model/models/deepseek/adapter';
import {
  deepSeekElementLocateProtocol,
  deepSeekSearchAreaProtocol,
} from '@/ai-model/models/deepseek/locate-protocol';
import { systemPromptToLocateElement } from '@/ai-model/prompt/llm-locator';
import { createLocateResultPromptSpec } from '@/ai-model/shared/model-locate-result/prompt-spec';
import { describe, expect, it } from 'vitest';

const deepSeekAdapter = new ResolvedModelAdapter(
  deepSeekAdapters.deepseek,
  'deepseek',
);

function getStandardLocateAdapter() {
  if (deepSeekAdapter.locate.kind !== 'standard') {
    throw new Error('deepseek should use a standard locate adapter');
  }
  return deepSeekAdapter.locate;
}

describe('deepseek model adapter', () => {
  it('uses point tokens for final element locate', () => {
    const locateAdapter = getStandardLocateAdapter();
    const elementProtocol = locateAdapter.element.protocol;
    const responseInstructions = elementProtocol.buildResponseInstructions(
      locateAdapter.element.resultCodec.promptSpec,
    );
    const systemPrompt = systemPromptToLocateElement({
      systemPromptIntroduction: elementProtocol.systemPromptIntroduction,
      responseInstructions,
    });

    expect(elementProtocol.systemPromptIntroduction).toContain(
      'You are a GUI click grounding agent.',
    );
    expect(responseInstructions).toContain(
      '<｜｜point｜｜>[[number, number]]<｜｜/point｜｜>',
    );
    expect(responseInstructions).toContain(
      '<｜｜point｜｜>[[150, 150]]<｜｜/point｜｜>',
    );
    expect(responseInstructions).toContain(
      'Coordinate requirements: point, should be [x, y] normalized to 0-1000 relative to the screenshot.',
    );
    expect(systemPrompt).toContain(
      '<｜｜point｜｜>[[150, 150]]<｜｜/point｜｜>',
    );
    expect(elementProtocol.expectedJsonObjectResponse).toBe(false);
    expect(elementProtocol.buildUserPrompt('Submit')).toBe(
      'Locate the center point of the following UI element: Submit',
    );
  });

  it('builds coordinate instructions from the result format prompt spec', () => {
    const pointPromptSpec = createLocateResultPromptSpec({
      shape: 'point',
      order: 'yx',
      normalizedBy: 2000,
    });
    const bboxPromptSpec = createLocateResultPromptSpec({
      shape: 'bbox',
      order: 'yx',
      normalizedBy: 2000,
    });
    const elementInstructions =
      deepSeekElementLocateProtocol.buildResponseInstructions(pointPromptSpec);
    const searchAreaInstructions =
      deepSeekSearchAreaProtocol.buildResponseInstructions(bboxPromptSpec);

    expect(elementInstructions).toContain('should be [y, x]');
    expect(elementInstructions).toContain('normalized to 0-2000');
    expect(elementInstructions).not.toContain('normalized to 0-1000');
    expect(searchAreaInstructions).toContain(
      'should be [ymin, xmin, ymax, xmax]',
    );
    expect(searchAreaInstructions).toContain('normalized to 0-2000');
    expect(searchAreaInstructions).not.toContain('normalized to 0-1000');
  });

  it('parses a normalized final point and maps it to pixels', () => {
    const locateAdapter = getStandardLocateAdapter();
    const rawResult = locateAdapter.element.protocol.parseRawResponse(
      '<｜｜point｜｜>[[928,780]]<｜｜/point｜｜>',
      locateAdapter.element.resultCodec.promptSpec,
    );

    expect(rawResult).toEqual({
      kind: 'located',
      target: '[[928,780]]',
    });
    if (rawResult.kind !== 'located') {
      throw new Error('DeepSeek response should contain a location');
    }
    expect(
      locateAdapter.element.resultCodec.toPixelBbox(rawResult.target, {
        preparedSize: { width: 1000, height: 1000 },
      }),
    ).toEqual([917, 769, 937, 789]);
  });

  it('uses ref-box tokens and bbox coordinates for deepLocate search area', () => {
    const locateAdapter = getStandardLocateAdapter();
    const searchAreaProtocol = locateAdapter.searchArea?.protocol;
    const searchAreaResultCodec = locateAdapter.searchArea?.resultCodec;
    expect(searchAreaProtocol).toBeDefined();
    expect(searchAreaResultCodec).toBeDefined();
    if (!searchAreaProtocol || !searchAreaResultCodec) {
      throw new Error(
        'deepseek should define search-area protocol and adapter',
      );
    }

    const responseInstructions = searchAreaProtocol.buildResponseInstructions(
      searchAreaResultCodec.promptSpec,
    );
    expect(searchAreaProtocol.systemPromptIntroduction).toBe('');
    expect(responseInstructions).toContain(
      'you MUST return that visible element as a reference',
    );
    expect(responseInstructions).toContain(
      '<｜｜ref｜｜>target: concise target description<｜｜/ref｜｜><｜｜box｜｜>[[number, number, number, number]]<｜｜/box｜｜>',
    );
    expect(responseInstructions).toContain(
      '<｜｜ref｜｜>reference: concise reference description<｜｜/ref｜｜><｜｜box｜｜>[[number, number, number, number]]<｜｜/box｜｜>',
    );
    expect(responseInstructions).toContain(
      '<｜｜ref｜｜>target: edit icon<｜｜/ref｜｜><｜｜box｜｜>[[100, 100, 200, 200]]<｜｜/box｜｜>',
    );
    expect(responseInstructions).toContain(
      '<｜｜ref｜｜>reference: Apollo<｜｜/ref｜｜><｜｜box｜｜>[[345, 442, 458, 483]]<｜｜/box｜｜>',
    );
    expect(responseInstructions).toContain(
      'Coordinate requirements: 2d bounding box, should be [xmin, ymin, xmax, ymax] normalized to 0-1000 relative to the screenshot.',
    );
    expect(searchAreaProtocol.buildUserPrompt('the Apollo edit icon')).toBe(
      'Locate the target and the reference elements needed to distinguish it: the Apollo edit icon',
    );
    expect(searchAreaProtocol.expectedJsonObjectResponse).toBe(false);
    const rawResult = searchAreaProtocol.parseRawResponse(
      '<｜｜ref｜｜>target: edit icon<｜｜/ref｜｜><｜｜box｜｜>[[845,390,875,430]]<｜｜/box｜｜>\n' +
        '<｜｜ref｜｜>reference: Apollo<｜｜/ref｜｜><｜｜box｜｜>[[150,390,230,430]]<｜｜/box｜｜>',
      searchAreaResultCodec.promptSpec,
    );

    expect(rawResult).toEqual({
      kind: 'located',
      target: '[[845,390,875,430]]',
      references: ['[[150,390,230,430]]'],
    });
    if (rawResult.kind !== 'located') {
      throw new Error('DeepSeek response should contain a location');
    }
    const context = { preparedSize: { width: 1000, height: 1000 } };
    expect(
      searchAreaResultCodec.toPixelBbox(rawResult.target, context),
    ).toEqual([844, 390, 874, 430]);
    expect(
      rawResult.references?.map((reference) =>
        searchAreaResultCodec.toPixelBbox(reference, context),
      ),
    ).toEqual([[150, 390, 230, 430]]);
  });

  it('accepts ASCII ref-box delimiters when no reference is needed', () => {
    expect(
      deepSeekSearchAreaProtocol.parseRawResponse(
        '<|ref|>target: Submit button<|/ref|><|box|>[[300,440,360,480]]<|/box|>',
        getStandardLocateAdapter().searchArea!.resultCodec.promptSpec,
      ),
    ).toEqual({ kind: 'located', target: '[[300,440,360,480]]' });
  });

  it('rejects responses that do not contain exactly two integers', () => {
    const locateAdapter = getStandardLocateAdapter().element;
    const rawResult = locateAdapter.protocol.parseRawResponse(
      '<｜｜point｜｜>[[820,430],[210,430]]<｜｜/point｜｜>',
      locateAdapter.resultCodec.promptSpec,
    );
    if (rawResult.kind !== 'located') {
      throw new Error('DeepSeek response should contain a raw location');
    }

    expect(() =>
      locateAdapter.resultCodec.toPixelBbox(rawResult.target, {
        preparedSize: { width: 1000, height: 1000 },
      }),
    ).toThrow('must contain exactly 2 positive integers');
  });

  it('rejects responses without exactly one point envelope', () => {
    const locateAdapter = getStandardLocateAdapter().element;

    expect(() =>
      locateAdapter.protocol.parseRawResponse(
        '[[928,780]]',
        locateAdapter.resultCodec.promptSpec,
      ),
    ).toThrow('does not contain a valid');
    expect(() =>
      locateAdapter.protocol.parseRawResponse(
        '<｜｜point｜｜>[[928,780]]<｜｜/point｜｜>extra text',
        locateAdapter.resultCodec.promptSpec,
      ),
    ).toThrow('does not contain a valid');
  });

  it.each([
    '<｜｜point｜｜>[[928.5,780]]<｜｜/point｜｜>',
    '<｜｜point｜｜>no coordinates<｜｜/point｜｜>',
  ])('rejects output without exactly two integers: %s', (content) => {
    const locateAdapter = getStandardLocateAdapter().element;
    const rawResult = locateAdapter.protocol.parseRawResponse(
      content,
      locateAdapter.resultCodec.promptSpec,
    );
    if (rawResult.kind !== 'located') {
      throw new Error('DeepSeek response should contain a raw location');
    }

    expect(() =>
      locateAdapter.resultCodec.toPixelBbox(rawResult.target, {
        preparedSize: { width: 1000, height: 1000 },
      }),
    ).toThrow('must contain exactly 2 positive integers');
  });

  it.each([
    '<｜｜point｜｜>[928,780]<｜｜/point｜｜>',
    '<｜｜point｜｜>[[928 780]]<｜｜/point｜｜>',
    '<|point|>928 -> 780<|/point|>',
  ])('accepts any separator between the two integers: %s', (content) => {
    const locateAdapter = getStandardLocateAdapter().element;
    const rawResult = locateAdapter.protocol.parseRawResponse(
      content,
      locateAdapter.resultCodec.promptSpec,
    );
    if (rawResult.kind !== 'located') {
      throw new Error('DeepSeek response should contain a raw location');
    }

    expect(
      locateAdapter.resultCodec.toPixelBbox(rawResult.target, {
        preparedSize: { width: 1000, height: 1000 },
      }),
    ).toEqual([917, 769, 937, 789]);
  });

  it('maps DeepSeek reasoning controls and provider defaults', () => {
    const defaultResult =
      deepSeekAdapter.chatCompletion.buildChatCompletionParams({
        userConfig: {},
      });
    const reasoningResult =
      deepSeekAdapter.chatCompletion.buildChatCompletionParams({
        userConfig: {
          reasoningEnabled: true,
          reasoningEffort: 'max',
        },
      });
    const providerDefaultResult =
      deepSeekAdapter.chatCompletion.buildChatCompletionParams({
        userConfig: {
          reasoningEnabled: 'default',
          reasoningEffort: 'max',
          temperature: 0.7,
        },
      });
    const reasoningDisabledResult =
      deepSeekAdapter.chatCompletion.buildChatCompletionParams({
        userConfig: {
          reasoningEnabled: false,
          temperature: 0.7,
        },
      });

    expect(defaultResult.config).toEqual({
      temperature: 0,
      thinking: { type: 'disabled' },
    });
    expect(reasoningResult.config).toEqual({
      temperature: undefined,
      thinking: { type: 'enabled' },
      reasoning_effort: 'max',
    });
    expect(providerDefaultResult.config).toEqual({ temperature: undefined });
    expect(reasoningDisabledResult.config).toEqual({
      temperature: 0.7,
      thinking: { type: 'disabled' },
    });
  });

  it('does not replay raw assistant messages without tool calls', () => {
    expect(deepSeekAdapter.chatCompletion.useReasoningAsContentFallback).toBe(
      true,
    );
    expect(deepSeekAdapter.chatCompletion.replayRawAssistantMessage).toBe(
      false,
    );
    expect(deepSeekAdapter.chatCompletion.unsupportedUserConfig).toEqual([
      'reasoningBudget',
    ]);
  });
});
