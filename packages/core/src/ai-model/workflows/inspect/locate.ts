import { createLocateResultElementFromRect } from '@/locate-result-element';
import type { AIElementResponse, Rect } from '@/types';
import { getDebug } from '@midscene/shared/logger';
import type { LocateResultElement } from '@midscene/shared/types';
import { assert } from '@midscene/shared/utils';
import type { TUserPrompt } from '../../../common';
import { getModelAdapter } from '../../models';
import {
  findElementPrompt,
  systemPromptToLocateElement,
} from '../../prompts/llm-locator';
import {
  AIResponseParseError,
  callAIWithObjectResponse,
} from '../../service-caller/index';
import { prepareModelImage } from '../image-preprocess';
import {
  type InspectAIArgs,
  extraTextFromUserPrompt,
  promptsToChatParam,
} from './helpers';
import { adaptModelLocateResultToRect } from './locate-result-rect';
import type { LocateOptions, LocateResult } from './types';

const debugInspect = getDebug('ai:inspect');

export async function AiLocateElement(
  options: LocateOptions & { targetElementDescription: TUserPrompt },
): Promise<LocateResult> {
  const { targetElementDescription, ...locateOptions } = options;
  const locateAdapter = getModelAdapter(options.modelConfig.modelFamily).locate;
  if (locateAdapter.kind === 'custom') {
    return locateAdapter.locateFn(targetElementDescription, locateOptions);
  }
  return genericLocate(targetElementDescription, locateOptions);
}

export async function genericLocate(
  elementDescription: TUserPrompt,
  options: LocateOptions,
): Promise<LocateResult> {
  const { context, modelConfig } = options;
  const { modelFamily } = modelConfig;
  const adapter = getModelAdapter(modelFamily);
  assert(
    adapter.locate.kind === 'standard',
    'generic locate requires a standard locate adapter',
  );
  const screenshotBase64 = context.screenshot.base64;

  assert(elementDescription, 'cannot find the target element description');
  const elementDescriptionText = extraTextFromUserPrompt(elementDescription);
  const userInstructionPrompt = findElementPrompt(elementDescriptionText);
  const systemPrompt = systemPromptToLocateElement(modelFamily);

  const modelImage = options.searchConfig?.image ?? {
    imageBase64: screenshotBase64,
    width: context.shotSize.width,
    height: context.shotSize.height,
  };
  const preparedImage = await prepareModelImage({
    imageBase64: modelImage.imageBase64,
    width: modelImage.width,
    height: modelImage.height,
    policy: adapter.imagePreprocess,
  });

  const imagePayload = preparedImage.imageBase64;

  const msgs: InspectAIArgs = [
    { role: 'system', content: systemPrompt },
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
          text: userInstructionPrompt,
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

  let res: Awaited<
    ReturnType<
      typeof callAIWithObjectResponse<AIElementResponse | [number, number]>
    >
  >;
  try {
    res = await callAIWithObjectResponse<AIElementResponse | [number, number]>(
      msgs,
      modelConfig,
      { abortSignal: options.abortSignal },
    );
  } catch (callError) {
    const errorMessage =
      callError instanceof Error ? callError.message : String(callError);
    const rawResponse =
      callError instanceof AIResponseParseError
        ? callError.rawResponse
        : errorMessage;
    const usage =
      callError instanceof AIResponseParseError ? callError.usage : undefined;
    return {
      rect: undefined,
      parseResult: {
        element: undefined,
        errors: [`AI call error: ${errorMessage}`],
      },
      rawResponse,
      usage,
      reasoning_content: undefined,
    };
  }

  const rawResponse = JSON.stringify(res.content);

  let resRect: Rect | undefined;
  let matchedElement: LocateResultElement | undefined;
  let errors: string[] | undefined =
    'errors' in res.content ? res.content.errors : [];
  try {
    const rawResult = adapter.locate.resultAdapter.extractRawLocateResult(
      res.content,
    );
    if (Array.isArray(rawResult) && rawResult.length >= 1) {
      const mapping = options.searchConfig?.mapping;
      resRect = adaptModelLocateResultToRect(rawResult, {
        width: preparedImage.preparedSize.width,
        height: preparedImage.preparedSize.height,
        bounds: preparedImage.contentSize,
        mapping,
        modelFamily,
      });

      debugInspect('resRect', resRect);

      const element: LocateResultElement = createLocateResultElementFromRect(
        resRect,
        elementDescriptionText as string,
      );
      errors = [];

      if (element) {
        matchedElement = element;
      }
    }
  } catch (e) {
    const msg =
      e instanceof Error
        ? `Failed to parse bbox: ${e.message}`
        : 'unknown error in locate';
    if (!errors || errors?.length === 0) {
      errors = [msg];
    } else {
      errors.push(`(${msg})`);
    }
  }

  return {
    rect: resRect,
    parseResult: {
      element: matchedElement,
      errors: errors as string[],
    },
    rawResponse,
    usage: res.usage,
    reasoning_content: res.reasoning_content,
  };
}
