import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import { callAI } from '@/ai-model/service-caller/index';
import {
  AiLocateElement,
  AiLocateSection,
} from '@/ai-model/workflows/grounding';
import type { IModelConfig } from '@midscene/shared/env';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeContext } from '../utils';

vi.mock('@/ai-model/service-caller/index', async () => {
  const actual = await vi.importActual<
    typeof import('@/ai-model/service-caller/index')
  >('@/ai-model/service-caller/index');
  return {
    ...actual,
    callAI: vi.fn(),
  };
});

describe('locate user message content order', () => {
  const modelConfig: IModelConfig = {
    modelFamily: 'qwen2.5-vl',
    modelName: 'test-model',
    modelDescription: 'test-model-desc',
    intent: 'default',
    slot: 'default',
    retryCount: 0,
  };
  const adapter = new ResolvedModelAdapter(
    {
      locate: {
        userMessageContentOrder: 'prompt-first',
      },
    },
    'test-prompt-first-locate',
  );
  const modelRuntime = {
    config: modelConfig,
    adapter,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(callAI).mockResolvedValue({
      content: '{"bbox":[100,200,300,400]}',
      isStreamed: false,
    });
  });

  it('places the prompt before the image for element locate', async () => {
    await AiLocateElement({
      context: createFakeContext(),
      targetElementDescription: 'the Submit button',
      modelRuntime,
    });

    expect(vi.mocked(callAI).mock.calls[0][0][1]).toMatchObject({
      role: 'user',
      content: [
        expect.objectContaining({ type: 'text' }),
        expect.objectContaining({ type: 'image_url' }),
      ],
    });
  });

  it('places the prompt before the image for search-area locate', async () => {
    await AiLocateSection({
      context: createFakeContext(),
      sectionDescription: 'the row containing Apollo',
      modelRuntime,
    });

    expect(vi.mocked(callAI).mock.calls[0][0][1]).toMatchObject({
      role: 'user',
      content: [
        expect.objectContaining({ type: 'text' }),
        expect.objectContaining({ type: 'image_url' }),
      ],
    });
  });
});
