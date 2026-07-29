import { AiLocateElement } from '@/ai-model/inspect';
import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import { doubaoXAdapters } from '@/ai-model/models/doubao-x/adapter';
import { callAIWithStringResponse } from '@/ai-model/service-caller/index';
import type { LocateOptions } from '@/ai-model/workflows/inspect/types';
import type { UIContext } from '@/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const serviceCallerMock = vi.hoisted(() => ({
  callAIWithStringResponse: vi.fn(),
}));

vi.mock('@/ai-model/service-caller/index', () => serviceCallerMock);
vi.mock(
  '../../../../src/ai-model/service-caller/index',
  () => serviceCallerMock,
);

const adapter = new ResolvedModelAdapter(
  doubaoXAdapters['doubao-x'],
  'doubao-x',
);
const context: UIContext = {
  screenshot: { base64: 'data:image/png;base64,AA==' } as any,
  shotSize: { width: 1000, height: 800 },
  shrunkShotToLogicalRatio: 1,
};

function createLocateOptions(): LocateOptions {
  return {
    context,
    modelRuntime: {
      config: {
        modelName: 'doubao-x-test-model',
        modelFamily: 'doubao-x',
        modelDescription: 'doubao-x-test-model',
        intent: 'default',
        slot: 'default',
      },
      adapter,
    } as any,
  };
}

describe('Doubao-X custom locate', () => {
  beforeEach(() => {
    vi.mocked(callAIWithStringResponse).mockReset();
  });

  it('uses the XML65 click-only prompt and maps the point to a rect', async () => {
    vi.mocked(callAIWithStringResponse).mockResolvedValueOnce({
      content:
        '<seed:tool_call><function name="click"><parameter name="point" string="true"><point>500 500</point></parameter></function></seed:tool_call>',
      usage: { total_tokens: 8 } as any,
    });

    const result = await AiLocateElement({
      ...createLocateOptions(),
      targetElementDescription: 'submit button',
    });

    const messages = vi.mocked(callAIWithStringResponse).mock.calls[0][0];
    expect(messages[0]).toMatchObject({
      role: 'system',
      content: expect.stringContaining('"name":"click"'),
    });
    expect(messages[0]).not.toMatchObject({
      content: expect.stringContaining('"name":"type"'),
    });
    expect(result.rect).toEqual({ left: 490, top: 392, width: 20, height: 16 });
    expect(result.parseResult.errors).toEqual([]);
  });
});
