import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import {
  extractGeminiContentAndReasoning,
  geminiAdapters,
} from '@/ai-model/models/gemini';
import { describe, expect, it } from '@rstest/core';

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

  it('uses minimal thinking level for gemini when reasoning is unset', () => {
    const result = geminiAdapter.chatCompletion.buildChatCompletionParams({});
    expect(geminiAdapter.chatCompletion.unsupportedUserConfig).toEqual([
      'reasoningBudget',
    ]);
    expect(result.config).toEqual({
      temperature: 0,
      extra_body: {
        google: {
          thinking_config: {
            include_thoughts: true,
            thinking_level: 'minimal',
          },
        },
      },
    });
  });

  it('preserves midscene defaults and applies explicit gemini temperature override', () => {
    const result =
      geminiAdapters.gemini.chatCompletion?.buildChatCompletionParams({
        midsceneDefaults: {
          temperature: 0,
          seed: 123,
        } as any,
        userConfig: {
          temperature: 0.7,
        },
      });

    expect(result?.config).toEqual({
      temperature: 0.7,
      seed: 123,
      extra_body: {
        google: {
          thinking_config: {
            include_thoughts: true,
            thinking_level: 'minimal',
          },
        },
      },
    });
  });

  it('uses minimal thinking level for insight intent by default', () => {
    const result = geminiAdapter.chatCompletion.buildChatCompletionParams({
      intent: 'insight',
    });
    expect(result.config).toEqual({
      temperature: 0,
      extra_body: {
        google: {
          thinking_config: {
            include_thoughts: true,
            thinking_level: 'minimal',
          },
        },
      },
    });
  });

  it('uses medium thinking level when reasoning is enabled without effort', () => {
    const result = geminiAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEnabled: true,
      },
    });
    expect(result.config).toEqual({
      temperature: 0,
      extra_body: {
        google: {
          thinking_config: {
            include_thoughts: true,
            thinking_level: 'medium',
          },
        },
      },
    });
  });

  it('maps reasoning effort to Gemini thinking level when reasoning is enabled', () => {
    const result = geminiAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEnabled: true,
        reasoningEffort: 'high',
      },
    });
    expect(result.config).toEqual({
      temperature: 0,
      extra_body: {
        google: {
          thinking_config: {
            include_thoughts: true,
            thinking_level: 'high',
          },
        },
      },
    });
  });

  it('uses minimal thinking level and ignores effort when reasoning is disabled', () => {
    const result = geminiAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEnabled: false,
        reasoningEffort: 'high',
      },
    });
    expect(result.config).toEqual({
      temperature: 0,
      extra_body: {
        google: {
          thinking_config: {
            include_thoughts: true,
            thinking_level: 'minimal',
          },
        },
      },
    });
  });

  it('follows provider default and ignores effort for gemini when reasoningEnabled=default', () => {
    const result = geminiAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEnabled: 'default',
        reasoningEffort: 'high',
      },
    });
    expect(result.config).toEqual({
      temperature: 0,
    });
  });

  it('ignores reasoning budget for gemini when reasoning is enabled', () => {
    const result = geminiAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEnabled: true,
        reasoningBudget: 1024,
      },
    });
    expect(result.config).toEqual({
      temperature: 0,
      extra_body: {
        google: {
          thinking_config: {
            include_thoughts: true,
            thinking_level: 'medium',
          },
        },
      },
    });
  });

  it('maps reasoning effort and ignores budget for gemini when reasoning is enabled', () => {
    const result = geminiAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEnabled: true,
        reasoningEffort: 'medium',
        reasoningBudget: 1024,
      },
    });
    expect(result.config).toEqual({
      temperature: 0,
      extra_body: {
        google: {
          thinking_config: {
            include_thoughts: true,
            thinking_level: 'medium',
          },
        },
      },
    });
  });

  it('ignores zero reasoning budget for gemini when reasoning is enabled', () => {
    const result = geminiAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEnabled: true,
        reasoningBudget: 0,
      },
    });
    expect(result.config).toEqual({
      temperature: 0,
      extra_body: {
        google: {
          thinking_config: {
            include_thoughts: true,
            thinking_level: 'medium',
          },
        },
      },
    });
  });

  it('extracts inline thought XML from string content', () => {
    const result = extractGeminiContentAndReasoning({
      content:
        '<thought>I should locate the add button.</thought>```json\n' +
        '{"bbox":[128,284,151,298]}\n' +
        '```',
      extra_content: {
        google: {
          thought: true,
          thought_signature: 'signature',
        },
      },
    });

    expect(result).toEqual({
      content:
        '<thought>I should locate the add button.</thought>```json\n' +
        '{"bbox":[128,284,151,298]}\n' +
        '```',
      reasoning_content: 'I should locate the add button.',
    });
  });

  it('extracts thought parts into reasoning_content', () => {
    const result = extractGeminiContentAndReasoning({
      content: [
        {
          text: 'I need to locate the add button.',
          thought: true,
        },
        {
          text: '{"bbox":[124,281,157,302]}',
        },
      ],
    });

    expect(result).toEqual({
      content: '{"bbox":[124,281,157,302]}',
      reasoning_content: 'I need to locate the add button.',
    });
  });

  it('combines thought parts with provider reasoning_content', () => {
    const result = extractGeminiContentAndReasoning({
      content: [
        {
          text: 'I need to locate the add button.',
          thought: true,
        },
        {
          text: '{"bbox":[124,281,157,302]}',
        },
      ],
      reasoning_content: 'provider reasoning',
    });

    expect(result).toEqual({
      content: '{"bbox":[124,281,157,302]}',
      reasoning_content:
        'thoughtParts：I need to locate the add button.; reasoning_content：provider reasoning',
    });
  });

  it('keeps visible content when Gemini parts do not include thought summaries', () => {
    const result = extractGeminiContentAndReasoning({
      content: [
        {
          text: '{"bbox":[124,281,157,302]}',
        },
      ],
    });

    expect(result).toEqual({
      content: '{"bbox":[124,281,157,302]}',
      reasoning_content: '',
    });
  });

  it('combines inline thought XML with provider reasoning_content', () => {
    const result = extractGeminiContentAndReasoning({
      content:
        '<thought>I should locate the add button.</thought>```json\n' +
        '{"bbox":[128,284,151,298]}\n' +
        '```',
      reasoning_content: 'provider reasoning',
    });

    expect(result).toEqual({
      content:
        '<thought>I should locate the add button.</thought>```json\n' +
        '{"bbox":[128,284,151,298]}\n' +
        '```',
      reasoning_content:
        'thoughtParts：I should locate the add button.; reasoning_content：provider reasoning',
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
