import { getModelAdapter } from '@/ai-model/models';
import { describe, expect, it } from '@rstest/core';

const adapter = getModelAdapter('tencent-hy');

describe('tencent-hy model adapter', () => {
  it('disables thinking by default', () => {
    expect(adapter.chatCompletion.buildChatCompletionParams({}).config).toEqual(
      {
        temperature: 0,
        thinking: { type: 'disabled' },
      },
    );
  });

  it('maps enabled thinking and effort', () => {
    expect(
      adapter.chatCompletion.buildChatCompletionParams({
        userConfig: {
          reasoningEnabled: true,
          reasoningEffort: 'high',
          temperature: 0.5,
        },
      }).config,
    ).toEqual({
      temperature: 0.5,
      thinking: { type: 'enabled' },
      reasoning_effort: 'high',
    });
  });

  it('preserves provider defaults when requested', () => {
    expect(
      adapter.chatCompletion.buildChatCompletionParams({
        userConfig: { reasoningEnabled: 'default' },
      }).config,
    ).toEqual({ temperature: 0 });
  });

  it('does not let effort or budget enable disabled thinking', () => {
    expect(
      adapter.chatCompletion.buildChatCompletionParams({
        userConfig: {
          reasoningEnabled: false,
          reasoningEffort: 'high',
          reasoningBudget: 1024,
        },
      }).config,
    ).toEqual({ temperature: 0, thinking: { type: 'disabled' } });
  });

  it('omits native effort and budget when using provider defaults', () => {
    expect(
      adapter.chatCompletion.buildChatCompletionParams({
        baseURL: 'https://tokenhub.tencentmaas.com/v1',
        userConfig: {
          reasoningEnabled: 'default',
          reasoningEffort: 'high',
          reasoningBudget: 1024,
        },
      }).config,
    ).toEqual({ temperature: 0 });
  });

  it.each([undefined, false, true, 'default'] as const)(
    'maps OpenRouter reasoning enabled state: %s',
    (reasoningEnabled) => {
      expect(
        adapter.chatCompletion.buildChatCompletionParams({
          baseURL: 'https://openrouter.ai/api/v1',
          userConfig: { reasoningEnabled },
        }).config,
      ).toEqual({
        temperature: 0,
        ...(reasoningEnabled === 'default'
          ? {}
          : { reasoning: { enabled: reasoningEnabled ?? false } }),
      });
    },
  );

  it.each([undefined, false])(
    'omits OpenRouter effort and budget when thinking is disabled: %s',
    (reasoningEnabled) => {
      expect(
        adapter.chatCompletion.buildChatCompletionParams({
          baseURL: 'https://openrouter.ai/api/v1',
          userConfig: {
            reasoningEnabled,
            reasoningEffort: 'high',
            reasoningBudget: 1024,
          },
        }).config,
      ).toEqual({ temperature: 0, reasoning: { enabled: false } });
    },
  );

  it.each([true, 'default'] as const)(
    'applies OpenRouter effort only when explicitly enabled: %s',
    (reasoningEnabled) => {
      expect(
        adapter.chatCompletion.buildChatCompletionParams({
          baseURL: 'https://openrouter.ai/api/v1',
          userConfig: {
            reasoningEnabled,
            reasoningEffort: 'high',
            reasoningBudget: 1024,
            temperature: 0.5,
          },
        }).config,
      ).toEqual({
        temperature: 0.5,
        ...(reasoningEnabled === true
          ? { reasoning: { enabled: true, effort: 'high' } }
          : {}),
      });
    },
  );

  it('declares reasoning budget unsupported', () => {
    expect(adapter.chatCompletion.unsupportedUserConfig).toEqual([
      'reasoningBudget',
    ]);
  });

  it.each([
    'https://tokenhub.tencentmaas.com/v1',
    'https://openrouter.ai.example.com/v1',
    'https://example.com/openrouter.ai',
  ])('keeps native thinking parameters for %s', (baseURL) => {
    expect(
      adapter.chatCompletion.buildChatCompletionParams({ baseURL }).config,
    ).toEqual({ temperature: 0, thinking: { type: 'disabled' } });
  });

  it('extracts reasoning_content without treating it as a locate answer', () => {
    expect(
      adapter.chatCompletion.extractContentAndReasoning({
        role: 'assistant',
        content: '{"box_2d":[100,200,300,400]}',
        refusal: null,
        reasoning_content: 'reasoning text',
      }),
    ).toEqual({
      content: '{"box_2d":[100,200,300,400]}',
      reasoning_content: 'reasoning text',
    });
    expect(adapter.chatCompletion.useReasoningAsContentFallback).toBe(false);
  });

  it('shares normalized xyxy boxes across element, area and planning', () => {
    const { locate, planning } = adapter;
    if (
      locate.kind !== 'standard' ||
      !locate.searchArea ||
      planning.kind !== 'standard'
    ) {
      throw new Error('Expected standard grounding and planning');
    }
    for (const operation of [locate.element, locate.searchArea]) {
      const { promptSpec } = operation.resultCodec;
      expect(promptSpec.resultKey).toBe('box_2d');
      expect(operation.protocol.expectedJsonObjectResponse).toBe(true);
      const result = operation.protocol.parseRawResponse(
        '{"box_2d":[100,200,300,400]}',
        promptSpec,
      );
      expect(result).toEqual({ kind: 'located', target: [100, 200, 300, 400] });
      if (result.kind !== 'located') {
        throw new Error('Expected located result');
      }
      expect(
        operation.resultCodec.toPixelResult(result.target, {
          preparedSize: { width: 3000, height: 2000 },
        }),
      ).toEqual({
        // Closed pixel bounds cover 601 x 401 pixels; round the half-pixel center.
        center: [601, 601],
        rect: { left: 300, top: 400, width: 601, height: 401 },
      });
      expect(() =>
        operation.resultCodec.toPixelResult([100, 200], {
          preparedSize: { width: 3000, height: 2000 },
        }),
      ).toThrow();
    }
    expect(planning.locateResultCodec).toBe(locate.element.resultCodec);
    expect(
      locate.searchArea.protocol.parseRawResponse(
        '{"box_2d":[100,200,300,400],"references_box_2d":[[500,600,700,800]]}',
        locate.searchArea.resultCodec.promptSpec,
      ),
    ).toEqual({
      kind: 'located',
      target: [100, 200, 300, 400],
      references: [[500, 600, 700, 800]],
    });
    expect(
      locate.element.protocol.parseRawResponse(
        '{"box_2d":[],"error":"not found"}',
        locate.element.resultCodec.promptSpec,
      ),
    ).toEqual({ kind: 'not-found', error: 'not found' });
  });
});
