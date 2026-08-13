import type {
  AISectionLocatorResponse,
  AIUsageInfo,
  Rect,
  UIContext,
} from '@/types';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import type { TUserPrompt } from '../../../common';
import {
  expandSearchArea,
  multimodalPromptToChatMessages,
  userPromptToMultimodalPrompt,
  userPromptToString,
} from '../../../common';
import { prepareModelImage } from '../../model-adapter/image-preprocess';
import type { ModelRuntime } from '../../models';
import {
  sectionLocatorInstruction,
  systemPromptToLocateSection,
} from '../../prompt/llm-section-locator';
import {
  AIResponseParseError,
  callAI,
  type callAIWithObjectResponse,
  parseAIObjectResponse,
} from '../../service-caller/index';
import {
  callAiAndParseWithRetry,
  withSemanticRetryFeedback,
} from '../../service-caller/semantic-retry';
import { mergePixelBboxesToRect } from './locate-result-rect';
import { buildSearchAreaConfig } from './search-area';
import type { SearchAreaConfig } from './types';
import {
  type GroundingAIArgs,
  formatLocateModelContext,
  hasLocateResult,
} from './utils';

const debugSection = getDebug('ai:grounding:section');

type SectionLocateObjectResponse = Awaited<
  ReturnType<typeof callAIWithObjectResponse<AISectionLocatorResponse>>
>;

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
  const resultAdapter = adapter.locate.resultAdapter;
  const screenshotBase64 = context.screenshot.base64;
  const preparedImage = await prepareModelImage({
    imageBase64: screenshotBase64,
    width: context.shotSize.width,
    height: context.shotSize.height,
    policy: adapter.imagePreprocess,
  });

  const systemPrompt = systemPromptToLocateSection(
    adapter.locate.resultAdapter.promptSpec,
  );
  const sectionLocatorInstructionText = sectionLocatorInstruction(
    userPromptToString(sectionDescription),
  );
  const msgs: GroundingAIArgs = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: {
            url: preparedImage.imageBase64,
            detail: 'high',
          },
        },
        {
          type: 'text',
          text: sectionLocatorInstructionText,
        },
      ],
    },
  ];

  if (typeof sectionDescription !== 'string') {
    const addOns = await multimodalPromptToChatMessages(
      userPromptToMultimodalPrompt(sectionDescription),
    );
    msgs.push(...addOns);
  }

  let parsedResult:
    | {
        result: SectionLocateObjectResponse;
        sectionError?: string;
        mergedRect?: undefined;
      }
    | {
        result: SectionLocateObjectResponse;
        sectionError?: string;
        mergedRect: Rect;
      };

  try {
    parsedResult = await callAiAndParseWithRetry({
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
      parseResponse: (response) => {
        const result = parseAIObjectResponse<AISectionLocatorResponse>(
          response,
          modelRuntime,
          'section-locator',
        );
        const sectionError = result.content.error;
        if (
          !hasLocateResult(result.content, resultAdapter.promptSpec.resultKey)
        ) {
          return { result, sectionError };
        }

        try {
          const adaptedResult =
            resultAdapter.adaptSectionLocateResultToPixelBboxGroup(
              result.content,
              {
                preparedSize: preparedImage.preparedSize,
                contentSize: preparedImage.contentSize,
              },
            );
          const mergedRect = mergePixelBboxesToRect([
            adaptedResult.target,
            ...(adaptedResult.references ?? []),
          ]);
          debugSection('mergedRect %j', mergedRect);
          return { result, sectionError, mergedRect };
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
      rawResponse: result.contentString,
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
      rawResponse: result.contentString,
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
      rawResponse: result.contentString,
      rawChoiceMessage: result.rawChoiceMessage,
      usage: result.usage,
    };
  }
}
