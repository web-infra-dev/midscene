import { getModelAdapter } from '@/ai-model/models';
import { describe, expect, it } from '@rstest/core';

const adapter = getModelAdapter('stepfun');
const locate = adapter.locate;
if (locate.kind !== 'standard') {
  throw new Error('Expected standard localization');
}
const { protocol, resultCodec } = locate.element;
const parse = (content: string) =>
  protocol.parseRawResponse(content, resultCodec.promptSpec);

describe('StepFun adapter', () => {
  describe.each([
    { baseURL: 'https://api.stepfun.com/v1', openRouter: false },
    { baseURL: 'https://openrouter.ai/api/v1', openRouter: true },
  ])('$baseURL', ({ baseURL, openRouter }) => {
    it.each([undefined, false, true, 'default'] as const)(
      'maps reasoning=%s',
      (reasoningEnabled) => {
        const { config } = adapter.chatCompletion.buildChatCompletionParams({
          baseURL,
          userConfig: {
            reasoningEnabled,
            reasoningEffort: 'high',
            reasoningBudget: 1024,
            temperature: 0.3,
          },
        });
        const effort = reasoningEnabled === true ? 'high' : 'low';
        const reasoning =
          reasoningEnabled === 'default'
            ? {}
            : openRouter
              ? {
                  reasoning: {
                    effort,
                    ...(reasoningEnabled === true ? { max_tokens: 1024 } : {}),
                  },
                }
              : { reasoning_effort: effort };
        expect(config).toEqual({ temperature: 0.3, ...reasoning });
      },
    );
    it('uses low by default and medium when explicitly enabled', () => {
      for (const reasoningEnabled of [undefined, true] as const) {
        const { config } = adapter.chatCompletion.buildChatCompletionParams({
          baseURL,
          userConfig: { reasoningEnabled },
        });
        const effort = reasoningEnabled ? 'medium' : 'low';
        expect(config).toEqual({
          temperature: 0,
          ...(openRouter
            ? { reasoning: { effort } }
            : { reasoning_effort: effort }),
        });
      }
    });
    it.each([undefined, 0, -1, 1.5, 1024])(
      'forwards budget %s only on OpenRouter',
      (reasoningBudget) => {
        const { config } = adapter.chatCompletion.buildChatCompletionParams({
          baseURL,
          userConfig: {
            reasoningEnabled: true,
            reasoningEffort: 'provider-specific',
            reasoningBudget,
          },
        });
        expect(config).toEqual({
          temperature: 0,
          ...(openRouter
            ? {
                reasoning: {
                  effort: 'provider-specific',
                  ...(reasoningBudget !== undefined
                    ? { max_tokens: reasoningBudget }
                    : {}),
                },
              }
            : { reasoning_effort: 'provider-specific' }),
        });
      },
    );
  });
  it.each([undefined, 'none', 'auto'] as const)(
    'respects JSON mode %s',
    (responseFormat) => {
      for (const expectedJsonObjectResponse of [true, false]) {
        const { config } = adapter.chatCompletion.buildChatCompletionParams({
          expectedJsonObjectResponse,
          userConfig: { responseFormat },
        });
        expect(config.response_format).toEqual(
          expectedJsonObjectResponse && responseFormat !== 'none'
            ? { type: 'json_object' }
            : undefined,
        );
      }
    },
  );
  it('keeps general tasks, search areas and original images available', () => {
    expect(adapter.allowedTaskTypes).toBeUndefined();
    expect(adapter.supportedProtocols).toEqual(['openai-chat']);
    expect(locate.searchArea).toBeDefined();
    expect(adapter.imagePreprocess).toEqual({ padBlockSize: undefined });
    expect(adapter.resolveImageDetail({})).toBe('high');
  });
  it.each([
    '{"point_2d":[484,87]}',
    '```json\n{"point_2d":[484,87]}\n```',
    '{"point":[484,87]}',
  ])('maps point objects and field aliases: %s', (content) => {
    const parsed = parse(content);
    if (parsed.kind !== 'located') {
      throw new Error('Expected located point');
    }
    expect(
      resultCodec.toPixelResult(parsed.target, {
        preparedSize: { width: 3000, height: 2000 },
      }),
    ).toEqual({ center: [1452, 174], rect: undefined });
    expect(
      resultCodec.toPixelResult(parsed.target, {
        preparedSize: { width: 1500, height: 1000 },
      }).center,
    ).toEqual([726, 87]);
  });
  it('handles absent targets and rejects array responses', () => {
    expect(parse('{"point_2d":[],"error":"not visible"}')).toEqual({
      kind: 'not-found',
      error: 'not visible',
    });
    for (const content of [
      '[]',
      '[{"point_2d":[484,87]}]',
      '[{"point_2d":[1,2]},{"point_2d":[3,4]}]',
      '{"bbox_2d":[1,2,3,4]}',
    ]) {
      expect(() => parse(content)).toThrow();
    }
  });
  it('rejects malformed points without guessing coordinate scales', () => {
    for (const point of [
      [1],
      [1, 2, 3, 4],
      [-1, 500],
      [1001, 500],
      [Number.NaN, 2],
    ]) {
      expect(() =>
        resultCodec.toPixelResult(point, {
          preparedSize: { width: 3000, height: 2000 },
        }),
      ).toThrow();
    }
  });
});
