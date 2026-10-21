import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import { gemmaAdapters } from '@/ai-model/models/gemma';
import { describe, expect, it } from '@rstest/core';

const gemmaAdapter = new ResolvedModelAdapter(gemmaAdapters.gemma, 'gemma');

describe('gemma model adapter', () => {
  it('uses OpenAI-compatible chat params without Qwen-specific thinking fields', () => {
    const result = gemmaAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEnabled: true,
        reasoningBudget: 1024,
        reasoningEffort: 'high',
      },
    });

    expect(gemmaAdapter.chatCompletion.unsupportedUserConfig).toEqual([
      'reasoningEnabled',
      'reasoningEffort',
      'reasoningBudget',
    ]);
    expect(result.config).toEqual({
      temperature: 0,
    });
  });

  it('uses the standard normalized xy bbox locate contract', () => {
    const locateAdapter = gemmaAdapter.locate;
    expect(locateAdapter.kind).toBe('standard');
    if (locateAdapter.kind !== 'standard') {
      throw new Error('gemma should use standard locate adapter');
    }

    expect(
      locateAdapter.element.resultCodec.promptSpec.resultValueDescription,
    ).toContain('[xmin, ymin, xmax, ymax]');

    const result = locateAdapter.element.resultCodec.toPixelResult(
      [100, 150, 200, 250],
      { preparedSize: { width: 2000, height: 1000 } },
    );

    expect(result).toEqual({
      center: [300, 200],
      rect: { left: 200, top: 150, width: 201, height: 101 },
    });
  });

  it('parses the standard bbox response before converting it to pixels', () => {
    const locate = gemmaAdapter.locate;
    if (locate.kind !== 'standard') {
      throw new Error('gemma should use standard locate adapter');
    }

    expect(
      locate.element.protocol.parseRawResponse(
        '{"bbox":[100,150,200,250]}',
        locate.element.resultCodec.promptSpec,
      ),
    ).toEqual({ kind: 'located', target: [100, 150, 200, 250] });
    expect(gemmaAdapter.chatCompletion.useReasoningAsContentFallback).toBe(
      true,
    );
  });
});
