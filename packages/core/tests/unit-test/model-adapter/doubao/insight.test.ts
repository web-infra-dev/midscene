import { getModelRuntime } from '@/ai-model/models';
import { callAI } from '@/ai-model/service-caller/index';
import { AiExtractElementInfo } from '@/ai-model/workflows/insight';
import type { IModelConfig } from '@midscene/shared/env';
import { beforeEach, describe, expect, it, rs } from '@rstest/core';
import { createFakeContext } from '../../../utils';

import * as serviceCallerActual from '@/ai-model/service-caller/index' with {
  rstest: 'importActual',
};

rs.mock('@/ai-model/service-caller/index', () => ({
  ...serviceCallerActual,
  AIResponseParseError: class AIResponseParseError extends Error {},
  callAI: rs.fn(),
}));

describe('doubao insight', () => {
  const modelConfig: IModelConfig = {
    modelFamily: 'doubao-seed',
    modelName: 'test-model',
    modelDescription: 'test-model-desc',
    intent: 'insight',
    slot: 'insight',
    retryCount: 1,
    retryInterval: 0,
  };

  beforeEach(() => {
    rs.clearAllMocks();
  });

  it('uses the Seed protocol for the shared Insight workflow', async () => {
    rs.mocked(callAI).mockResolvedValue({
      content:
        '<observation>The success toast is visible.</observation><seed:tool_call><function name="extract_data"><parameter name="data" string="true">{"StatementIsTruthy":true}</parameter></function></seed:tool_call>',
      usage: undefined,
      reasoning_content: undefined,
    } as any);

    const result = await AiExtractElementInfo<{
      StatementIsTruthy: boolean;
    }>({
      context: createFakeContext(),
      dataQuery: {
        StatementIsTruthy: 'Boolean, whether the success toast is visible',
      },
      modelRuntime: getModelRuntime(modelConfig),
    });

    expect(result.parseResult).toEqual({
      thought: 'The success toast is visible.',
      data: { StatementIsTruthy: true },
    });

    const [messages] = rs.mocked(callAI).mock.calls[0];
    expect(messages[0].content).toContain('"name":"extract_data"');
    expect(messages[1].content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'image_url' }),
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('<DATA_DEMAND>'),
        }),
      ]),
    );
  });
});
