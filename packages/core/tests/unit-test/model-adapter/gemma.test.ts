import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import { gemmaAdapters } from '@/ai-model/models/gemma';
import { describe, expect, it } from 'vitest';

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
      locateAdapter.resultAdapter.promptSpec.resultValueDescription,
    ).toContain('[xmin, ymin, xmax, ymax]');

    const result =
      locateAdapter.resultAdapter.adaptElementLocateResultToPixelBbox(
        [100, 150, 200, 250],
        { preparedSize: { width: 2000, height: 1000 } },
      );

    expect(result).toEqual([200, 150, 400, 250]);
  });
});
