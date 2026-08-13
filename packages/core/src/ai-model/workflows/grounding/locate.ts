import type { AIElementLocateResponse } from '@/types';
import { generateElementByRect } from '@midscene/shared/extractor';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import type { TUserPrompt } from '../../../common';
import {
  multimodalPromptToChatMessages,
  userPromptToMultimodalPrompt,
  userPromptToString,
} from '../../../common';
import { prepareModelImage } from '../../model-adapter/image-preprocess';
import type { ModelRuntime } from '../../models';
import {
  findElementPrompt,
  systemPromptToLocateElement,
} from '../../prompt/llm-locator';
import {
  AIResponseParseError,
  callAI,
  parseAIObjectResponse,
} from '../../service-caller/index';
import {
  callAiAndParseWithRetry,
  withSemanticRetryFeedback,
} from '../../service-caller/semantic-retry';
import { pixelBboxToRect } from './locate-result-rect';
import { mapSearchAreaPixelBboxToOriginalPixelBbox } from './search-area-mapping';
import type {
  LocateModelResponse,
  LocateOptions,
  LocateRequestContext,
  LocateResult,
} from './types';
import {
  type GroundingAIArgs,
  formatLocateModelContext,
  hasLocateResult,
} from './utils';

const debugGrounding = getDebug('ai:grounding');

export {
  userPromptToString as extraTextFromUserPrompt,
  multimodalPromptToChatMessages as promptsToChatParam,
} from '../../../common';

export async function AiLocateElement(
  options: LocateOptions & { targetElementDescription: TUserPrompt },
): Promise<LocateResult> {
  const { targetElementDescription, ...locateOptions } = options;
  assert(
    targetElementDescription,
    'cannot find the target element description',
  );

  const { context } = locateOptions;
  const locateImage = locateOptions.searchConfig?.image ?? {
    imageBase64: context.screenshot.base64,
    width: context.shotSize.width,
    height: context.shotSize.height,
  };
  const referenceImageMessages =
    typeof targetElementDescription === 'string'
      ? undefined
      : await multimodalPromptToChatMessages(
          userPromptToMultimodalPrompt(targetElementDescription),
        );
  const locateRequest: LocateRequestContext = {
    elementDescriptionText: userPromptToString(targetElementDescription),
    locateImage,
    referenceImageMessages,
    options: locateOptions,
  };

  const locateAdapter = options.modelRuntime.adapter.locate;
  const locateFn =
    locateAdapter.kind === 'custom' ? locateAdapter.locateFn : genericLocate;
  const locateResponse = await locateFn(
    targetElementDescription,
    locateOptions,
    locateRequest,
  );
  const {
    locatedPixelBbox,
    rawResponse,
    rawChoiceMessage,
    usage,
    reasoningContent,
    errors = [],
  } = locateResponse;
  const baseLocateResult = {
    rawResponse,
    rawChoiceMessage,
    usage,
    reasoning_content: reasoningContent,
  };

  if (!locatedPixelBbox) {
    return {
      rect: undefined,
      parseResult: {
        element: undefined,
        errors,
      },
      ...baseLocateResult,
    };
  }

  try {
    const rect = pixelBboxToRect(
      mapSearchAreaPixelBboxToOriginalPixelBbox(
        locatedPixelBbox,
        locateOptions.searchConfig?.mapping,
      ),
    );
    debugGrounding('resRect', rect);

    return {
      rect,
      parseResult: {
        element: generateElementByRect(
          rect,
          locateRequest.elementDescriptionText,
        ),
        errors: [],
      },
      ...baseLocateResult,
    };
  } catch (error) {
    const msg =
      error instanceof Error
        ? `Failed to parse locate result: ${error.message}`
        : 'unknown error in locate';
    return {
      rect: undefined,
      parseResult: {
        element: undefined,
        errors: errors.length > 0 ? [...errors, `(${msg})`] : [msg],
      },
      ...baseLocateResult,
    };
  }
}

export async function genericLocate(
  _elementDescription: TUserPrompt,
  options: LocateOptions,
  locateRequest: LocateRequestContext,
): Promise<LocateModelResponse> {
  const modelRuntime = options.modelRuntime;
  const { adapter } = modelRuntime;
  assert(
    adapter.locate.kind === 'standard',
    'generic locate requires a standard locate adapter',
  );
  const resultAdapter = adapter.locate.resultAdapter;
  const userInstructionPrompt = findElementPrompt(
    locateRequest.elementDescriptionText,
  );
  const systemPrompt = systemPromptToLocateElement(
    adapter.locate.resultAdapter.promptSpec,
  );

  const preparedImage = await prepareModelImage({
    imageBase64: locateRequest.locateImage.imageBase64,
    width: locateRequest.locateImage.width,
    height: locateRequest.locateImage.height,
    policy: adapter.imagePreprocess,
  });

  const imagePayload = preparedImage.imageBase64;

  const msgs: GroundingAIArgs = [
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

  if (locateRequest.referenceImageMessages) {
    msgs.push(...locateRequest.referenceImageMessages);
  }

  try {
    return await callAiAndParseWithRetry({
      callAi: (retryAttempt, previousParseError) =>
        callAI(
          withSemanticRetryFeedback(msgs, previousParseError),
          modelRuntime,
          {
            abortSignal: options.abortSignal,
            expectedJsonObjectResponse: true,
            semanticRetryAttempt: retryAttempt,
          },
        ),
      parseResponse: (response): LocateModelResponse => {
        const result = parseAIObjectResponse<AIElementLocateResponse>(
          response,
          modelRuntime,
          'locate',
        );
        const rawResponse = result.contentString;
        const locateError = result.content.error;
        if (
          !hasLocateResult(result.content, resultAdapter.promptSpec.resultKey)
        ) {
          return {
            rawResponse,
            rawChoiceMessage: result.rawChoiceMessage,
            usage: result.usage,
            reasoningContent: result.reasoning_content,
            errors: locateError ? [locateError] : [],
          };
        }

        try {
          const locatedPixelBbox =
            resultAdapter.adaptElementLocateResultToPixelBbox(result.content, {
              preparedSize: preparedImage.preparedSize,
              contentSize: preparedImage.contentSize,
            });
          return {
            locatedPixelBbox,
            rawResponse,
            rawChoiceMessage: result.rawChoiceMessage,
            usage: result.usage,
            reasoningContent: result.reasoning_content,
            errors: [],
          };
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          const message = [
            locateError && `error in locate result: ${locateError}`,
            `coordinate parsing error: ${errorMessage}`,
            formatLocateModelContext(modelRuntime),
          ]
            .filter(Boolean)
            .join('\n');
          throw new Error(message, { cause: error });
        }
      },
      toParseError: (error, response) => {
        const parseErrorMessage =
          error instanceof Error
            ? `Failed to parse locate result: ${error.message}`
            : 'unknown error in locate result';
        return new AIResponseParseError(
          parseErrorMessage,
          response.content,
          response.usage,
          response.rawChoiceMessage,
          response.reasoning_content,
        );
      },
      parseRetryTimes: modelRuntime.config.retryCount,
      parseRetryInterval: modelRuntime.config.retryInterval,
      abortSignal: options.abortSignal,
      onParseRetry: (error) => {
        debugGrounding(
          'retrying locate after coordinate parsing failed: %s',
          error instanceof Error ? error.message : String(error),
        );
      },
    });
  } catch (callError) {
    if (callError instanceof AIResponseParseError) {
      return {
        rawResponse: callError.rawResponse,
        rawChoiceMessage: callError.rawChoiceMessage,
        usage: callError.usage,
        reasoningContent: callError.reasoningContent,
        errors: [callError.message],
      };
    }

    const errorMessage =
      callError instanceof Error ? callError.message : String(callError);
    return {
      rawResponse: errorMessage,
      errors: [`AI call error: ${errorMessage}`],
    };
  }
}
