import type { AIUsageInfo, Rect, UIContext } from '@/types';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import type { TUserPrompt } from '../../../common';
import { userPromptToString } from '../../../common';
import type { ModelRuntime } from '../../models';
import { systemPromptToLocateSection } from '../../prompt/llm-section-locator';
import { AIResponseParseError, callAI } from '../../service-caller/index';
import {
  callAiAndParseWithRetry,
  withSemanticRetryFeedback,
} from '../../service-caller/semantic-retry';
import { mergePixelBboxesToRect } from './locate-result-rect';
import { buildSearchAreaConfig, expandSearchArea } from './search-area';
import type { SearchAreaConfig } from './types';
import { formatLocateModelContext, prepareLocateModelInput } from './utils';

const debugSection = getDebug('ai:grounding:section');

type SectionLocateRawResponse = Awaited<ReturnType<typeof callAI>>;

export async function AiLocateSection(options: {
  context: UIContext;
  sectionDescription: TUserPrompt;
  modelRuntime: ModelRuntime;
  abortSignal?: AbortSignal;
}): Promise<{
  searchAreaConfig?: SearchAreaConfig;
  error?: string;
  rawResponse: string;
  rawChoiceMessage?: unknown;
  usage?: AIUsageInfo;
}> {
  const { context, sectionDescription } = options;
  const modelRuntime = options.modelRuntime;
  const { adapter } = modelRuntime;
  assert(
    adapter.locate.kind === 'standard',
    'section locate requires a standard locate adapter',
  );
  const searchArea = adapter.locate.searchArea;
  assert(searchArea, 'section locate requires a search area operation');
  const { protocol: searchAreaProtocol, resultCodec } = searchArea;
  const screenshotBase64 = context.screenshot.base64;

  const systemPrompt = systemPromptToLocateSection({
    responseInstructions: searchAreaProtocol.buildResponseInstructions(
      resultCodec.promptSpec,
    ),
  });

  const userInstructionPrompt = searchAreaProtocol.buildUserPrompt(
    userPromptToString(sectionDescription),
  );

  const { messages, preparedImage } = await prepareLocateModelInput({
    systemPrompt,
    userPrompt: userInstructionPrompt,
    locateImage: {
      imageBase64: screenshotBase64,
      width: context.shotSize.width,
      height: context.shotSize.height,
    },
    imagePreprocess: adapter.imagePreprocess,
    targetDescription: sectionDescription,
    userMessageContentOrder: adapter.locate.userMessageContentOrder,
  });

  let parsedResult:
    | {
        result: SectionLocateRawResponse;
        sectionError?: string;
        mergedRect?: undefined;
      }
    | {
        result: SectionLocateRawResponse;
        sectionError?: string;
        mergedRect: Rect;
      };

  try {
    parsedResult = await callAiAndParseWithRetry({
      callAi: (retryAttempt, previousParseError) =>
        callAI(
          withSemanticRetryFeedback(messages, previousParseError),
          modelRuntime,
          {
            abortSignal: options.abortSignal,
            expectedJsonObjectResponse:
              searchAreaProtocol.expectedJsonObjectResponse,
            semanticRetryAttempt: retryAttempt,
          },
        ),
      parseResponse: (response) => {
        const parsedLocateResult = searchAreaProtocol.parseRawResponse(
          response.content,
          resultCodec.promptSpec,
        );
        const sectionError = parsedLocateResult.error;
        if (parsedLocateResult.kind === 'not-found') {
          return { result: response, sectionError };
        }

        try {
          const locateResultContext = {
            preparedSize: preparedImage.preparedSize,
            contentSize: preparedImage.contentSize,
          };
          const target = resultCodec.toPixelBbox(
            parsedLocateResult.target,
            locateResultContext,
          );
          const references = parsedLocateResult.references?.map((reference) =>
            resultCodec.toPixelBbox(reference, locateResultContext),
          );
          const mergedRect = mergePixelBboxesToRect([
            target,
            ...(references ?? []),
          ]);
          debugSection('mergedRect %j', mergedRect);
          return {
            result: response,
            sectionError,
            mergedRect,
          };
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          const message = [
            sectionError && `error in section locate result: ${sectionError}`,
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
            ? `Failed to parse section locate result: ${error.message}`
            : 'unknown error in section locate';
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
        debugSection(
          'retrying section locate after coordinate parsing failed: %s',
          error instanceof Error ? error.message : String(error),
        );
      },
    });
  } catch (callError) {
    if (callError instanceof AIResponseParseError) {
      return {
        searchAreaConfig: undefined,
        error: callError.message,
        rawResponse: callError.rawResponse,
        rawChoiceMessage: callError.rawChoiceMessage,
        usage: callError.usage,
      };
    }

    const errorMessage =
      callError instanceof Error ? callError.message : String(callError);
    return {
      searchAreaConfig: undefined,
      error: `AI call error: ${errorMessage}`,
      rawResponse: errorMessage,
    };
  }

  const { result, sectionError, mergedRect } = parsedResult;
  if (!mergedRect) {
    return {
      searchAreaConfig: undefined,
      error: sectionError,
      rawResponse: result.content,
      rawChoiceMessage: result.rawChoiceMessage,
      usage: result.usage,
    };
  }

  try {
    const expandedRect = expandSearchArea(mergedRect, context.shotSize);
    const originalWidth = expandedRect.width;
    const originalHeight = expandedRect.height;
    debugSection('expanded sectionRect %j', expandedRect);

    const searchAreaConfig = await buildSearchAreaConfig({
      context,
      baseRect: mergedRect,
    });

    debugSection(
      'scaled section image from %dx%d to %dx%d (scale=%d)',
      originalWidth,
      originalHeight,
      searchAreaConfig.image.width,
      searchAreaConfig.image.height,
      searchAreaConfig.mapping.scale,
    );
    return {
      searchAreaConfig,
      error: sectionError,
      rawResponse: result.content,
      rawChoiceMessage: result.rawChoiceMessage,
      usage: result.usage,
    };
  } catch (error) {
    const parseErrorMessage =
      error instanceof Error
        ? `Failed to parse section locate result: ${error.message}`
        : 'unknown error in section locate';
    const errorMessage = sectionError
      ? `${sectionError} (${parseErrorMessage})`
      : parseErrorMessage;
    return {
      searchAreaConfig: undefined,
      error: errorMessage,
      rawResponse: result.content,
      rawChoiceMessage: result.rawChoiceMessage,
      usage: result.usage,
    };
  }
}
