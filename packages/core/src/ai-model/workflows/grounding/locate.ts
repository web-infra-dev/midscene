import { generateElementByRect } from '@midscene/shared/extractor';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import type { TUserPrompt } from '../../../common';
import {
  userPromptToMultimodalPrompt,
  userPromptToString,
} from '../../../common';
import { prepareModelImage } from '../../model-adapter/image-preprocess';
import { systemPromptToLocateElement } from '../../prompt/llm-locator';
import { AIResponseParseError, callAI } from '../../service-caller/index';
import {
  callAiAndParseWithRetry,
  withSemanticRetryFeedback,
} from '../../service-caller/semantic-retry';
import { multimodalPromptToChatMessages } from '../../shared/multimodal-prompt';
import { pixelBboxToRect } from './locate-result-rect';
import { mapSearchAreaPixelBboxToOriginalPixelBbox } from './search-area-mapping';
import type {
  LocateModelResponse,
  LocateOptions,
  LocateRequest,
  LocateResult,
} from './types';
import {
  type GroundingAIArgs,
  buildLocateMessages,
  formatLocateModelContext,
} from './utils';

const debugGrounding = getDebug('ai:grounding');

export { userPromptToString as extraTextFromUserPrompt } from '../../../common';
export { multimodalPromptToChatMessages as promptsToChatParam } from '../../shared/multimodal-prompt';

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
  const locateRequest: LocateRequest = {
    targetElementDescription,
    locateImage,
    options: locateOptions,
  };

  const locateAdapter = options.modelRuntime.adapter.locate;
  const locateFn =
    locateAdapter.kind === 'custom' ? locateAdapter.locateFn : genericLocate;
  const locateResponse = await locateFn(locateRequest);
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
          userPromptToString(targetElementDescription),
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
  locateRequest: LocateRequest,
): Promise<LocateModelResponse> {
  const { options, targetElementDescription } = locateRequest;
  const modelRuntime = options.modelRuntime;
  const { adapter } = modelRuntime;
  assert(
    adapter.locate.kind === 'standard',
    'generic locate requires a standard locate adapter',
  );
  const { protocol, resultCodec } = adapter.locate.element;
  const elementDescriptionText = userPromptToString(targetElementDescription);
  const userInstructionPrompt = protocol.buildUserPrompt(
    elementDescriptionText,
  );
  const systemPrompt = systemPromptToLocateElement({
    systemPromptIntroduction: protocol.systemPromptIntroduction,
    responseInstructions: protocol.buildResponseInstructions(
      resultCodec.promptSpec,
    ),
  });

  const preparedImage = await prepareModelImage({
    imageBase64: locateRequest.locateImage.imageBase64,
    width: locateRequest.locateImage.width,
    height: locateRequest.locateImage.height,
    policy: adapter.imagePreprocess,
  });

  const imagePayload = preparedImage.imageBase64;
  const referenceImageMessages = await multimodalPromptToChatMessages(
    userPromptToMultimodalPrompt(targetElementDescription),
  );

  const msgs: GroundingAIArgs = buildLocateMessages({
    systemPrompt,
    imagePayload,
    userPrompt: userInstructionPrompt,
    userMessageContentOrder: adapter.locate.userMessageContentOrder,
    additionalMessages: referenceImageMessages,
  });

  try {
    return await callAiAndParseWithRetry({
      callAi: (retryAttempt, previousParseError) =>
        callAI(
          withSemanticRetryFeedback(msgs, previousParseError),
          modelRuntime,
          {
            abortSignal: options.abortSignal,
            expectedJsonObjectResponse: protocol.expectedJsonObjectResponse,
            semanticRetryAttempt: retryAttempt,
          },
        ),
      parseResponse: (response): LocateModelResponse => {
        const parsedLocateResult = protocol.parseRawResponse(
          response.content,
          resultCodec.promptSpec,
        );
        const rawResponse = response.content;
        const locateError = parsedLocateResult.error;
        if (parsedLocateResult.kind === 'not-found') {
          return {
            rawResponse,
            rawChoiceMessage: response.rawChoiceMessage,
            usage: response.usage,
            reasoningContent: response.reasoning_content,
            errors: locateError ? [locateError] : [],
          };
        }

        try {
          const locatedPixelBbox = resultCodec.toPixelBbox(
            parsedLocateResult.target,
            {
              preparedSize: preparedImage.preparedSize,
              contentSize: preparedImage.contentSize,
            },
          );
          return {
            locatedPixelBbox,
            rawResponse,
            rawChoiceMessage: response.rawChoiceMessage,
            usage: response.usage,
            reasoningContent: response.reasoning_content,
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
