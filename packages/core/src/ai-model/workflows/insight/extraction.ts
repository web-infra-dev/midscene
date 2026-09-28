import type { ServiceExtractOption, UIContext } from '@/types';
import { getDebug } from '@midscene/shared/logger';
import type {
  ChatCompletionSystemMessageParam,
  ChatCompletionUserMessageParam,
} from 'openai/resources/index';
import { renderAIContext } from '../../../agent/prompt-context';
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
import { buildObservationPromptEvidence } from './observation-evidence';

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

  const renderedContext = renderAIContext(extractOption?.context);
  const extractDataPromptText = extractDataQueryPrompt(
    options.pageDescription || '',
    dataQuery,
    renderedContext,
  );

  const userContent: ChatCompletionUserMessageParam['content'] = [];

  if (extractOption?.screenshotIncluded !== false) {
    const screenshotSequence = context.screenshotSequence;
    if (screenshotSequence && screenshotSequence.length > 1) {
      context.screenshotSequenceEvidence = undefined;
      const evidence = await buildObservationPromptEvidence(
        screenshotSequence,
        options.abortSignal,
      );
      context.screenshotSequenceEvidence = evidence.reportEvidence;
      userContent.push(...evidence.content);
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
