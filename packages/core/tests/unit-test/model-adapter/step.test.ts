import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import { stepAdapters } from '@/ai-model/models/step';
import { describe, expect, it } from 'vitest';

describe('Step model adapter', () => {
  it('uses the standard normalized grounding contract', () => {
    const adapter = new ResolvedModelAdapter(stepAdapters.step, 'step');

    expect(adapter.locate.kind).toBe('standard');
    if (adapter.locate.kind !== 'standard') {
      throw new Error('Step should use standard locate');
    }
    expect(
      adapter.locate.resultAdapter.adaptElementLocateResultToPixelBbox(
        { bbox: [100, 200, 900, 800] },
        {
          preparedSize: { width: 1000, height: 1000 },
          contentSize: { width: 1000, height: 1000 },
        },
      ),
    ).toEqual([100, 200, 899, 799]);
  });

  it('does not send provider-specific reasoning parameters', () => {
    const chatCompletion = stepAdapters.step.chatCompletion;
    if (!chatCompletion?.buildChatCompletionParams) {
      throw new Error('Step chat completion params should be defined');
    }
    expect(
      chatCompletion.buildChatCompletionParams({
        midsceneDefaults: { temperature: 0, seed: 1 },
        userConfig: { temperature: 0.7 },
      }).config,
    ).toEqual({ temperature: 0.7, seed: 1 });
  });
});
