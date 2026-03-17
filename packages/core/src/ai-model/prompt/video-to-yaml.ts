import {
  PLAYWRIGHT_EXAMPLE_CODE,
  YAML_EXAMPLE_CODE,
} from '@midscene/shared/constants';
import type { IModelConfig } from '@midscene/shared/env';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import { callAIWithStringResponse } from '../index';

export interface VideoFrame {
  /** base64-encoded image data (with or without data URI prefix) */
  base64: string;
  /** timestamp in seconds */
  timestamp: number;
}

export interface VideoToScriptOptions {
  /** The starting URL of the web page shown in the video */
  url?: string;
  /** A brief description of what the video demonstrates */
  description?: string;
  /** Viewport width observed in the video */
  viewportWidth?: number;
  /** Viewport height observed in the video */
  viewportHeight?: number;
}

export type VideoScriptFormat = 'yaml' | 'playwright';

function ensureDataUri(base64: string): string {
  if (base64.startsWith('data:')) {
    return base64;
  }
  return `data:image/jpeg;base64,${base64}`;
}

const MIDSCENE_CONSTRAINTS = `
## CRITICAL — Midscene Constraints (You MUST follow these)

Midscene automates the **web page content area** only. It CANNOT interact with:
- Browser chrome (address bar, bookmarks bar, tab bar, back/forward buttons)
- OS-level UI (taskbar, dock, system dialogs, file picker)
- Developer tools

Therefore:
1. **URL navigation** must be handled via the \`web.url\` field (for the starting URL) or \`javascript: window.location.href = '...'\` (for mid-flow navigation). NEVER generate actions that type into the address bar or click browser navigation buttons.
2. If the video shows the user typing a URL in the address bar and pressing Enter, convert that into the appropriate \`web.url\` or \`javascript\` navigation — NOT aiTap/aiInput on the address bar.
3. Only target elements **inside the web page content**.
4. If you see the browser address bar showing a URL, extract it and use it as \`web.url\`.
`;

const ACTION_DETECTION_GUIDE = `
## Action Detection Guide

- **Click/Tap**: An element becomes focused, pressed, or a new page/modal appears after a frame.
- **Text Input**: Text appears in an input field that was empty or had different text before.
- **Scroll**: The page content shifts up/down/left/right between frames.
- **Navigation**: The URL changes or page content changes dramatically — use \`web.url\` or \`javascript\` for this.
- **Keyboard Press**: A specific key action occurs (Enter to submit, Tab to move focus, Escape to close).
- **Hover**: A tooltip or dropdown appears when the cursor is over an element.
`;

function buildYamlSystemPrompt(): string {
  return `You are an expert in UI test automation with Midscene.js. Your task is to analyze a sequence of screenshots extracted from a screen recording video and generate a **runnable** Midscene YAML test script that reproduces the user's actions.

## Your Analysis Process

1. **Observe each frame carefully** — note what changed between consecutive frames.
2. **Identify user actions** — clicks, typing, scrolling, navigation, keyboard shortcuts.
3. **Determine action targets** — describe UI elements in natural language (e.g., "the search input box", "the Login button", "the first product card").
4. **Identify the sequence** — order actions chronologically.
5. **Group into logical tasks** — group related actions into named tasks.
6. **Extract URLs** — read the address bar in screenshots to determine the actual URL.
${MIDSCENE_CONSTRAINTS}
${ACTION_DETECTION_GUIDE}
## Output Rules

- Output ONLY valid Midscene YAML — no markdown code fences, no explanation.
- The \`web.url\` field MUST be set to the actual page URL visible in the video (read it from the address bar in the frames).
- Use natural language descriptions for element targeting (Midscene uses AI to locate elements).
- Prefer specific, unambiguous element descriptions.
- Use aiTap for clicks, aiInput for text entry, aiScroll for scrolling, aiAssert for verifying important state changes.
- Add aiWaitFor when the page needs time to load after navigation or actions.
- If the user navigates to a different URL mid-flow, use \`javascript: window.location.href = 'new_url'\`.

## YAML Format Reference
${YAML_EXAMPLE_CODE}`;
}

function buildPlaywrightSystemPrompt(): string {
  return `You are an expert test automation engineer specializing in Playwright and Midscene.js. Your task is to analyze a sequence of screenshots extracted from a screen recording video and generate a **runnable** Playwright test using @midscene/web/playwright that reproduces the user's actions.
${MIDSCENE_CONSTRAINTS}

For Playwright tests, navigation is handled by \`page.goto(url)\` in beforeEach — NEVER generate aiTap/aiInput actions targeting the browser address bar.
${ACTION_DETECTION_GUIDE}
## Output Rules

- Output ONLY the raw TypeScript test code — no markdown code fences, no explanation.
- The test MUST be immediately executable without modification.
- Extract the actual page URL from the address bar visible in the video frames.
- Use \`page.goto(url)\` for the initial navigation in beforeEach.
- Use \`page.goto(url)\` for mid-flow navigation if the URL changes.
- Use natural language descriptions for element targeting.

## Playwright + Midscene Code Reference
${PLAYWRIGHT_EXAMPLE_CODE}`;
}

function buildUserPrompt(
  frames: VideoFrame[],
  options: VideoToScriptOptions,
  format: VideoScriptFormat,
): string {
  const parts: string[] = [];

  parts.push(
    'I recorded a screen video of a user interacting with a web application. Below are key frames extracted from the video in chronological order.',
  );

  if (options.url) {
    parts.push(`\nThe starting URL is: ${options.url}`);
  } else {
    parts.push(
      '\nIMPORTANT: Look at the browser address bar in the frames to determine the actual URL of the page. Use that URL in the output.',
    );
  }

  if (options.description) {
    parts.push(`\nDescription of what the video shows: ${options.description}`);
  }

  parts.push(
    `\nThere are ${frames.length} frames in total. Each frame is labeled with its timestamp.`,
  );

  const formatLabel = format === 'yaml' ? 'Midscene YAML' : 'Playwright test';
  parts.push(
    `\nAnalyze the frames to identify all user actions, then generate a complete, runnable ${formatLabel} script that reproduces the workflow.`,
  );

  parts.push(
    '\nREMINDER: Do NOT generate actions that interact with the browser address bar or browser chrome. Convert URL typing into web.url / page.goto().',
  );

  parts.push(
    '\nIMPORTANT: Return ONLY the raw code content. Do NOT wrap the response in markdown code blocks.',
  );

  return parts.join('');
}

function buildMultimodalMessages(
  frames: VideoFrame[],
  options: VideoToScriptOptions,
  format: VideoScriptFormat,
): ChatCompletionMessageParam[] {
  const systemPrompt =
    format === 'yaml' ? buildYamlSystemPrompt() : buildPlaywrightSystemPrompt();

  const userText = buildUserPrompt(frames, options, format);

  const userContent: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string; detail?: string } }
  > = [];

  userContent.push({ type: 'text', text: userText });

  for (const frame of frames) {
    userContent.push({
      type: 'text',
      text: `\n[Frame at ${frame.timestamp.toFixed(1)}s]:`,
    });
    userContent.push({
      type: 'image_url',
      image_url: {
        url: ensureDataUri(frame.base64),
        detail: 'high',
      },
    });
  }

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent as any },
  ];
}

function stripCodeFences(content: string, format: VideoScriptFormat): string {
  let result = content;
  if (format === 'yaml') {
    result = result.replace(/^```(?:ya?ml)?\s*\n?/i, '');
  } else {
    result = result.replace(/^```(?:typescript|javascript|ts|js)?\s*\n?/i, '');
  }
  result = result.replace(/\n?```\s*$/i, '');
  return result.trim();
}

/**
 * Generate a Midscene YAML test script from video frames using a VLM.
 */
export async function generateYamlFromVideoFrames(
  frames: VideoFrame[],
  options: VideoToScriptOptions,
  modelConfig: IModelConfig,
): Promise<{ content: string }> {
  if (frames.length === 0) {
    throw new Error('No frames provided for video-to-YAML generation');
  }

  const messages = buildMultimodalMessages(frames, options, 'yaml');
  const response = await callAIWithStringResponse(messages, modelConfig);

  let content = stripCodeFences(response.content, 'yaml');

  // If a URL was provided but not in the generated YAML, prepend web config
  if (options.url && !content.includes('url:')) {
    const webConfig = [
      'web:',
      `  url: "${options.url}"`,
      options.viewportWidth
        ? `  viewportWidth: ${options.viewportWidth}`
        : null,
      options.viewportHeight
        ? `  viewportHeight: ${options.viewportHeight}`
        : null,
      '',
    ]
      .filter(Boolean)
      .join('\n');
    content = `${webConfig}\n${content}`;
  }

  return { content };
}

/**
 * Generate a Playwright + Midscene test script from video frames using a VLM.
 */
export async function generatePlaywrightFromVideoFrames(
  frames: VideoFrame[],
  options: VideoToScriptOptions,
  modelConfig: IModelConfig,
): Promise<{ content: string }> {
  if (frames.length === 0) {
    throw new Error('No frames provided for video-to-Playwright generation');
  }

  const messages = buildMultimodalMessages(frames, options, 'playwright');
  const response = await callAIWithStringResponse(messages, modelConfig);
  const content = stripCodeFences(response.content, 'playwright');

  return { content };
}
