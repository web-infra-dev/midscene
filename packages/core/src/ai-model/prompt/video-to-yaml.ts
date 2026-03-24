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

export type VideoScriptFormat = 'yaml' | 'playwright' | 'puppeteer';

export interface VideoSegmentInfo {
  index: number;
  total: number;
  timeRange: [number, number];
}

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

function buildPuppeteerSystemPrompt(): string {
  const puppeteerExample = [
    '// Puppeteer + Midscene example',
    'import puppeteer from "puppeteer";',
    'import { PuppeteerAgent } from "@midscene/web/puppeteer";',
    '',
    'const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));',
    'Promise.resolve(',
    '  (async () => {',
    '    const browser = await puppeteer.launch({ headless: false });',
    '    const page = await browser.newPage();',
    '    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });',
    '    await page.goto("https://www.example.com");',
    '    await sleep(3000);',
    '',
    '    const agent = new PuppeteerAgent(page);',
    '    await agent.aiAct(\'type "search term" in search box, hit Enter\');',
    '    await agent.aiAssert("There are search results displayed");',
    '    const items = await agent.aiQuery("{title: string, price: number}[], find items");',
    '    console.log("items:", items);',
    '',
    '    await browser.close();',
    '  })()',
    ');',
  ].join('\n');

  return `You are an expert test automation engineer specializing in Puppeteer and Midscene.js. Your task is to analyze a sequence of screenshots extracted from a screen recording video and generate a **runnable** Puppeteer script using @midscene/web/puppeteer that reproduces the user's actions.
${MIDSCENE_CONSTRAINTS}

For Puppeteer scripts, navigation is handled by \`page.goto(url)\` — NEVER generate aiTap/aiInput actions targeting the browser address bar.
${ACTION_DETECTION_GUIDE}
## Output Rules

- Output ONLY the raw TypeScript code — no markdown code fences, no explanation.
- The script MUST be immediately executable with \`npx tsx script.ts\`.
- Extract the actual page URL from the address bar visible in the video frames.
- Use \`page.goto(url)\` for navigation.
- Use the PuppeteerAgent methods: agent.aiAct, agent.aiTap, agent.aiInput, agent.aiAssert, agent.aiQuery, agent.aiWaitFor.
- Use natural language descriptions for element targeting.

## Puppeteer + Midscene Code Reference
${puppeteerExample}`;
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

  const formatLabel =
    format === 'yaml'
      ? 'Midscene YAML'
      : format === 'puppeteer'
        ? 'Puppeteer script'
        : 'Playwright test';
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
    format === 'yaml'
      ? buildYamlSystemPrompt()
      : format === 'puppeteer'
        ? buildPuppeteerSystemPrompt()
        : buildPlaywrightSystemPrompt();

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

function prependWebConfigIfMissing(
  content: string,
  options: VideoToScriptOptions,
): string {
  if (!options.url || content.includes('url:')) {
    return content;
  }
  const webConfig = [
    'web:',
    `  url: "${options.url}"`,
    options.viewportWidth ? `  viewportWidth: ${options.viewportWidth}` : null,
    options.viewportHeight
      ? `  viewportHeight: ${options.viewportHeight}`
      : null,
    '',
  ]
    .filter(Boolean)
    .join('\n');
  return `${webConfig}\n${content}`;
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

  const content = prependWebConfigIfMissing(
    stripCodeFences(response.content, 'yaml'),
    options,
  );

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

/**
 * Generate a Puppeteer + Midscene script from video frames using a VLM.
 */
export async function generatePuppeteerFromVideoFrames(
  frames: VideoFrame[],
  options: VideoToScriptOptions,
  modelConfig: IModelConfig,
): Promise<{ content: string }> {
  if (frames.length === 0) {
    throw new Error('No frames provided for video-to-Puppeteer generation');
  }

  const messages = buildMultimodalMessages(frames, options, 'puppeteer');
  const response = await callAIWithStringResponse(messages, modelConfig);
  const content = stripCodeFences(response.content, 'puppeteer');

  return { content };
}

// --- Segmented video processing ---

function buildSegmentSystemPrompt(): string {
  return `You are an expert in UI test automation. You are analyzing ONE SEGMENT of a longer screen recording video.

Your task: identify all user actions in this segment and output them as an ordered action list.
${MIDSCENE_CONSTRAINTS}
${ACTION_DETECTION_GUIDE}
## Output Rules

- Output ONLY a numbered list of actions, one per line. No code fences, no YAML/TS boilerplate, no web.url, no imports.
- Each action should be a single line describing: action type + target element + value (if any).
- Format: \`<N>. <actionType>: <description>\`
- Action types: tap, input, keyboardPress, scroll, assert, waitFor, navigate
- For "input" actions, include the value: \`input: "hello world" in the search field\`
- For "navigate" actions, include the URL: \`navigate: https://example.com\`
- The first frame may overlap with the previous segment — use it for context but don't duplicate actions from it.
- If nothing meaningful happens in this segment, output: \`NO_ACTIONS\`
`;
}

function buildSegmentUserPrompt(
  frames: VideoFrame[],
  options: VideoToScriptOptions,
  segmentInfo: VideoSegmentInfo,
): string {
  const parts: string[] = [];
  parts.push(
    `This is segment ${segmentInfo.index + 1} of ${segmentInfo.total}, covering timestamps ${segmentInfo.timeRange[0].toFixed(1)}s to ${segmentInfo.timeRange[1].toFixed(1)}s of the screen recording.`,
  );
  if (options.url) {
    parts.push(`\nThe page URL is: ${options.url}`);
  }
  if (options.description) {
    parts.push(`\nVideo description: ${options.description}`);
  }
  parts.push(
    `\nThere are ${frames.length} frames in this segment. Identify all user actions.`,
  );
  parts.push(
    '\nOutput ONLY the numbered action list. No code, no explanation.',
  );
  return parts.join('');
}

/**
 * Analyze a single video segment and return an action list.
 */
export async function generateFromVideoSegment(
  frames: VideoFrame[],
  options: VideoToScriptOptions,
  segmentInfo: VideoSegmentInfo,
  modelConfig: IModelConfig,
): Promise<{ content: string }> {
  const systemPrompt = buildSegmentSystemPrompt();
  const userText = buildSegmentUserPrompt(frames, options, segmentInfo);

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
      image_url: { url: ensureDataUri(frame.base64), detail: 'high' },
    });
  }

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent as any },
  ];

  const response = await callAIWithStringResponse(messages, modelConfig);
  return { content: response.content.trim() };
}

function buildMergeSystemPrompt(format: VideoScriptFormat): string {
  const formatRef =
    format === 'yaml'
      ? `## YAML Format Reference\n${YAML_EXAMPLE_CODE}`
      : `## Playwright + Midscene Code Reference\n${PLAYWRIGHT_EXAMPLE_CODE}`;

  const outputInstr =
    format === 'yaml'
      ? 'Output ONLY valid Midscene YAML — no markdown code fences, no explanation. Include web.url, tasks, and flow.'
      : 'Output ONLY the raw TypeScript Playwright test code — no markdown code fences, no explanation. Include imports, test setup, and test body.';

  return `You are an expert in UI test automation with Midscene.js. You are given action lists from sequential segments of a screen recording video. Your task is to merge them into a single coherent, runnable test script.
${MIDSCENE_CONSTRAINTS}
## Merge Rules

1. Combine all segment actions into one chronological sequence.
2. Remove duplicate actions at segment boundaries (overlapping frames may cause the same action to appear in two consecutive segments).
3. Group related actions into logical tasks with descriptive names.
4. Add aiWaitFor/aiAssert where appropriate for page load and state verification.
5. ${outputInstr}

${formatRef}`;
}

function buildMergeUserPrompt(
  segmentResults: string[],
  options: VideoToScriptOptions,
  format: VideoScriptFormat,
): string {
  const parts: string[] = [];
  parts.push(
    `Below are action lists from ${segmentResults.length} sequential segments of a screen recording. Merge them into a single runnable ${format === 'yaml' ? 'Midscene YAML' : format === 'puppeteer' ? 'Puppeteer' : 'Playwright test'} script.`,
  );

  if (options.url) {
    parts.push(`\nThe starting URL is: ${options.url}`);
  } else {
    parts.push(
      '\nDetermine the page URL from the navigate actions in the segments.',
    );
  }
  if (options.description) {
    parts.push(`\nVideo description: ${options.description}`);
  }

  for (let i = 0; i < segmentResults.length; i++) {
    parts.push(`\n--- Segment ${i + 1} ---\n${segmentResults[i]}`);
  }

  parts.push(
    '\n\nIMPORTANT: Return ONLY the raw code content. Do NOT wrap in markdown code blocks.',
  );
  return parts.join('');
}

/**
 * Merge action lists from multiple video segments into a single script.
 * This is a text-only call (no images) so it's fast and cheap.
 */
export async function mergeSegmentResults(
  segmentResults: string[],
  options: VideoToScriptOptions,
  format: VideoScriptFormat,
  modelConfig: IModelConfig,
): Promise<{ content: string }> {
  const systemPrompt = buildMergeSystemPrompt(format);
  const userText = buildMergeUserPrompt(segmentResults, options, format);

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userText },
  ];

  const response = await callAIWithStringResponse(messages, modelConfig);
  let content = stripCodeFences(response.content, format);

  if (format === 'yaml') {
    content = prependWebConfigIfMissing(content, options);
  }

  return { content };
}
