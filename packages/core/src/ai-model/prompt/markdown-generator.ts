import type { IModelConfig } from '@midscene/shared/env';
import {
  createMidsceneRecorderMarkdownScreenshotAssets,
  getMidsceneRecorderEventDescription,
  stringifyMidsceneRecorderTargetBlock,
} from '@midscene/shared/recorder';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import { callAIWithStringResponse } from '../index';
import {
  type ProcessedEvent,
  type RecorderYamlGenerationInput,
  prepareEventSummary,
  validateEvents,
} from './yaml-generator';

export type RecorderMarkdownGenerationInput = RecorderYamlGenerationInput;

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

function createEventPromptItems(
  input: RecorderMarkdownGenerationInput,
  screenshotPathByEventHash: Map<string, string>,
): Array<ProcessedEvent & { screenshotPath?: string }> {
  return prepareEventSummary(input.events, {
    testName: input.testName,
    maxScreenshots: input.maxScreenshots || 8,
  }).events.map((event, index) => ({
    ...event,
    screenshotPath: screenshotPathByEventHash.get(
      input.events[index]?.hashId || '',
    ),
  }));
}

export function createRecorderMarkdownReplayPrompt(
  input: RecorderMarkdownGenerationInput,
): ChatCompletionMessageParam[] {
  validateEvents(input.events);

  const screenshotAssets = createMidsceneRecorderMarkdownScreenshotAssets(
    input.events,
    {
      baseDir: './screenshots',
      maxScreenshots: input.maxScreenshots ?? 8,
    },
  );
  const screenshotPathByEventHash = new Map(
    screenshotAssets.map((asset) => [asset.eventHashId, asset.relativePath]),
  );
  const summary = prepareEventSummary(input.events, {
    testName: input.testName,
    maxScreenshots: input.maxScreenshots || 8,
  });
  const promptEvents = createEventPromptItems(input, screenshotPathByEventHash);
  const promptText = `Generate a Markdown replay script for Midscene Agent.

This Markdown will be executed with:
await agent.runMarkdown('./x.md')

It is an AI-executable replay script, not a human report.

Target platform:
- Preserve this exact platform: ${input.target.platformId}
- Target block:
${stringifyMidsceneRecorderTargetBlock(input.target)}

Replay goal:
- Reproduce the recorded user workflow exactly.
- Preserve event order.
- Preserve the user's original intent.
- Do not invent alternative navigation paths.
- Do not skip, merge, reorder, or add extra user actions.
- Prefer recorded UI text, element descriptions, URLs, input values, and scroll direction.
- Coordinates are only fallback hints. Do not make coordinates the primary instruction when text or screenshots are available.
- If a target cannot be found, stop and report the missing step. Do not click similar-looking elements.
- Use screenshots only when they are provided below. Reference them by their exact relative paths.

Required Markdown structure:
# ${input.testName || summary.testName}

## Goal
Reproduce the recorded user workflow exactly.

## Target
- Platform: ${input.target.platformId}
- Start target: ${summary.startUrl || input.target.label || input.target.deviceId || 'Recorded target'}

## Replay rules
- Follow the steps in order.
- Do not invent alternative navigation paths.
- If a referenced target cannot be found, stop and report the missing step.

## Steps
1. ...

Event summary:
${JSON.stringify(
  {
    ...summary,
    target: input.target,
    events: promptEvents,
    screenshotAssets: screenshotAssets.map((asset) => ({
      eventIndex: asset.eventIndex,
      eventHashId: asset.eventHashId,
      eventType: asset.eventType,
      relativePath: asset.relativePath,
      description: getMidsceneRecorderEventDescription(
        input.events[asset.eventIndex],
      ),
    })),
  },
  null,
  2,
)}

Screenshot rules:
- Insert a screenshot directly under the step that needs visual grounding.
- Use Markdown image syntax exactly like: ![step context](./screenshots/event-001-click.png)
- Only reference paths listed in screenshotAssets.
- Do not reference images that are not listed.${getMarkdownLanguageInstruction(input.language)}

Important: Return ONLY raw Markdown. Do NOT wrap the response in markdown code blocks.`;

  const content: any[] = [
    {
      type: 'text',
      text: promptText,
    },
  ];

  for (const asset of screenshotAssets) {
    content.push({
      type: 'text',
      text: `Screenshot asset for event #${asset.eventIndex + 1}: ${asset.relativePath}`,
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
        'You generate precise Markdown replay scripts for Midscene agent.runMarkdown. The output must be deterministic, ordered, and safe for AI execution.',
    },
    {
      role: 'user',
      content,
    },
  ];
}

export async function generateRecorderMarkdownReplay(
  input: RecorderMarkdownGenerationInput,
  modelConfig: IModelConfig,
): Promise<string> {
  try {
    const prompt = createRecorderMarkdownReplayPrompt(input);
    const response = await callAIWithStringResponse(prompt, modelConfig);

    if (response?.content && typeof response.content === 'string') {
      return normalizeGeneratedMarkdown(response.content);
    }

    throw new Error('Failed to generate recorder Markdown replay');
  } catch (error) {
    throw new Error(`Failed to generate recorder Markdown replay: ${error}`);
  }
}
