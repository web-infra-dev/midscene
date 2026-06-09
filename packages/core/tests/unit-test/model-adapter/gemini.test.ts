import {
  extractGeminiContentAndReasoning,
  geminiAdapters,
} from '@/ai-model/models/gemini';
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

  it('enables thought summaries for insight intent', () => {
    const result = geminiAdapter.chatCompletion.buildChatCompletionParams({
      intent: 'insight',
    });
    expect(result.config).toEqual({
      temperature: 0,
      extra_body: {
        google: {
          thinking_config: {
            include_thoughts: true,
          },
        },
      },
      reasoning_effort: 'minimal',
    });
  });

  it('uses thinking config for gemini when reasoning effort is set', () => {
    const result = geminiAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEffort: 'high',
      },
    });
    expect(result.config).toEqual({
      temperature: 0,
      extra_body: {
        google: {
          thinking_config: {
            thinking_level: 'high',
            include_thoughts: true,
          },
        },
      },
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
