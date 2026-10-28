import { getModelAdapter } from '@/ai-model/models';
import { describe, expect, it } from '@rstest/core';

const adapter = getModelAdapter('ant-ling');
const locate = adapter.locate;
if (locate.kind !== 'standard') {
  throw new Error('Ant Ling requires the standard locate workflow');
}
const { protocol, resultCodec } = locate.element;
const parse = (content: string) =>
  protocol.parseRawResponse(content, resultCodec.promptSpec);

describe('Ant Ling adapter', () => {
  it('supports Chat element localization without automatic image resizing', () => {
    expect(adapter.supportedTaskTypes).toBeUndefined();
    expect(adapter.supportedProtocols).toEqual(['openai-chat']);
    expect(locate.searchArea).toBeDefined();
    expect(adapter.imagePreprocess).toEqual({ padBlockSize: undefined });
    expect(adapter.resolveImageDetail({})).toBe('high');
    expect(protocol.expectedJsonObjectResponse).toBe(true);
  });

  it('disables thinking by default and enables JSON only for object responses', () => {
    expect(
      adapter.chatCompletion.buildChatCompletionParams({
        expectedJsonObjectResponse: true,
      }).config,
    ).toEqual({
      temperature: 0,
      thinking: { type: 'disabled' },
      response_format: { type: 'json_object' },
    });
    expect(
      adapter.chatCompletion.buildChatCompletionParams({}).config,
    ).not.toHaveProperty('response_format');
    expect(
      adapter.chatCompletion.buildChatCompletionParams({
        expectedJsonObjectResponse: true,
        userConfig: { responseFormat: 'none' },
      }).config,
    ).not.toHaveProperty('response_format');
  });

  it('honors explicit reasoning and temperature settings', () => {
    expect(
      adapter.chatCompletion.buildChatCompletionParams({
        userConfig: { reasoningEnabled: true, temperature: 0.3 },
      }).config,
    ).toEqual({ temperature: 0.3, thinking: { type: 'enabled' } });
    expect(
      adapter.chatCompletion.buildChatCompletionParams({
        userConfig: { reasoningEnabled: false },
      }).config.thinking,
    ).toEqual({ type: 'disabled' });
    expect(
      adapter.chatCompletion.buildChatCompletionParams({
        userConfig: { reasoningEnabled: 'default' },
      }).config,
    ).not.toHaveProperty('thinking');
    expect(adapter.chatCompletion.unsupportedUserConfig).toEqual([
      'reasoningEffort',
      'reasoningBudget',
    ]);
  });

  it('maps normalized points using the actual screenshot size without inventing a box', () => {
    const parsed = parse('{"point":[250,750]}');
    expect(parsed.kind).toBe('located');
    if (parsed.kind !== 'located') {
      throw new Error('Expected a located point');
    }
    expect(
      resultCodec.toPixelResult(parsed.target, {
        preparedSize: { width: 800, height: 2000 },
      }),
    ).toEqual({ center: [200, 1500], rect: undefined });
    expect(
      resultCodec.toPixelResult(parsed.target, {
        preparedSize: { width: 3840, height: 2160 },
      }).center,
    ).toEqual([960, 1620]);
  });

  it('uses existing JSON repair and reports an absent target', () => {
    expect(parse('{"point":[946,147]')).toEqual({
      kind: 'located',
      target: [946, 147],
    });
    expect(parse('{"point":[],"error":"not visible"}')).toEqual({
      kind: 'not-found',
      error: 'not visible',
    });
  });

  it('rejects missing points, refusal text, and bare coordinate pairs', () => {
    for (const content of [
      '{}',
      'I cannot answer this request.',
      '[946,147]',
    ]) {
      expect(() => parse(content)).toThrow();
    }
  });

  it('rejects malformed and out-of-range coordinates', () => {
    for (const point of [
      [1],
      [1, 2, 3],
      [-1, 500],
      [1001, 500],
      [Number.NaN, 2],
    ]) {
      expect(() =>
        resultCodec.toPixelResult(point, {
          preparedSize: { width: 1000, height: 1000 },
        }),
      ).toThrow();
    }
  });
});
