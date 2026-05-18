import { createLocateResultElementFromPoint } from '@/locate-result-element';
import type { Rect } from '@/types';
import { getDebug } from '@midscene/shared/logger';
import type { LocateResultElement } from '@midscene/shared/types';
import { assert } from '@midscene/shared/utils';
import type { TUserPrompt } from '../../../common';
import { findElementPrompt } from '../../prompts/llm-locator';
import { callAIWithStringResponse } from '../../service-caller/index';
import {
  type InspectAIArgs,
  extraTextFromUserPrompt,
  promptsToChatParam,
} from '../../workflows/inspect/helpers';
import type {
  LocateOptions,
  LocateResult,
} from '../../workflows/inspect/types';
import { parseAutoGLMLocateResponse } from './parser';

const debugInspect = getDebug('ai:inspect');

export async function autoGlmLocate(
  elementDescription: TUserPrompt,
  options: LocateOptions,
  getSystemPrompt: () => string,
): Promise<LocateResult> {
  const { context, modelConfig } = options;
  const screenshotBase64 = context.screenshot.base64;

  assert(elementDescription, 'cannot find the target element description');
  const elementDescriptionText = extraTextFromUserPrompt(elementDescription);
  const userInstructionPrompt = findElementPrompt(elementDescriptionText);

  const locateImage = options.searchConfig?.image ?? {
    imageBase64: screenshotBase64,
    width: context.shotSize.width,
    height: context.shotSize.height,
  };
  const imagePayload = locateImage.imageBase64;
  const imageWidth = locateImage.width;
  const imageHeight = locateImage.height;

  const msgs: InspectAIArgs = [
    { role: 'system', content: getSystemPrompt() },
    {
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: {
            url: imagePayload,
            detail: 'high',
          },
        },
        {
          type: 'text',
          text: `Tap: ${userInstructionPrompt}`,
        },
      ],
    },
  ];

  if (typeof elementDescription !== 'string') {
    const addOns = await promptsToChatParam({
      images: elementDescription.images,
      convertHttpImage2Base64: elementDescription.convertHttpImage2Base64,
    });
    msgs.push(...addOns);
  }

  const { content: rawResponseContent, usage } = await callAIWithStringResponse(
    msgs,
    modelConfig,
    {
      abortSignal: options.abortSignal,
    },
  );

  debugInspect('auto-glm rawResponse:', rawResponseContent);

  const parsed = parseAutoGLMLocateResponse(rawResponseContent);

  debugInspect('auto-glm thinking:', parsed.think);
  debugInspect('auto-glm coordinates:', parsed.coordinates);

  let resRect: Rect | undefined;
  let matchedElement: LocateResultElement | undefined;
  let errors: string[] = [];

  if (parsed.error || !parsed.coordinates) {
    errors = [parsed.error || 'Failed to parse auto-glm response'];
    debugInspect('auto-glm parse error:', errors[0]);
  } else {
    const { x, y } = parsed.coordinates;

    debugInspect('auto-glm coordinates [0-999]:', { x, y });

    const pixelX = Math.round((x * imageWidth) / 1000);
    const pixelY = Math.round((y * imageHeight) / 1000);

    debugInspect('auto-glm pixel coordinates:', { pixelX, pixelY });

    const mapping = options.searchConfig?.mapping;
    const offset = mapping?.offset ?? { x: 0, y: 0 };
    const scale = mapping?.scale ?? 1;
    const finalX =
      (scale !== 1 ? Math.round(pixelX / scale) : pixelX) + offset.x;
    const finalY =
      (scale !== 1 ? Math.round(pixelY / scale) : pixelY) + offset.y;

    const element: LocateResultElement = createLocateResultElementFromPoint(
      [finalX, finalY],
      elementDescriptionText as string,
    );

    resRect = element.rect;
    debugInspect('auto-glm resRect:', resRect);

    if (element) {
      matchedElement = element;
    }
  }

  return {
    rect: resRect,
    parseResult: {
      element: matchedElement,
      errors,
    },
    rawResponse: rawResponseContent,
    usage,
    reasoning_content: parsed.think,
  };
}
