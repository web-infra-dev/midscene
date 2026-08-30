import type { ServiceExtractOption, UIContext } from '@/types';
import { getDebug } from '@midscene/shared/logger';
import type {
  ChatCompletionSystemMessageParam,
  ChatCompletionUserMessageParam,
} from 'openai/resources/index';
import type { TMultimodalPrompt } from '../../../common';
import type { ModelRuntime } from '../../models';
import {
  buildInsightSystemPrompt,
  extractDataQueryPrompt,
} from '../../prompt/insight';
import { AIResponseParseError, callAI } from '../../service-caller/index';
import {
  callAiAndParseWithRetry,
  withSemanticRetryFeedback,
} from '../../service-caller/semantic-retry';
import { multimodalPromptToChatMessages } from '../../shared/multimodal-prompt';
import { parseInsightResponse } from './insight-response-parser';

type InsightAIArgs = [
  ChatCompletionSystemMessageParam,
  ...ChatCompletionUserMessageParam[],
];

const debugInsight = getDebug('ai:insight');

export async function AiExtractElementInfo<T>(options: {
  dataQuery: string | Record<string, string>;
  multimodalPrompt?: TMultimodalPrompt;
  context: UIContext;
  pageDescription?: string;
  extractOption?: ServiceExtractOption;
  modelRuntime: ModelRuntime;
  abortSignal?: AbortSignal;
}) {
  const { dataQuery, context, extractOption, multimodalPrompt, modelRuntime } =
    options;
  const insightProtocol = modelRuntime.adapter.insight.protocol;
  const systemPrompt = buildInsightSystemPrompt({
    screenshotIncluded: extractOption?.screenshotIncluded !== false,
    referenceImagesIncluded: !!multimodalPrompt?.images?.length,
    insightProtocol,
  });
  const screenshotBase64 = context.screenshot.base64;
  const extractDataPromptText = extractDataQueryPrompt(
    options.pageDescription || '',
    dataQuery,
    extractOption?.context,
  );

  const userContent: ChatCompletionUserMessageParam['content'] = [];

  if (extractOption?.screenshotIncluded !== false) {
    const screenshotSequence = context.screenshotSequence;
    if (screenshotSequence && screenshotSequence.length > 1) {
      userContent.push({
        type: 'text',
        text: `The following ${screenshotSequence.length} images are consecutive screenshots captured over a time window, ordered from earliest to latest (Frame 1 is first, Frame ${screenshotSequence.length} is last). They record what appeared on screen during that window. Some UI elements such as toasts, banners, or transitions may appear only in certain frames and be gone by later ones. Interpret the temporal scope from the statement or question itself: if it asks whether something appeared at any point, inspect the whole sequence; if it asks about the final or current state, use the relevant later frame; if it asks about a change or sequence, compare frames in order. Unless <DATA_DEMAND> explicitly asks for comparison or matching against reference images, base your answer on these screenshots and their contents.`,
      });

      screenshotSequence.forEach((frame, index) => {
        userContent.push({
          type: 'text',
          text: `Frame ${index + 1}/${screenshotSequence.length}`,
        });
        userContent.push({
          type: 'image_url',
          image_url: {
            url: frame.base64,
            detail: 'high',
          },
        });
      });
    } else {
      userContent.push({
        type: 'text',
        text: 'This is the current screenshot to evaluate. Unless <DATA_DEMAND> explicitly asks for comparison or matching against reference images, base your answer on this screenshot and its contents when provided.',
      });

      userContent.push({
        type: 'image_url',
        image_url: {
          url: screenshotBase64,
          detail: 'high',
        },
      });
    }
  }

  userContent.push({
    type: 'text',
    text: extractDataPromptText,
  });

  const msgs: InsightAIArgs = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: userContent,
    },
  ];

  if (multimodalPrompt) {
    const addOns = await multimodalPromptToChatMessages(multimodalPrompt);
    msgs.push(...addOns);
  }

  return callAiAndParseWithRetry({
    callAi: (retryAttempt, previousParseError) =>
      callAI(
        withSemanticRetryFeedback(msgs, previousParseError),
        modelRuntime,
        {
          abortSignal: options.abortSignal,
          semanticRetryAttempt: retryAttempt,
        },
      ),
    parseResponse: (response) => {
      const {
        content: rawResponse,
        usage,
        reasoning_content,
        rawChoiceMessage,
      } = response;
      const parseResult = parseInsightResponse<T>(
        rawResponse,
        insightProtocol.dataOutput,
        modelRuntime.adapter.jsonParser,
      );
      return {
        parseResult,
        rawResponse,
        rawChoiceMessage,
        usage,
        reasoning_content,
      };
    },
    toParseError: (parseError, response) => {
      const errorMessage =
        parseError instanceof Error ? parseError.message : String(parseError);
      return new AIResponseParseError(
        `XML parse error: ${errorMessage}`,
        response.content,
        response.usage,
        response.rawChoiceMessage,
      );
    },
    parseRetryTimes: modelRuntime.config.retryCount,
    parseRetryInterval: modelRuntime.config.retryInterval,
    abortSignal: options.abortSignal,
    onParseRetry: (error) => {
      debugInsight(
        'retrying insight after XML parsing failed: %s',
        error instanceof Error ? error.message : String(error),
      );
    },
  });
}
