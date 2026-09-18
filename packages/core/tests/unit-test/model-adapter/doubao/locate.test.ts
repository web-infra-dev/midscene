import { getModelRuntime } from '@/ai-model/models';
import { callAI } from '@/ai-model/service-caller/index';
import {
  AiLocateElement,
  AiLocateSection,
} from '@/ai-model/workflows/grounding';
import type { IModelConfig } from '@midscene/shared/env';
import { beforeEach, describe, expect, it, rs } from '@rstest/core';
import { createFakeContext } from '../../../utils';

import * as serviceCallerActual from '@/ai-model/service-caller/index' with {
  rstest: 'importActual',
};

rs.mock('@/ai-model/service-caller/index', () => ({
  ...serviceCallerActual,
  callAI: rs.fn(),
}));

describe('doubao standard locate', () => {
  const modelConfig: IModelConfig = {
    modelFamily: 'doubao-seed',
    modelName: 'doubao-test-model',
    modelDescription: 'doubao-test-model',
    intent: 'default',
    slot: 'default',
    retryCount: 0,
    retryInterval: 0,
  };

  beforeEach(() => {
    rs.clearAllMocks();
    rs.mocked(callAI).mockResolvedValue({
      content:
        '<seed:tool_call><function name="click"><parameter name="point" string="true"><point>500 500</point></parameter></function></seed:tool_call>',
      reasoning_content: 'Found the target',
      isStreamed: false,
    });
  });

  it('sends the locate message and parses the click point', async () => {
    const result = await AiLocateElement({
      context: createFakeContext(),
      targetElementDescription: 'the Submit button',
      modelRuntime: getModelRuntime(modelConfig),
    });

    const [messages, , callOptions] = rs.mocked(callAI).mock.calls[0];
    expect(messages[0]).toMatchObject({
      role: 'system',
      content: expect.stringMatching(/"name"\s*:\s*"click"/),
    });
    expect(messages[1]).toMatchObject({
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: expect.any(Object),
        },
        {
          type: 'text',
          text: expect.stringContaining(
            '## User Instruction: What element matches the following task: the Submit button',
          ),
        },
      ],
    });
    expect(callOptions).toMatchObject({
      expectedJsonObjectResponse: false,
    });
    expect(result.rect).toBeDefined();
    expect(result.parseResult.errors).toEqual([]);
    expect(result.rawResponse).toContain('<point>500 500</point>');
    expect(result.reasoning_content).toBe('Found the target');
  });

  it('uses ordered click tool calls to build a deepLocate search area', async () => {
    rs.mocked(callAI).mockResolvedValue({
      content:
        '<seed:tool_call><function name="click"><parameter name="role" string="true">target</parameter><parameter name="point" string="true"><point>320 460</point></parameter></function></seed:tool_call>' +
        '<seed:tool_call><function name="click"><parameter name="role" string="true">reference</parameter><parameter name="point" string="true"><point>510 460</point></parameter></function></seed:tool_call>',
      reasoning_content: 'Found the target and its reference',
      isStreamed: false,
    });

    const result = await AiLocateSection({
      context: createFakeContext(),
      sectionDescription: 'the edit icon in the row containing Apollo',
      modelRuntime: getModelRuntime(modelConfig),
    });

    const [messages, , callOptions] = rs.mocked(callAI).mock.calls[0];
    expect(messages[0]).toMatchObject({
      role: 'system',
      content: expect.stringContaining(
        'A response containing only the target is invalid when the description uses any visible element to identify the target.',
      ),
    });
    expect(messages[1]).toMatchObject({
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: expect.any(Object),
        },
        {
          type: 'text',
          text: expect.stringContaining(
            'Locate the target and all visible reference elements used to identify it: the edit icon in the row containing Apollo',
          ),
        },
      ],
    });
    expect(callOptions).toMatchObject({
      expectedJsonObjectResponse: false,
    });
    expect(result.searchAreaConfig).toBeDefined();
    expect(result.rawResponse).toContain('<point>320 460</point>');
    expect(result.rawResponse).toContain('<point>510 460</point>');
  });
});
