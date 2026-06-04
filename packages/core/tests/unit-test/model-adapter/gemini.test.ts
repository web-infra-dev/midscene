import { geminiAdapters } from '@/ai-model/models/gemini';
import { ResolvedModelAdapter } from '@/ai-model/models/resolved';
import { describe, expect, it } from 'vitest';

const geminiAdapter = new ResolvedModelAdapter(geminiAdapters.gemini, 'gemini');

describe('gemini model adapter', () => {
  it('keeps Gemini bbox prompt in yxyx order', () => {
    const locateAdapter = geminiAdapter.locate;
    expect(locateAdapter.kind).toBe('standard');
    if (locateAdapter.kind !== 'standard') {
      throw new Error('gemini should use standard locate adapter');
    }
    expect(
      locateAdapter.resultAdapter.promptSpec.resultValueDescription,
    ).toContain('[ymin, xmin, ymax, xmax]');
  });

  it('uses minimal reasoning effort for gemini when reasoning is unset', () => {
    const result = geminiAdapter.chatCompletion.buildChatCompletionParams({});
    expect(geminiAdapter.chatCompletion.unsupportedUserConfig).toEqual([
      'reasoningEnabled',
      'reasoningBudget',
    ]);
    expect(result.config).toEqual({
      temperature: 0,
      reasoning_effort: 'minimal',
    });
  });

  it('passes reasoning effort through for gemini', () => {
    const result = geminiAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEffort: 'high',
      },
    });
    expect(result.config).toEqual({
      temperature: 0,
      reasoning_effort: 'high',
    });
  });

  it('ignores unsupported reasoning fields for gemini', () => {
    const result = geminiAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEnabled: true,
        reasoningBudget: 1024,
      },
    });
    expect(result.config).toEqual({
      temperature: 0,
      reasoning_effort: 'minimal',
    });
  });

  it('normalizes gemini yxyx bbox coordinates', () => {
    const locateAdapter = geminiAdapter.locate;
    expect(locateAdapter.kind).toBe('standard');
    if (locateAdapter.kind !== 'standard') {
      throw new Error('gemini should use standard locate adapter');
    }

    const result =
      locateAdapter.resultAdapter.adaptElementLocateResultToPixelBbox(
        [100, 150, 200, 250],
        { preparedSize: { width: 2000, height: 2000 } },
      );
    expect(result).toMatchInlineSnapshot(`
      [
        300,
        200,
        500,
        400,
      ]
    `);
  });
});
