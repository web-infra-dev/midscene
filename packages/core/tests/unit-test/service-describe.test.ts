import { getModelRuntime } from '@/ai-model/models';
import { elementDescriberInstruction } from '@/ai-model/prompt/describe';
import { AIResponseParseError } from '@/ai-model/service-caller';
import Service from '@/service';
import type { IModelConfig } from '@midscene/shared/env';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeContext } from '../utils';

const { mockCallAIWithObjectResponse } = vi.hoisted(() => ({
  mockCallAIWithObjectResponse: vi.fn(),
}));
const {
  mockCompositeElementInfoImg,
  mockCompositePointMarkerImg,
  mockCropByRect,
  mockResizeImgBase64,
} = vi.hoisted(() => ({
  mockCompositeElementInfoImg: vi.fn(),
  mockCompositePointMarkerImg: vi.fn(),
  mockCropByRect: vi.fn(),
  mockResizeImgBase64: vi.fn(),
}));

vi.mock('@/ai-model/service-caller', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/ai-model/service-caller')>();
  return {
    ...actual,
    callAIWithObjectResponse: mockCallAIWithObjectResponse,
  };
});

vi.mock('@midscene/shared/img', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@midscene/shared/img')>();
  return {
    ...actual,
    compositeElementInfoImg: mockCompositeElementInfoImg,
    compositePointMarkerImg: mockCompositePointMarkerImg,
    cropByRect: mockCropByRect,
    resizeImgBase64: mockResizeImgBase64,
  };
});

describe('service.describe', () => {
  const modelConfig: IModelConfig = {
    modelFamily: 'qwen2.5-vl',
    modelName: 'test-model',
    modelDescription: 'test-model-desc',
    intent: 'default',
    slot: 'default',
  };
  const modelRuntime = getModelRuntime(modelConfig);

  beforeEach(() => {
    mockCallAIWithObjectResponse.mockReset();
    mockCompositeElementInfoImg.mockReset();
    mockCompositeElementInfoImg.mockResolvedValue(
      'data:image/png;base64,boxed',
    );
    mockCompositePointMarkerImg.mockReset();
    mockCompositePointMarkerImg.mockResolvedValue(
      'data:image/png;base64,point',
    );
    mockCropByRect.mockReset();
    mockCropByRect.mockImplementation(async (_imageBase64, rect) => ({
      width: rect.width,
      height: rect.height,
      imageBase64: 'data:image/png;base64,cropped',
    }));
    mockResizeImgBase64.mockReset();
    mockResizeImgBase64.mockResolvedValue('data:image/png;base64,resized');
  });

  it('instructs icon-only controls to include owning stable context', () => {
    const prompt = elementDescriberInstruction();

    expect(prompt).toContain('Target first');
    expect(prompt).toContain('smallest real UI part');
    expect(prompt).toContain('Owner/context');
    expect(prompt).toContain('Similar candidates');
    expect(prompt).toContain('same row, card, field, header, or group');
    expect(prompt).toContain('For tiny or icon-only controls');
    expect(prompt).toContain('For compound controls or stacked glyphs');
    expect(prompt).toContain('For inline text, links, or substrings');
    expect(prompt).toContain('For repeated rows, cards, or options');
    expect(prompt).toContain('Use selected, highlighted, hovered');
    expect(prompt).toContain('if the callout endpoint/center is inside');
    expect(prompt).toContain('empty region/gap');
    expect(prompt).toContain('Do not borrow the text, glyph, direction');
  });

  it('recovers a description response with unescaped quotes in the string value', async () => {
    const rawResponse = `\`\`\`json
{
  "description": "顶部搜索栏中的搜索输入框，placeholder 为"搜索你感兴趣的内容""
}
\`\`\``;
    mockCallAIWithObjectResponse.mockRejectedValueOnce(
      new Error(
        `failed to parse LLM response into JSON. Error - Error: Colon expected at position 59. Response - \n ${rawResponse}`,
      ),
    );

    const service = new Service(createFakeContext());
    const result = await service.describe([100, 100], modelRuntime);

    expect(result).toEqual({
      description:
        '顶部搜索栏中的搜索输入框，placeholder 为"搜索你感兴趣的内容"',
    });
  });

  it('uses a 1px rectangle marker for explicitly provided small target rects', async () => {
    mockCallAIWithObjectResponse.mockResolvedValueOnce({
      content: { description: 'small target' },
    });

    const service = new Service(createFakeContext());
    const result = await service.describe(
      { left: 10, top: 20, width: 30, height: 30 },
      modelRuntime,
    );

    expect(result).toEqual({ description: 'small target' });
    expect(mockCompositeElementInfoImg).toHaveBeenCalledWith(
      expect.objectContaining({
        elementsPositionInfo: [
          {
            rect: { left: 10, top: 20, width: 30, height: 30 },
          },
        ],
        borderThickness: 1,
      }),
    );
    expect(mockCompositePointMarkerImg).not.toHaveBeenCalled();
  });

  it('uses a 2px rectangle marker for larger target rects', async () => {
    mockCallAIWithObjectResponse.mockResolvedValueOnce({
      content: { description: 'large target' },
    });

    const service = new Service(createFakeContext());
    await service.describe(
      { left: 10, top: 20, width: 80, height: 50 },
      modelRuntime,
    );

    expect(mockCompositeElementInfoImg).toHaveBeenCalledWith(
      expect.objectContaining({
        elementsPositionInfo: [
          {
            rect: { left: 10, top: 20, width: 80, height: 50 },
          },
        ],
        borderThickness: 2,
      }),
    );
    expect(mockCompositePointMarkerImg).not.toHaveBeenCalled();
  });

  it('uses a rectangle marker for small target rects during deepDescribe retries', async () => {
    mockCallAIWithObjectResponse.mockResolvedValueOnce({
      content: { description: 'small target retry' },
    });

    const service = new Service(createFakeContext());
    await service.describe(
      { left: 10, top: 20, width: 30, height: 30 },
      modelRuntime,
      { deepDescribe: true },
    );

    expect(mockCompositeElementInfoImg).toHaveBeenCalledWith(
      expect.objectContaining({
        elementsPositionInfo: [
          {
            rect: { left: 10, top: 20, width: 30, height: 30 },
          },
        ],
        borderThickness: 1,
      }),
    );
    expect(mockCompositePointMarkerImg).not.toHaveBeenCalled();
  });

  it('uses a rectangle marker for thin wide target regions', async () => {
    mockCallAIWithObjectResponse.mockResolvedValue({
      content: { description: 'thin blank region' },
    });

    const service = new Service(createFakeContext());
    await service.describe(
      { left: 10, top: 20, width: 120, height: 30 },
      modelRuntime,
      { deepDescribe: true },
    );

    expect(mockCompositeElementInfoImg).toHaveBeenCalledWith(
      expect.objectContaining({
        elementsPositionInfo: [
          {
            rect: { left: 28, top: 23, width: 84, height: 24 },
          },
        ],
        borderThickness: 2,
      }),
    );
    expect(mockCompositePointMarkerImg).not.toHaveBeenCalled();
  });

  it('sends overview and focused crop for deepDescribe retries', async () => {
    mockCallAIWithObjectResponse.mockResolvedValueOnce({
      content: { description: 'wide target with focused context' },
    });

    const service = new Service(createFakeContext());
    const result = await service.describe(
      { left: 10, top: 20, width: 120, height: 30 },
      modelRuntime,
      { deepDescribe: true },
    );

    expect(result).toEqual({
      description: 'wide target with focused context',
    });
    expect(mockCallAIWithObjectResponse).toHaveBeenCalledTimes(1);
    expect(mockCropByRect).toHaveBeenCalledTimes(1);
    expect(mockCropByRect.mock.calls.map(([image]) => image)).not.toContain(
      'data:image/png;base64,boxed',
    );
    expect(mockCropByRect).not.toHaveBeenCalledWith(
      expect.stringMatching(/^data:image\/.+;base64,/),
      { left: 10, top: 20, width: 120, height: 30 },
    );

    const msgs = mockCallAIWithObjectResponse.mock.calls[0][0];
    const content = msgs[1].content as Array<{
      type: string;
      text?: string;
      image_url?: { url: string; detail: string };
    }>;
    expect(content.filter((item) => item.type === 'image_url')).toHaveLength(2);
    expect(
      content.filter((item) => item.type === 'image_url')[0]?.image_url?.url,
    ).toBe('data:image/png;base64,boxed');
    expect(content.map((item) => item.text).filter(Boolean)).toEqual([
      'Use these images together to describe the real UI target marked by the temporary callout. Do not describe the marker itself.',
      'Image 1: full screenshot overview with the target marker, for page position and ownership context.',
      'Image 2: focused detail crop around the target, for reading text, icon shape, and exact local boundaries.',
    ]);
  });

  it('uses focused crop-local markers for label-like targets during deepDescribe retries', async () => {
    mockCallAIWithObjectResponse.mockResolvedValueOnce({
      content: { description: 'row status label' },
    });

    const service = new Service(createFakeContext());
    await service.describe(
      { left: 1500, top: 500, width: 56, height: 20 },
      modelRuntime,
      { deepDescribe: true },
    );

    expect(mockCropByRect).toHaveBeenCalledWith(expect.any(String), {
      left: 1313,
      top: 325,
      width: 431,
      height: 371,
    });
    expect(mockCropByRect.mock.calls.map(([image]) => image)).not.toContain(
      'data:image/png;base64,boxed',
    );
    expect(mockCompositeElementInfoImg).toHaveBeenCalledWith(
      expect.objectContaining({
        inputImgBase64: 'data:image/png;base64,cropped',
        size: { width: 431, height: 371 },
        elementsPositionInfo: [
          {
            rect: { left: 187, top: 175, width: 56, height: 20 },
          },
        ],
      }),
    );
  });

  it('uses a point marker without cropping for bare point targets', async () => {
    mockCallAIWithObjectResponse.mockResolvedValueOnce({
      content: { description: 'point target' },
    });

    const service = new Service(createFakeContext());
    await service.describe([100, 100], modelRuntime);

    expect(mockCropByRect).not.toHaveBeenCalled();
    expect(mockCompositePointMarkerImg).toHaveBeenCalledWith(
      expect.objectContaining({
        point: { x: 100, y: 100 },
      }),
    );
    expect(mockCompositeElementInfoImg).not.toHaveBeenCalled();
  });

  it('uses focused crop-local markers for bare point targets during deepDescribe retries', async () => {
    mockCallAIWithObjectResponse.mockResolvedValueOnce({
      content: { description: 'point target with row context' },
    });

    const service = new Service(createFakeContext());
    const result = await service.describe([1500, 500], modelRuntime, {
      deepDescribe: true,
    });

    expect(result).toMatchObject({
      description: 'point target with row context',
    });

    expect(mockCropByRect).toHaveBeenCalledWith(expect.any(String), {
      left: 1300,
      top: 300,
      width: 400,
      height: 400,
    });
    expect(mockCropByRect.mock.calls.map(([image]) => image)).not.toContain(
      'data:image/png;base64,point',
    );
    expect(mockCompositePointMarkerImg).toHaveBeenCalledWith(
      expect.objectContaining({
        point: { x: 1500, y: 500 },
      }),
    );
    expect(mockCompositePointMarkerImg).toHaveBeenCalledWith(
      expect.objectContaining({
        inputImgBase64: 'data:image/png;base64,cropped',
        size: { width: 400, height: 400 },
        point: { x: 200, y: 200 },
      }),
    );
    expect(mockCompositeElementInfoImg).not.toHaveBeenCalled();
    expect(mockCallAIWithObjectResponse).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['top-left corner', [4, 6]],
    ['top-right corner', [1916, 6]],
    ['bottom-left corner', [4, 1074]],
    ['bottom-right corner', [1916, 1074]],
    ['left edge', [4, 540]],
    ['right edge', [1916, 540]],
    ['top edge', [960, 6]],
    ['bottom edge', [960, 1074]],
  ] as const)(
    'keeps crop-local point markers anchored to the original click point near the %s',
    async (_name, point) => {
      mockCallAIWithObjectResponse.mockResolvedValueOnce({
        content: { description: 'edge point target' },
      });

      const service = new Service(createFakeContext());
      await service.describe(point, modelRuntime, {
        deepDescribe: true,
      });

      const cropRect = mockCropByRect.mock.calls[0][1];
      expect(mockCompositePointMarkerImg).toHaveBeenCalledWith(
        expect.objectContaining({
          inputImgBase64: 'data:image/png;base64,cropped',
          point: {
            x: point[0] - cropRect.left,
            y: point[1] - cropRect.top,
          },
        }),
      );
    },
  );

  it('recovers from structured AI response parse errors when rawResponse is available', async () => {
    const rawResponse =
      '{"description": "搜索输入框，placeholder 为"搜索你感兴趣的内容""}';
    mockCallAIWithObjectResponse.mockRejectedValueOnce(
      new AIResponseParseError('failed to parse json response', rawResponse),
    );

    const service = new Service(createFakeContext());
    const result = await service.describe([100, 100], modelRuntime);

    expect(result).toEqual({
      description: '搜索输入框，placeholder 为"搜索你感兴趣的内容"',
    });
  });

  it('keeps non-description parse failures strict', async () => {
    mockCallAIWithObjectResponse.mockRejectedValueOnce(
      new Error(
        'failed to parse LLM response into JSON. Error - Error: invalid. Response - \n {"error": "bad response"}',
      ),
    );

    const service = new Service(createFakeContext());
    await expect(service.describe([100, 100], modelRuntime)).rejects.toThrow(
      'failed to parse LLM response into JSON',
    );
  });
});
