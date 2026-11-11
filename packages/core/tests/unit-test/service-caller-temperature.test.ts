import { getModelRuntime } from '@/ai-model/models';
import { prepareChatCompletion } from '@/ai-model/service-caller/openai/chat-completion/chat-completion';
import { prepareResponses } from '@/ai-model/service-caller/openai/responses/responses';
import type { IModelConfig } from '@midscene/shared/env';
import { describe, expect, it } from '@rstest/core';

describe.each([
  { protocol: 'openai-chat', prepare: prepareChatCompletion },
  { protocol: 'openai-responses', prepare: prepareResponses },
] as const)('$protocol temperature', ({ protocol, prepare }) => {
  it.each([
    { temperature: undefined, extraBody: undefined, expected: 0 },
    { temperature: 0.5, extraBody: undefined, expected: 0.5 },
    { temperature: 'unset', extraBody: undefined, expected: undefined },
    {
      temperature: 'unset',
      extraBody: { temperature: 1 },
      expected: 1,
    },
  ] as const)(
    'serializes temperature=$temperature with extraBody=$extraBody',
    async ({ temperature, extraBody, expected }) => {
      const config: IModelConfig = {
        modelName: 'gpt-5.6-sol',
        modelFamily: 'gpt-5',
        modelDescription: 'test model',
        intent: 'default',
        slot: 'default',
        protocol,
        temperature,
        extraBody,
      };
      const { requestParams } = await prepare({
        messages: [{ role: 'user', content: 'Locate the button.' }],
        modelRuntime: getModelRuntime(config),
        // Semantic retries must not reintroduce explicitly unset temperature.
        options: { semanticRetryAttempt: temperature === 'unset' ? 1 : 0 },
      });
      const body = JSON.parse(JSON.stringify(requestParams));
      if (expected === undefined) {
        expect(body).not.toHaveProperty('temperature');
      } else {
        expect(body.temperature).toBe(expected);
      }
      expect(config.temperature).toBe(temperature);
      expect(config.extraBody).toEqual(extraBody);
    },
  );
});
