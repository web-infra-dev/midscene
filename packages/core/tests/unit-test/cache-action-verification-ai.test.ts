import { verifyCacheActionWithAI } from '@/ai-model/cache-action-verification';
import { getModelRuntime } from '@/ai-model/models';
import { callAIWithObjectResponse } from '@/ai-model/service-caller';
import { ScreenshotItem } from '@/screenshot-item';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/ai-model/service-caller', () => ({
  callAIWithObjectResponse: vi.fn(),
}));

const modelRuntime = getModelRuntime({
  modelName: 'mock-model',
  modelDescription: 'mock model',
  intent: 'insight',
  slot: 'insight',
});
const dataDemand = {
  status: 'status demand',
  reason: 'reason demand',
};

describe('verifyCacheActionWithAI', () => {
  beforeEach(() => {
    vi.mocked(callAIWithObjectResponse).mockReset();
    vi.mocked(callAIWithObjectResponse).mockResolvedValue({
      content: { status: 'passed', reason: 'visible change' },
      contentString: '{"status":"passed","reason":"visible change"}',
    });
  });

  it('sends one focused comparison image with a concise JSON contract', async () => {
    const screenshot = ScreenshotItem.create(
      'data:image/png;base64,comparison',
      2,
    );

    await expect(
      verifyCacheActionWithAI({
        mode: 'focused-comparison',
        screenshots: [screenshot],
        dataDemand,
        modelRuntime,
      }),
    ).resolves.toMatchObject({
      data: { status: 'passed', reason: 'visible change' },
    });

    const [messages, runtime, options] = vi.mocked(callAIWithObjectResponse)
      .mock.calls[0];
    expect(messages[0]).toMatchObject({
      role: 'system',
      content: expect.stringContaining('Return only one JSON object'),
    });
    expect(messages[1]).toEqual({
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: {
            url: screenshot.base64,
            detail: 'high',
          },
        },
        {
          type: 'text',
          text: `Verification demand:\n${JSON.stringify(dataDemand)}`,
        },
      ],
    });
    expect(runtime).toBe(modelRuntime);
    expect(options).toEqual({
      abortSignal: undefined,
      jsonParserSource: 'generic-object',
    });
  });

  it('labels full-frame screenshots in chronological order', async () => {
    const before = ScreenshotItem.create('data:image/png;base64,before', 1);
    const after = ScreenshotItem.create('data:image/png;base64,after', 2);

    await verifyCacheActionWithAI({
      mode: 'full-frame',
      screenshots: [before, after],
      dataDemand,
      modelRuntime,
    });

    expect(vi.mocked(callAIWithObjectResponse).mock.calls[0][0][1]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'Before screenshot:' },
        {
          type: 'image_url',
          image_url: { url: before.base64, detail: 'high' },
        },
        { type: 'text', text: 'After screenshot:' },
        {
          type: 'image_url',
          image_url: { url: after.base64, detail: 'high' },
        },
        {
          type: 'text',
          text: `Verification demand:\n${JSON.stringify(dataDemand)}`,
        },
      ],
    });
  });
});
