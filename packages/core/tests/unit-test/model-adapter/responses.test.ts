import { resolveResponses } from '@/ai-model/model-adapter/responses';
import { expect, it } from '@rstest/core';

it('disables Responses raw output replay by default', () => {
  expect(resolveResponses(undefined).replayRawAssistantOutput).toBe(false);
});

it('allows disabling Responses raw output replay', () => {
  expect(
    resolveResponses({ replayRawAssistantOutput: false })
      .replayRawAssistantOutput,
  ).toBe(false);
});

it('allows enabling Responses raw output replay', () => {
  expect(
    resolveResponses({ replayRawAssistantOutput: true })
      .replayRawAssistantOutput,
  ).toBe(true);
});
