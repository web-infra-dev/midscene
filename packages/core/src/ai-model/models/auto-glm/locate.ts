import type { Rect } from '@/types';
import { generateElementByRect } from '@midscene/shared/extractor';
import { getDebug } from '@midscene/shared/logger';
import type { LocateResultElement } from '@midscene/shared/types';
import { assert } from '@midscene/shared/utils';
import type { TUserPrompt } from '../../../common';
import {
  type InspectAIArgs,
  extraTextFromUserPrompt,
  promptsToChatParam,
} from '../../inspect';
import { findElementPrompt } from '../../prompt/llm-locator';
import { callAIWithStringResponse } from '../../service-caller/index';
import { finalizePixelBbox } from '../../shared/model-locate-result/bbox';
import { mapLocateResultToPixelBboxByCoordinates } from '../../shared/model-locate-result/pixel-bbox-mapper';
import { pixelBboxToRect } from '../../workflows/inspect/locate-result-rect';
import { mapSearchAreaPixelBboxToOriginalPixelBbox } from '../../workflows/inspect/search-area-mapping';
import type {
  LocateOptions,
  LocateResult,
} from '../../workflows/inspect/types';
import { parseAutoGLMLocateResponse } from './parser';
import {
  getAutoGLMChineseLocatePrompt,
  getAutoGLMMultilingualLocatePrompt,
} from './prompt';

const debugInspect = getDebug('ai:inspect');

export async function autoGlmLocate(
  elementDescription: TUserPrompt,
  options: LocateOptions,
  isMultilingual: boolean,
): Promise<LocateResult> {
  const { context, modelRuntime } = options;
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
    {
      role: 'system',
      content: isMultilingual
        ? getAutoGLMMultilingualLocatePrompt()
        : getAutoGLMChineseLocatePrompt(),
    },
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

  const {
    content: rawResponseContent,
    usage,
    rawChoiceMessage,
  } = await callAIWithStringResponse(msgs, modelRuntime, {
    abortSignal: options.abortSignal,
  });

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

    const ctx = { preparedSize: { width: imageWidth, height: imageHeight } };
    const targetPixelBbox = finalizePixelBbox(
      mapLocateResultToPixelBboxByCoordinates(
        { type: 'point', coordinates: [x, y] },
        ctx,
        { shape: 'point', order: 'xy', normalizedBy: 1000 },
      ),
      parsed.coordinates,
      ctx,
    );
    resRect = pixelBboxToRect(
      mapSearchAreaPixelBboxToOriginalPixelBbox(
        targetPixelBbox,
        options.searchConfig?.mapping,
      ),
    );

    debugInspect('auto-glm resRect:', resRect);

    const element: LocateResultElement = generateElementByRect(
      resRect,
      elementDescriptionText as string,
    );

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
    rawChoiceMessage,
    usage,
    reasoning_content: parsed.think,
  };
}
