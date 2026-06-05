import type { IModelConfig } from '@midscene/shared/env';
import {
  getMidsceneRecorderEventDescription,
  stringifyMidsceneRecorderTargetBlock,
} from '@midscene/shared/recorder';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import { callAIWithStringResponse } from '../index';
import {
  type RecorderGenerationInput,
  prepareRecorderGenerationContext,
  validateEvents,
} from './recorder-generation-common';

export type RecorderMarkdownGenerationInput = RecorderGenerationInput;

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

export function createRecorderMarkdownReplayPrompt(
  input: RecorderMarkdownGenerationInput,
): ChatCompletionMessageParam[] {
  validateEvents(input.events);

  const { summary, screenshotAssets } = prepareRecorderGenerationContext(input);
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
- Prefer event.replayInstruction and event.elementDescription when descriptionSource is "ai".
- If descriptionSource is "fallback", use the screenshot/context to write the best visual instruction.
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
    events: summary.events,
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

export async function convertRecordLogIntoMarkdown(
  log: RecorderMarkdownGenerationInput,
  modelConfig: IModelConfig,
): Promise<string> {
  return generateRecorderMarkdownReplay(log, modelConfig);
}
