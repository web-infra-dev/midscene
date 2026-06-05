import type {
  StreamingAIResponse,
  StreamingCodeGenerationOptions,
} from '@/types';
import { YAML_EXAMPLE_CODE } from '@midscene/shared/constants';
import type { IModelConfig } from '@midscene/shared/env';
import {
  type MidsceneRecorderMarkdownScreenshotAsset,
  type MidsceneRecorderTarget,
  stringifyMidsceneRecorderTargetBlock,
} from '@midscene/shared/recorder';
import {
  type ChatCompletionMessageParam,
  callAI,
  callAIWithStringResponse,
} from '../index';
import {
  type ChromeRecordedEvent,
  type EventCounts,
  type EventSummary,
  type FilteredEvents,
  type InputDescription,
  type ProcessedEvent,
  type RecorderGenerationContext,
  type RecorderGenerationInput,
  type RecorderGenerationOptions,
  createEventCounts,
  createMessageContent,
  extractInputDescriptions,
  filterEventsByType,
  getScreenshotsForLLM,
  prepareEventSummary,
  prepareRecorderGenerationContext,
  processEventsForLLM,
  validateEvents,
} from './recorder-generation-common';

export type YamlGenerationOptions = RecorderGenerationOptions;
export type RecorderYamlGenerationInput = RecorderGenerationInput;

export type {
  ChromeRecordedEvent,
  EventCounts,
  EventSummary,
  FilteredEvents,
  InputDescription,
  ProcessedEvent,
  RecorderGenerationContext,
};

export {
  createEventCounts,
  createMessageContent,
  extractInputDescriptions,
  filterEventsByType,
  getScreenshotsForLLM,
  prepareEventSummary,
  prepareRecorderGenerationContext,
  processEventsForLLM,
  validateEvents,
};

const getYamlLanguageInstruction = (language?: string) => {
  const normalizedLanguage = language?.trim();
  if (!normalizedLanguage) {
    return '';
  }

  return `
Language requirement:
- Write all human-readable YAML content in ${normalizedLanguage}.
- Keep YAML keys, field names, and Midscene API names unchanged.`;
};

const createYamlPrompt = ({
  yamlSummary,
  screenshotAssets,
  language,
  targetBlock,
  target,
}: {
  yamlSummary: EventSummary & { includeTimestamps: boolean };
  screenshotAssets: MidsceneRecorderMarkdownScreenshotAsset[];
  language?: string;
  targetBlock: string;
  target: MidsceneRecorderTarget;
}): ChatCompletionMessageParam[] => {
  const prompt: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: `You are an expert in Midscene.js YAML test generation. Generate clean, accurate YAML following these rules: ${YAML_EXAMPLE_CODE}`,
    },
    {
      role: 'user',
      content: `Generate YAML test for Midscene.js automation from recorded events.

Target platform:
- Preserve this exact top-level target platform: ${target.platformId}
- Use exactly one top-level target block.
- The target block must be:
${targetBlock}

Event Summary:
${JSON.stringify(yamlSummary, null, 2)}

Screenshot assets:
${JSON.stringify(
  screenshotAssets.map((asset) => ({
    eventIndex: asset.eventIndex,
    eventHashId: asset.eventHashId,
    eventType: asset.eventType,
    relativePath: asset.relativePath,
    description: yamlSummary.events[asset.eventIndex]?.description,
  })),
  null,
  2,
)}

Convert events:
- navigation → target URL or aiAction only when the target platform supports it
- click → aiTap with the semantic element description
- input → aiInput with value and semantic locate
- scroll → aiScroll with appropriate direction and semantic scroll area
- keydown → aiKeyboardPress
- Add aiAssert for important state changes
- Prefer event.replayInstruction and event.elementDescription when descriptionSource is "ai".
- If descriptionSource is "fallback", use the screenshot/context to write the best visual instruction, and avoid raw coordinates unless there is no reliable semantic description.
- Screenshot assets are context only. Use their eventIndex/eventHashId relationship to understand the matching event, but do not include screenshot file paths in the YAML unless the Midscene YAML API explicitly needs them.${getYamlLanguageInstruction(language)}

Important: Return ONLY the raw YAML content. Do NOT wrap the response in markdown code blocks (no \`\`\`yaml or \`\`\`). Start directly with the YAML content.`,
    },
  ];

  if (screenshotAssets.length > 0) {
    prompt.push({
      role: 'user',
      content:
        'Here are screenshots from the recording session to help you understand the context:',
    });

    prompt.push({
      role: 'user',
      content: screenshotAssets.flatMap((asset) => [
        {
          type: 'text',
          text: `Screenshot asset for event #${asset.eventIndex + 1}: ${asset.relativePath}`,
        },
        {
          type: 'image_url',
          image_url: {
            url: asset.dataUrl,
          },
        },
      ]),
    });
  }

  return prompt;
};

function createDefaultWebTarget(
  events: ChromeRecordedEvent[],
  options: YamlGenerationOptions,
): MidsceneRecorderTarget {
  const navigationEvents = events.filter(
    (event) => event.type === 'navigation',
  );
  const firstUrl =
    options.navigationInfo?.urls?.find(Boolean) ||
    navigationEvents.find((event) => event.url)?.url ||
    '';
  const firstViewport =
    options.navigationInfo?.initialViewport ||
    events.find((event) => event.pageInfo)?.pageInfo;

  return {
    platformId: 'web',
    deviceId: firstUrl || undefined,
    label: firstUrl || 'Web',
    values: {
      url: firstUrl,
      ...(firstViewport?.width ? { viewportWidth: firstViewport.width } : {}),
      ...(firstViewport?.height
        ? { viewportHeight: firstViewport.height }
        : {}),
    },
  };
}

function normalizeGeneratedYaml(content: string) {
  const trimmed = content.trim();
  const fencedMatch = trimmed.match(/^```(?:ya?ml)?\s*([\s\S]*?)\s*```$/i);
  return `${(fencedMatch?.[1] ?? trimmed).trim()}\n`;
}

function createRecorderYamlPrompt(
  input: RecorderYamlGenerationInput,
): ChatCompletionMessageParam[] {
  const { summary, screenshotAssets } = prepareRecorderGenerationContext(input);
  const yamlSummary = {
    ...summary,
    target: input.target,
    includeTimestamps: input.includeTimestamps || false,
  };

  return createYamlPrompt({
    yamlSummary,
    screenshotAssets,
    language: input.language,
    target: input.target,
    targetBlock: stringifyMidsceneRecorderTargetBlock(input.target),
  });
}

export const generateRecorderYamlTest = async (
  input: RecorderYamlGenerationInput,
  modelConfig: IModelConfig,
): Promise<string> => {
  try {
    const prompt = createRecorderYamlPrompt(input);
    const response = await callAIWithStringResponse(prompt, modelConfig);

    if (response?.content && typeof response.content === 'string') {
      return normalizeGeneratedYaml(response.content);
    }

    throw new Error('Failed to generate recorder YAML test configuration');
  } catch (error) {
    throw new Error(`Failed to generate recorder YAML test: ${error}`);
  }
};

export const generateRecorderYamlTestStream = async (
  input: RecorderYamlGenerationInput,
  options: StreamingCodeGenerationOptions,
  modelConfig: IModelConfig,
): Promise<StreamingAIResponse> => {
  try {
    const prompt = createRecorderYamlPrompt(input);
    if (options.stream && options.onChunk) {
      return await callAI(prompt, modelConfig, {
        stream: true,
        onChunk: options.onChunk,
      });
    }

    const response = await callAIWithStringResponse(prompt, modelConfig);
    if (response?.content && typeof response.content === 'string') {
      return {
        content: normalizeGeneratedYaml(response.content),
        usage: response.usage,
        isStreamed: false,
      };
    }

    throw new Error('Failed to generate recorder YAML test configuration');
  } catch (error) {
    throw new Error(`Failed to generate recorder YAML test: ${error}`);
  }
};

// YAML-specific generation functions

/**
 * Generates YAML test configuration from recorded events using AI
 */
export const generateYamlTest = async (
  events: ChromeRecordedEvent[],
  options: YamlGenerationOptions,
  modelConfig: IModelConfig,
): Promise<string> => {
  return generateRecorderYamlTest(
    {
      ...options,
      target: createDefaultWebTarget(events, options),
      events,
    },
    modelConfig,
  );
};

/**
 * Generates YAML test configuration from recorded events using AI with streaming support
 */
export const generateYamlTestStream = async (
  events: ChromeRecordedEvent[],
  options: YamlGenerationOptions & StreamingCodeGenerationOptions,
  modelConfig: IModelConfig,
): Promise<StreamingAIResponse> => {
  return generateRecorderYamlTestStream(
    {
      ...options,
      target: createDefaultWebTarget(events, options),
      events,
    },
    options,
    modelConfig,
  );
};
