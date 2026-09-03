import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import { getModelRuntime } from '@/ai-model/models';
import { qwenAdapters } from '@/ai-model/models/qwen/adapter';
import { qwenElementProtocol } from '@/ai-model/models/qwen/element-protocol';
import { callAI } from '@/ai-model/service-caller/index';
import { createLocateResultCodec } from '@/ai-model/shared/model-locate-result/factory';
import { AiLocateElement } from '@/ai-model/workflows/grounding';
import { beforeEach, describe, expect, it, rs } from '@rstest/core';
import { createFakeContext } from '../../../utils';

import * as serviceCallerActual from '@/ai-model/service-caller/index' with {
  rstest: 'importActual',
};

rs.mock('@/ai-model/service-caller/index', () => ({
  ...serviceCallerActual,
  callAI: rs.fn(),
}));

const adapter = new ResolvedModelAdapter(qwenAdapters.qwen3, 'qwen3');
const locate = adapter.locate;
if (locate.kind !== 'standard') {
  throw new Error('Qwen should use standard locate');
}
const { protocol, resultCodec } = locate.element;

const clickResponse = `<tool_call>
<function=computer_use>
<parameter=action>
left_click
</parameter>
<parameter=coordinate>
[320,460]
</parameter>
</function>
</tool_call>`;

const failureResponse = `<tool_call>
<function=computer_use>
<parameter=action>terminate</parameter>
<parameter=status>failure</parameter>
</function>
</tool_call>`;

describe('Qwen element locate protocol', () => {
  beforeEach(() => {
    rs.clearAllMocks();
  });

  it('describes the base computer_use click format without locator nesting', () => {
    const instructions = protocol.buildResponseInstructions(
      resultCodec.promptSpec,
    );
    const tools = instructions.match(/<tools>\s*([\s\S]*?)\s*<\/tools>/);
    expect(tools).not.toBeNull();
    expect(JSON.parse(tools![1])).toMatchObject({
      type: 'function',
      function: {
        name: 'computer_use',
        parameters: {
          properties: {
            action: { type: 'string', enum: ['left_click', 'terminate'] },
            coordinate: { type: 'array' },
            status: { type: 'string', enum: ['success', 'failure'] },
          },
        },
      },
    });
    expect(instructions).toContain('<parameter=coordinate>');
    expect(instructions).toContain('normalized to 0-1000');
    expect(instructions).not.toContain('<prompt>');
    expect(instructions).not.toContain('<coordinate>');
    expect(protocol.buildUserPrompt('Submit button')).toBe(
      'Find: Submit button',
    );
    expect(protocol.expectedJsonObjectResponse).toBe(false);
  });

  it('derives coordinate instructions from the result codec', () => {
    const pixelCodec = createLocateResultCodec({
      coordinates: { shape: 'point', order: 'xy' },
    });
    const instructions = qwenElementProtocol.buildResponseInstructions(
      pixelCodec.promptSpec,
    );
    expect(instructions).toContain('in actual pixel coordinates');
    expect(instructions).not.toContain('0-1000');
  });

  it('keeps coordinate JSON raw until the codec maps it to pixels', () => {
    const result = protocol.parseRawResponse(
      `Action: Click the submit button.\n${clickResponse}`,
      resultCodec.promptSpec,
    );
    expect(result).toEqual({ kind: 'located', target: '[320,460]' });
    if (result.kind !== 'located') {
      throw new Error('Expected located result');
    }
    expect(
      resultCodec.toPixelBbox(result.target, {
        preparedSize: { width: 1001, height: 1001 },
      }),
    ).toEqual([310, 450, 330, 470]);
  });

  it('maps terminate failure to not-found', () => {
    expect(
      protocol.parseRawResponse(failureResponse, resultCodec.promptSpec),
    ).toEqual({
      kind: 'not-found',
      error: 'Qwen could not find the requested element',
    });
  });

  it.each([
    'No element found',
    clickResponse.replace('computer_use', 'Tap'),
    clickResponse.replace('left_click', 'scroll'),
    clickResponse.replace('<parameter=coordinate>', '<parameter=point>'),
    clickResponse.replace(
      '</function>',
      '<parameter=coordinate>[1,2]</parameter></function>',
    ),
    failureResponse.replace('failure', 'success'),
  ])(
    'rejects a response that does not follow the locate contract: %s',
    (response) => {
      expect(() =>
        protocol.parseRawResponse(response, resultCodec.promptSpec),
      ).toThrow();
    },
  );

  it.each([
    '[320]',
    '[320,460,500]',
    '[320.5,460]',
    '["320",460]',
    '320,460',
    '[1001,460]',
  ])('rejects invalid coordinates in the codec: %s', (value) => {
    expect(() =>
      resultCodec.toPixelBbox(value, {
        preparedSize: { width: 1001, height: 1001 },
      }),
    ).toThrow();
  });

  it('runs aiLocate through the Qwen prompt, parser and coordinate codec', async () => {
    rs.mocked(callAI).mockResolvedValue({
      content: clickResponse,
      isStreamed: false,
    });
    const result = await AiLocateElement({
      context: createFakeContext(),
      targetElementDescription: 'Submit button',
      modelRuntime: getModelRuntime({
        modelFamily: 'qwen3',
        modelName: 'test-model',
        modelDescription: 'Qwen locate protocol test',
        intent: 'default',
        slot: 'default',
        retryCount: 0,
      }),
    });

    expect(result.rect).toBeDefined();
    expect(result.parseResult.errors).toEqual([]);
    expect(result.rawResponse).toBe(clickResponse);
    expect(rs.mocked(callAI).mock.calls[0][0][0]).toMatchObject({
      role: 'system',
      content: expect.stringContaining('<parameter=coordinate>'),
    });
    expect(rs.mocked(callAI).mock.calls[0][2]).toMatchObject({
      expectedJsonObjectResponse: false,
    });
  });

  it('returns not-found from aiLocate without inventing a coordinate', async () => {
    rs.mocked(callAI).mockResolvedValue({
      content: failureResponse,
      isStreamed: false,
    });
    const result = await AiLocateElement({
      context: createFakeContext(),
      targetElementDescription: 'Missing button',
      modelRuntime: getModelRuntime({
        modelFamily: 'qwen3',
        modelName: 'test-model',
        modelDescription: 'Qwen locate protocol test',
        intent: 'default',
        slot: 'default',
        retryCount: 0,
      }),
    });
    expect(result.rect).toBeUndefined();
    expect(result.parseResult.errors).toEqual([
      'Qwen could not find the requested element',
    ]);
  });
});
