import type {
  ConversationSystemMessage,
  ConversationUserMessage,
} from '@/ai-model/service-caller/types';
import type { ServiceExtractOption, UIContext } from '@/types';
import { getDebug } from '@midscene/shared/logger';
import { buildObservationChangeFocus } from '../../../agent/observation-change-focus';
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
import { multimodalPromptToMessages } from '../../shared/multimodal-prompt';
import { parseInsightResponse } from './insight-response-parser';

type InsightAIArgs = [ConversationSystemMessage, ...ConversationUserMessage[]];

const debugInsight = getDebug('ai:insight');
const MAX_OBSERVATION_MODEL_IMAGES = 8;

function evenlySampleFrameIndices(frameCount: number, limit: number): number[] {
  if (frameCount <= limit) {
    return Array.from({ length: frameCount }, (_, index) => index);
  }
  return Array.from(
    new Set(
      Array.from({ length: limit }, (_, index) =>
        Math.round((index * (frameCount - 1)) / (limit - 1)),
      ),
    ),
  );
}

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

  const userContent: ConversationUserMessage['content'] = [];

  if (extractOption?.screenshotIncluded !== false) {
    const screenshotSequence = context.screenshotSequence;
    if (screenshotSequence && screenshotSequence.length > 1) {
      context.screenshotSequenceFocus = undefined;
      context.screenshotSequenceFocusFrameIndices = undefined;
      let changeFocus;
      try {
        changeFocus = await buildObservationChangeFocus(screenshotSequence);
      } catch (error) {
        debugInsight(
          'Failed to build focused observation evidence; falling back to full frames',
          error,
        );
      }
      if (changeFocus) {
        context.screenshotSequenceFocus = changeFocus.frames;
        context.screenshotSequenceFocusFrameIndices = changeFocus.frameIndices;
      }
      userContent.push({
        type: 'text',
        text: `The following ${screenshotSequence.length} images are consecutive screenshots captured over a time window, ordered from earliest to latest (Frame 1 is first, Frame ${screenshotSequence.length} is last). They record what appeared on screen during that window. Some UI elements such as toasts, banners, or transitions may appear only in certain frames and be gone by later ones. Interpret the temporal scope from the statement or question itself: if it asks whether something appeared at any point, inspect the whole sequence; if it asks about the final or current state, use the relevant later frame; if it asks about a change or sequence, compare frames in order. Unless <DATA_DEMAND> explicitly asks for comparison or matching against reference images, base your answer on these screenshots and their contents.`,
      });

      if (changeFocus) {
        userContent.push({
          type: 'text',
          text: `The following images are matching grids of enlarged candidate change regions from selected frames. Each grid cell keeps the same region number and position across time. The orange outline marks the exact peak patch used for the deterministic brightness and pixel-difference measurements relative to Frame 1 in its label; those numbers prove only that pixels changed inside that patch, not that a named control changed state. Use them as supporting evidence and visually verify the relevant control. Inspect the region relevant to <DATA_DEMAND>; unrelated activity elsewhere on screen may have a stronger pixel change. Candidate physical screenshot regions: ${changeFocus.rects.map((rect, index) => `region ${index + 1} (left ${rect.left}, top ${rect.top}, width ${rect.width}, height ${rect.height}); measured patch (left ${changeFocus.measurementRects[index].left}, top ${changeFocus.measurementRects[index].top}, width ${changeFocus.measurementRects[index].width}, height ${changeFocus.measurementRects[index].height})`).join('; ')}.`,
        });
        changeFocus.frames.forEach((frame, index) => {
          const sourceFrameIndex = changeFocus.frameIndices[index];
          userContent.push({
            type: 'text',
            text: `Changed-region grid from source Frame ${sourceFrameIndex + 1}/${screenshotSequence.length}`,
          });
          userContent.push({
            type: 'image',
            url: frame.base64,
          });
        });
        userContent.push({
          type: 'text',
          text: 'Full-screen baseline for spatial context (Frame 1).',
        });
        userContent.push({
          type: 'image',
          url: screenshotSequence[0].base64,
        });
        userContent.push({
          type: 'text',
          text: `Full-screen final state (Frame ${screenshotSequence.length}). Use this for questions about the current or final state.`,
        });
        userContent.push({
          type: 'image',
          url: screenshotSequence[screenshotSequence.length - 1].base64,
        });
      } else {
        const frameIndices = evenlySampleFrameIndices(
          screenshotSequence.length,
          MAX_OBSERVATION_MODEL_IMAGES,
        );
        frameIndices.forEach((sourceFrameIndex) => {
          const frame = screenshotSequence[sourceFrameIndex];
          userContent.push({
            type: 'text',
            text: `Frame ${sourceFrameIndex + 1}/${screenshotSequence.length}`,
          });
          userContent.push({
            type: 'image',
            url: frame.base64,
          });
        });
      }
    } else {
      userContent.push({
        type: 'text',
        text: 'This is the current screenshot to evaluate. Unless <DATA_DEMAND> explicitly asks for comparison or matching against reference images, base your answer on this screenshot and its contents when provided.',
      });

      userContent.push({
        type: 'image',
        url: screenshotBase64,
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
    const addOns = await multimodalPromptToMessages(multimodalPrompt);
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
        rawAssistantOutput,
      } = response;
      const parseResult = parseInsightResponse<T>(
        rawResponse,
        insightProtocol.dataOutput,
        modelRuntime.adapter.jsonParser,
      );
      return {
        parseResult,
        rawResponse,
        rawAssistantOutput,
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
        response.rawAssistantOutput,
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
