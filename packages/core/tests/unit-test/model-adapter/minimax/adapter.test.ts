import { getModelAdapter } from '@/ai-model/models';
import { describe, expect, it } from '@rstest/core';

const adapter = getModelAdapter('minimax');
const locate = adapter.locate;
if (locate.kind !== 'standard' || !locate.searchArea) {
  throw new Error(
    'MiniMax requires standard element and search area localization',
  );
}
const { protocol, resultCodec } = locate.element;
const searchArea = locate.searchArea;

describe('MiniMax adapter', () => {
  it('keeps general task support and does not resize or pad screenshots', () => {
    expect(adapter.allowedTaskTypes).toBeUndefined();
    expect(adapter.supportedProtocols).toEqual(['openai-chat']);
    expect(adapter.imagePreprocess).toEqual({ padBlockSize: undefined });
    expect(adapter.resolveImageDetail({})).toBe('high');
  });

  it('disables thinking by default for minimax without sending effort', () => {
    const config = adapter.chatCompletion.buildChatCompletionParams({
      expectedJsonObjectResponse: true,
    }).config;
    expect(config).toMatchObject({
      reasoning_split: true,
      thinking: { type: 'disabled' },
    });
    expect(config).not.toHaveProperty('reasoning_effort');
    expect(config).not.toHaveProperty('response_format');
    expect(config.temperature).toBeUndefined();
  });

  it.each([
    [true, { type: 'adaptive' }],
    [false, { type: 'disabled' }],
    ['default', undefined],
  ] as const)(
    'maps reasoningEnabled=%s for minimax',
    (reasoningEnabled, thinking) => {
      const config = adapter.chatCompletion.buildChatCompletionParams({
        userConfig: { reasoningEnabled },
      }).config;
      expect(config.thinking).toEqual(thinking);
      expect(config).not.toHaveProperty('reasoning_effort');
    },
  );

  it('defaults minimax-3.1 to low effort and supports an explicit effort', () => {
    const flash = getModelAdapter('minimax-3.1');
    const config = flash.chatCompletion.buildChatCompletionParams({
      expectedJsonObjectResponse: true,
    }).config;
    expect(config).toMatchObject({
      reasoning_split: true,
      reasoning_effort: 'low',
    });
    expect(config).not.toHaveProperty('thinking');
    expect(config).not.toHaveProperty('response_format');
    expect(config.temperature).toBeUndefined();
    expect(
      flash.chatCompletion.buildChatCompletionParams({
        userConfig: { reasoningEffort: 'max' },
      }).config.reasoning_effort,
    ).toBe('max');
    expect(flash.includeImageDimensions).toBe(true);
    expect(flash.locate.kind).toBe('standard');
    expect(flash.allowedTaskTypes).toBeUndefined();
  });

  it('keeps reasoning separate from the final JSON answer', () => {
    expect(
      adapter.chatCompletion.extractContentAndReasoning({
        role: 'assistant',
        content: '{"point":[1200,700]}',
        reasoning_content: 'Thinking about the target',
        refusal: null,
      }),
    ).toEqual({
      content: '{"point":[1200,700]}',
      reasoning_content: 'Thinking about the target',
    });
    expect(adapter.chatCompletion.useReasoningAsContentFallback).toBe(false);
  });

  it('opts into shared image dimensions and pixel coordinate instructions', () => {
    expect(adapter.includeImageDimensions).toBe(true);
    expect(getModelAdapter('ant-ling').includeImageDimensions).toBe(false);
    expect(
      protocol.buildResponseInstructions(resultCodec.promptSpec),
    ).toContain('actual pixel coordinates');
  });

  it('interprets points as pixels, including values above 1000', () => {
    const parsed = protocol.parseRawResponse(
      '{"point":[1200,700]}',
      resultCodec.promptSpec,
    );
    if (parsed.kind !== 'located') {
      throw new Error('Expected a located point');
    }
    for (const preparedSize of [
      { width: 1500, height: 1000 },
      { width: 3000, height: 2000 },
    ]) {
      expect(
        resultCodec.toPixelResult(parsed.target, { preparedSize }),
      ).toEqual({ center: [1200, 700], rect: undefined });
    }
    expect(() =>
      resultCodec.toPixelResult(parsed.target, {
        preparedSize: { width: 800, height: 600 },
      }),
    ).toThrow();
  });

  it('returns a real region for deep localization', () => {
    const parsed = searchArea.protocol.parseRawResponse(
      '{"bbox":[100,200,400,600]}',
      searchArea.resultCodec.promptSpec,
    );
    if (parsed.kind !== 'located') {
      throw new Error('Expected a located region');
    }
    expect(
      searchArea.resultCodec.toPixelResult(parsed.target, {
        preparedSize: { width: 1500, height: 1000 },
      }),
    ).toMatchObject({ center: [250, 400], rect: { left: 100, top: 200 } });
  });

  it('reuses JSON repair and rejects missing answers', () => {
    expect(
      protocol.parseRawResponse('{"point":[946,147]', resultCodec.promptSpec),
    ).toEqual({ kind: 'located', target: [946, 147] });
    expect(
      protocol.parseRawResponse(
        '{"point":[],"error":"not visible"}',
        resultCodec.promptSpec,
      ),
    ).toEqual({ kind: 'not-found', error: 'not visible' });
    expect(() =>
      protocol.parseRawResponse('{}', resultCodec.promptSpec),
    ).toThrow();
  });
});
