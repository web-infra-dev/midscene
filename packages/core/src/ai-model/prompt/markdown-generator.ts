import type { IModelConfig } from '@midscene/shared/env';
import {
  imageInfoOfBase64,
  parseBase64,
  resizeImgBase64,
} from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import {
  type MidsceneRecorderMarkdownScreenshotAsset,
  getMidsceneRecorderEventDescription,
  stringifyMidsceneRecorderTargetBlock,
} from '@midscene/shared/recorder';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import { callAIWithStringResponse } from '../index';
import { type ModelRuntime, getModelRuntime } from '../models';
import {
  type RecorderGenerationInput,
  prepareRecorderGenerationContext,
  validateEvents,
} from './recorder-generation-common';

export type RecorderMarkdownGenerationInput = RecorderGenerationInput;

const MARKDOWN_REPLAY_SCREENSHOT_PAYLOAD_BUDGET = 600_000;
const MARKDOWN_REPLAY_SCREENSHOT_MAX_EDGE = 768;
const debugMarkdownReplay = getDebug('ai:recorder-markdown', {
  console: true,
});

function limitScreenshotAssetsForMarkdownReplay(
  screenshotAssets: MidsceneRecorderMarkdownScreenshotAsset[],
) {
  let usedPayload = 0;
  return screenshotAssets.filter((asset) => {
    const payloadSize = asset.dataUrl.length;
    if (
      payloadSize > MARKDOWN_REPLAY_SCREENSHOT_PAYLOAD_BUDGET ||
      usedPayload + payloadSize > MARKDOWN_REPLAY_SCREENSHOT_PAYLOAD_BUDGET
    ) {
      return false;
    }
    usedPayload += payloadSize;
    return true;
  });
}

async function compressScreenshotAssetForMarkdownReplay(
  asset: MidsceneRecorderMarkdownScreenshotAsset,
): Promise<MidsceneRecorderMarkdownScreenshotAsset> {
  const { width, height } = await imageInfoOfBase64(asset.dataUrl);
  const longestEdge = Math.max(width, height);
  if (longestEdge <= MARKDOWN_REPLAY_SCREENSHOT_MAX_EDGE) {
    return asset;
  }

  const scale = MARKDOWN_REPLAY_SCREENSHOT_MAX_EDGE / longestEdge;
  const dataUrl = await resizeImgBase64(asset.dataUrl, {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  });
  const { body, mimeType } = parseBase64(dataUrl);
  return {
    ...asset,
    dataUrl,
    base64Data: body,
    mimeType,
  };
}

async function prepareScreenshotAssetsForMarkdownReplay(
  screenshotAssets: MidsceneRecorderMarkdownScreenshotAsset[],
) {
  const compressedAssets: MidsceneRecorderMarkdownScreenshotAsset[] = [];
  for (const asset of screenshotAssets) {
    try {
      compressedAssets.push(
        await compressScreenshotAssetForMarkdownReplay(asset),
      );
    } catch {
      compressedAssets.push(asset);
    }
  }
  return limitScreenshotAssetsForMarkdownReplay(compressedAssets);
}

function summarizeScreenshotAssets(
  screenshotAssets: MidsceneRecorderMarkdownScreenshotAsset[],
) {
  const payloadSizes = screenshotAssets.map((asset) => asset.dataUrl.length);
  return {
    count: screenshotAssets.length,
    totalPayloadChars: payloadSizes.reduce((sum, size) => sum + size, 0),
    maxPayloadChars: payloadSizes.length ? Math.max(...payloadSizes) : 0,
  };
}

function getPromptShape(prompt: ChatCompletionMessageParam[]) {
  let textChars = 0;
  let imageCount = 0;
  for (const message of prompt) {
    const content = message.content;
    if (typeof content === 'string') {
      textChars += content.length;
      continue;
    }
    if (!Array.isArray(content)) {
      continue;
    }
    for (const part of content) {
      if (typeof part === 'object' && part && 'type' in part) {
        if (part.type === 'text' && 'text' in part) {
          textChars += String(part.text).length;
        }
        if (part.type === 'image_url') {
          imageCount += 1;
        }
      }
    }
  }
  return { textChars, imageCount };
}

function removeOmittedScreenshotPaths(
  summary: ReturnType<typeof prepareRecorderGenerationContext>['summary'],
  screenshotAssets: MidsceneRecorderMarkdownScreenshotAsset[],
) {
  const includedScreenshotPaths = new Set(
    screenshotAssets.map((asset) => asset.relativePath),
  );
  return {
    ...summary,
    events: summary.events.map((event) =>
      event.screenshotPath && !includedScreenshotPaths.has(event.screenshotPath)
        ? { ...event, screenshotPath: undefined }
        : event,
    ),
  };
}

function getMarkdownLanguageInstruction(language?: string) {
  const normalizedLanguage = language?.trim();
  if (!normalizedLanguage) {
    return '';
  }

  return `
Language requirement:
- Write all human-readable Markdown instructions in ${normalizedLanguage}.
- Keep file paths, URLs, platform ids, API names, and quoted UI text unchanged.`;
}

function normalizeGeneratedMarkdown(content: string) {
  const trimmed = content.trim();
  const fencedMatch = trimmed.match(
    /^```(?:md|markdown)?\s*([\s\S]*?)\s*```$/i,
  );
  return `${(fencedMatch?.[1] ?? trimmed).trim()}\n`;
}

function resolveModelRuntime(model: IModelConfig | ModelRuntime): ModelRuntime {
  if ('config' in model && 'adapter' in model) {
    return model;
  }
  return getModelRuntime(model);
}

export function createRecorderMarkdownReplayPrompt(
  input: RecorderMarkdownGenerationInput,
): ChatCompletionMessageParam[] {
  validateEvents(input.events);

  const { summary: rawSummary, screenshotAssets: rawScreenshotAssets } =
    prepareRecorderGenerationContext(input);
  const screenshotAssets =
    limitScreenshotAssetsForMarkdownReplay(rawScreenshotAssets);
  const summary = removeOmittedScreenshotPaths(rawSummary, screenshotAssets);
  return createRecorderMarkdownReplayPromptFromContext(
    input,
    summary,
    screenshotAssets,
  );
}

async function createRecorderMarkdownReplayPromptForGeneration(
  input: RecorderMarkdownGenerationInput,
): Promise<ChatCompletionMessageParam[]> {
  validateEvents(input.events);

  const { summary: rawSummary, screenshotAssets: rawScreenshotAssets } =
    prepareRecorderGenerationContext(input);
  const screenshotAssets =
    await prepareScreenshotAssetsForMarkdownReplay(rawScreenshotAssets);
  const summary = removeOmittedScreenshotPaths(rawSummary, screenshotAssets);
  const prompt = createRecorderMarkdownReplayPromptFromContext(
    input,
    summary,
    screenshotAssets,
  );
  debugMarkdownReplay('markdown replay prompt shape %o', {
    eventCount: input.events.length,
    maxScreenshots: input.maxScreenshots,
    rawScreenshots: summarizeScreenshotAssets(rawScreenshotAssets),
    includedScreenshots: summarizeScreenshotAssets(screenshotAssets),
    prompt: getPromptShape(prompt),
  });
  return prompt;
}

function createRecorderMarkdownReplayPromptFromContext(
  input: RecorderMarkdownGenerationInput,
  summary: ReturnType<typeof prepareRecorderGenerationContext>['summary'],
  screenshotAssets: MidsceneRecorderMarkdownScreenshotAsset[],
): ChatCompletionMessageParam[] {
  const screenshotIndexByEventHash = new Map(
    screenshotAssets.map((asset, index) => [
      asset.eventHashId,
      `screenshot-${index + 1}`,
    ]),
  );
  const events = summary.events.map((event) => {
    const screenshotRef = screenshotIndexByEventHash.get(event.hashId);
    const { screenshotPath, ...eventWithoutScreenshotPath } = event;
    return screenshotRef
      ? { ...eventWithoutScreenshotPath, screenshotRef }
      : eventWithoutScreenshotPath;
  });
  const promptPayload = {
    testName: input.testName || summary.testName,
    target: {
      platformId: input.target.platformId,
      label: input.target.label,
      values: input.target.values,
    },
    startUrl: summary.startUrl,
    events,
    screenshots: screenshotAssets.map((asset, index) => ({
      screenshotRef: `screenshot-${index + 1}`,
      eventIndex: asset.eventIndex,
      eventHashId: asset.eventHashId,
      eventType: asset.eventType,
      description: getMidsceneRecorderEventDescription(
        input.events[asset.eventIndex],
      ),
    })),
  };
  const promptText = `Generate a Markdown replay script for Midscene Agent. It will be executed with:
await agent.aiAct(markdownReplayPrompt)

Use only the recorder data and screenshots below.

Target block:
${stringifyMidsceneRecorderTargetBlock(input.target)}

Replay goal:
- Reproduce the recorded user workflow exactly.
- Preserve event order.
- Preserve the user's original intent.
- Do not invent alternative navigation paths.
- Do not skip, merge, reorder, or add extra user actions.
- Prefer recorded UI text, element descriptions, URLs, input values, and scroll direction.
- For input events, enter event.typedText/event.value exactly; do not infer or correct the text from screenshots.
- Prefer event.semantic.replayInstruction and event.semantic.elementDescription when event.semantic.source is "aiDescribe" or "recorderAI" and event.semantic.status is "ready".
- If event.semantic.source is "heuristic" or event.semantic.status is "pending"/"failed", use the screenshot/context to write the best visual instruction.
- Coordinates are only fallback hints. Do not make coordinates the primary instruction when text or screenshots are available.
- For a click/tap that only focuses a field before an input event, describe the target as the field/control itself. Do not target a placeholder character, typed character, caret, or inner text fragment inside the field.
- If a target cannot be found, stop and report the missing step. Do not click similar-looking elements.
- Screenshots are only generation-time visual evidence for you. The generated Markdown will be passed directly to agent.aiAct(markdownReplayPrompt), which accepts text only and cannot receive attached images.
- Convert any useful screenshot evidence into textual replay instructions. Do not include screenshots, image syntax, image paths, or reference-image names in the generated Markdown.
- Never write Markdown image syntax such as ![step context](...), reference-style images, HTML <img> tags, ./screenshots/... paths, or screenshot-* names in the output.

Required structure:
# ${input.testName || summary.testName}

## Goal
Reproduce the recorded user workflow exactly.

## Target
- Platform: ${input.target.platformId}
- Start target: ${summary.startUrl || input.target.label || input.target.deviceId || 'Recorded target'}

## Steps
1. ...

Recorder data:
${JSON.stringify(promptPayload, null, 2)}${getMarkdownLanguageInstruction(input.language)}

Important: Return ONLY raw Markdown. Do NOT wrap the response in markdown code blocks.`;

  const content: any[] = [
    {
      type: 'text',
      text: promptText,
    },
  ];

  for (const asset of screenshotAssets) {
    const screenshotRef = screenshotIndexByEventHash.get(asset.eventHashId);
    content.push({
      type: 'text',
      text: `${screenshotRef} for event #${asset.eventIndex + 1}`,
    });
    content.push({
      type: 'image_url',
      image_url: {
        url: asset.dataUrl,
      },
    });
  }

  return [
    {
      role: 'system',
      content:
        'You generate precise Markdown replay scripts for Midscene agent.aiAct. The final output is plain text that will be passed directly to agent.aiAct, so it must be deterministic, ordered, safe for AI execution, and must not contain image references, screenshot paths, or screenshot labels.',
    },
    {
      role: 'user',
      content,
    },
  ];
}

export async function generateRecorderMarkdownReplay(
  input: RecorderMarkdownGenerationInput,
  model: IModelConfig | ModelRuntime,
): Promise<string> {
  try {
    const prompt = await createRecorderMarkdownReplayPromptForGeneration(input);
    const response = await callAIWithStringResponse(
      prompt,
      resolveModelRuntime(model),
    );

    if (response?.content && typeof response.content === 'string') {
      return normalizeGeneratedMarkdown(response.content);
    }

    throw new Error('Failed to generate recorder Markdown replay');
  } catch (error) {
    throw new Error(`Failed to generate recorder Markdown replay: ${error}`);
  }
}

export async function convertRecordLogIntoMarkdown(
  log: RecorderMarkdownGenerationInput,
  modelConfig: IModelConfig,
): Promise<string> {
  return generateRecorderMarkdownReplay(log, modelConfig);
}
