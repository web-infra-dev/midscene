import type {
  AIDataExtractionResponse,
  ServiceExtractOption,
  UIContext,
} from '@/types';
import type { IModelConfig } from '@midscene/shared/env';
import type { ChatCompletionUserMessageParam } from 'openai/resources/index';
import type { TMultimodalPrompt } from '../../../common';
import {
  extractDataQueryPrompt,
  parseXMLExtractionResponse,
  systemPromptToExtract,
} from '../../prompts/extraction';
import { AIResponseParseError, callAI } from '../../service-caller/index';
import { type InspectAIArgs, promptsToChatParam } from './helpers';

export async function AiExtractElementInfo<T>(options: {
  dataQuery: string | Record<string, string>;
  multimodalPrompt?: TMultimodalPrompt;
  context: UIContext;
  pageDescription?: string;
  extractOption?: ServiceExtractOption;
  modelConfig: IModelConfig;
}) {
  const { dataQuery, context, extractOption, multimodalPrompt, modelConfig } =
    options;
  const systemPrompt = systemPromptToExtract();
  const screenshotBase64 = context.screenshot.base64;

  const extractDataPromptText = extractDataQueryPrompt(
    options.pageDescription || '',
    dataQuery,
  );

  const userContent: ChatCompletionUserMessageParam['content'] = [];

  if (extractOption?.screenshotIncluded !== false) {
    userContent.push({
      type: 'image_url',
      image_url: {
        url: screenshotBase64,
        detail: 'high',
      },
    });
  }

  userContent.push({
    type: 'text',
    text: extractDataPromptText,
  });

  const msgs: InspectAIArgs = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: userContent,
    },
  ];

  if (multimodalPrompt) {
    const addOns = await promptsToChatParam({
      images: multimodalPrompt.images,
      convertHttpImage2Base64: multimodalPrompt.convertHttpImage2Base64,
    });
    msgs.push(...addOns);
  }

  const {
    content: rawResponse,
    usage,
    reasoning_content,
  } = await callAI(msgs, modelConfig);

  let parseResult: AIDataExtractionResponse<T>;
  try {
    parseResult = parseXMLExtractionResponse<T>(rawResponse);
  } catch (parseError) {
    const errorMessage =
      parseError instanceof Error ? parseError.message : String(parseError);
    throw new AIResponseParseError(
      `XML parse error: ${errorMessage}`,
      rawResponse,
      usage,
    );
  }

  return {
    parseResult,
    rawResponse,
    usage,
    reasoning_content,
  };
}
