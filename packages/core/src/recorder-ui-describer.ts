import type { IModelConfig } from '@midscene/shared/env';
import { compositeElementInfoImg } from '@midscene/shared/img';
import type {
  MidsceneRecorderEvent,
  MidsceneRecorderPageInfo,
  MidsceneRecorderSemanticAction,
  MidsceneRecorderTarget,
} from '@midscene/shared/recorder';
import {
  buildMidsceneRecorderActionSummary,
  buildMidsceneRecorderReplayInstruction,
  getMidsceneRecorderSemantic,
} from '@midscene/shared/recorder';
import { RECORDER_UI_DESCRIBER_SYSTEM_PROMPT } from './ai-model/prompt/recorder-ui-describer';
import { callAIWithObjectResponse } from './ai-model/service-caller';
import type { Rect } from './types';

export interface DescribeRecorderUIEventInput {
  event: MidsceneRecorderEvent;
  target?: MidsceneRecorderTarget;
}

export interface DescribeRecorderUIEventOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  concurrency?: number;
}

export interface DescribeRecorderUIEventResult {
  event: MidsceneRecorderEvent;
  usedFallback: boolean;
  error?: string;
}

interface RecorderUIEventAIResponse {
  elementDescription?: string;
  replayInstruction?: string;
  actionSummary?: string;
  scrollDestinationDescription?: string;
  confidence?: 'high' | 'medium' | 'low';
  error?: string;
}

const RECORDER_UI_DESCRIBER_DEFAULT_RETRIES = 2;
const RECORDER_UI_DESCRIBER_DEFAULT_RETRY_DELAY_MS = 200;
const RECORDER_UI_DESCRIBER_DEFAULT_CONCURRENCY = 2;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPendingDescription(value?: string) {
  return value?.trim() === 'AI is analyzing element...';
}

function getRecorderEventScreenshot(event: MidsceneRecorderEvent) {
  return (
    event.screenshotWithBox || event.screenshotBefore || event.screenshotAfter
  );
}

function getRecorderEventAfterScreenshot(event: MidsceneRecorderEvent) {
  return event.screenshotAfter || event.screenshotWithBox;
}

function normalizeActionType(event: MidsceneRecorderEvent) {
  return event.actionType?.trim();
}

function getPlatformId(target?: MidsceneRecorderTarget) {
  return target?.platformId?.toLowerCase();
}

function getPlatformSurface(target?: MidsceneRecorderTarget) {
  switch (getPlatformId(target)) {
    case 'web':
      return 'current web page';
    case 'android':
    case 'ios':
    case 'harmony':
      return 'current mobile screen';
    case 'computer':
      return 'current desktop screen';
    default:
      return 'current UI';
  }
}

function getPlatformGuidance(target?: MidsceneRecorderTarget) {
  switch (getPlatformId(target)) {
    case 'web':
      return 'For web targets, use web UI terms such as button, input, link, menu item, tab, dialog, aria-label, placeholder, and form section when visible or inferable.';
    case 'android':
    case 'ios':
    case 'harmony':
      return 'For mobile targets, use mobile UI terms such as tab, list item, text field, icon button, navigation bar, bottom bar, sheet, card, and screen section.';
    case 'computer':
      return 'For desktop/computer targets, use desktop UI terms such as menu item, toolbar button, dialog field, sidebar item, window control, file row, and application region.';
    default:
      return 'Use platform-neutral UI terms such as control, field, item, icon button, list item, region, panel, and page section.';
  }
}

function getPointerActionVerb(event: MidsceneRecorderEvent) {
  switch (normalizeActionType(event)) {
    case 'Tap':
      return 'Tap';
    case 'DoubleClick':
      return 'Double click';
    case 'LongPress':
      return 'Long press';
    case 'RightClick':
      return 'Right click';
    default:
      return 'Click';
  }
}

function getDragActionVerb(event: MidsceneRecorderEvent) {
  switch (normalizeActionType(event)) {
    case 'Swipe':
      return 'Swipe';
    case 'DragAndDrop':
      return 'Drag';
    default:
      return 'Drag';
  }
}

function pointToRect(
  x: number,
  y: number,
  size: number,
  pageInfo: MidsceneRecorderPageInfo,
): Rect {
  const width = pageInfo.width || size;
  const height = pageInfo.height || size;
  const left = clamp(Math.floor(x - size / 2), 0, Math.max(width - 1, 0));
  const top = clamp(Math.floor(y - size / 2), 0, Math.max(height - 1, 0));
  return {
    left,
    top,
    width: Math.min(size, Math.max(width - left, 1)),
    height: Math.min(size, Math.max(height - top, 1)),
  };
}

function getPointRectSize(event: MidsceneRecorderEvent) {
  switch (event.type) {
    case 'scroll':
      return 96;
    case 'drag':
      return 64;
    default:
      return 36;
  }
}

export function getRecorderUIEventTargetRect(
  event: MidsceneRecorderEvent,
): Rect | null {
  const rect = event.elementRect;
  if (!rect) {
    return null;
  }

  if (
    isFiniteNumber(rect.width) &&
    rect.width > 0 &&
    isFiniteNumber(rect.height) &&
    rect.height > 0 &&
    (isFiniteNumber(rect.left) || isFiniteNumber(rect.top))
  ) {
    return {
      left: rect.left || 0,
      top: rect.top || 0,
      width: rect.width,
      height: rect.height,
    };
  }

  if (isFiniteNumber(rect.x) && isFiniteNumber(rect.y)) {
    return pointToRect(rect.x, rect.y, getPointRectSize(event), event.pageInfo);
  }

  return null;
}

function getFallbackDescription(
  event: MidsceneRecorderEvent,
  target?: MidsceneRecorderTarget,
) {
  const pageContext = getPageSemanticContext(event);
  const surface = getPlatformSurface(target);

  switch (event.type) {
    case 'navigation':
      return event.url || event.value || event.actionType || 'navigation';
    case 'scroll':
      return pageContext
        ? `${pageContext} scrollable content`
        : `scrollable content on the ${surface}`;
    case 'drag':
      return pageContext
        ? `gesture area in ${pageContext}`
        : `gesture area on the ${surface}`;
    case 'input':
      return `unresolved input field on the ${surface}`;
    case 'keydown':
      return pageContext
        ? `focused control in ${pageContext}`
        : `focused control on the ${surface}`;
    default:
      return pageContext
        ? `control in ${pageContext}`
        : `control on the ${surface}`;
  }
}

function buildSemanticAction(
  event: MidsceneRecorderEvent,
  scrollDestinationDescription?: string,
): MidsceneRecorderSemanticAction {
  return {
    type: event.type,
    actionType: event.actionType,
    value: event.value,
    url: event.url,
    scrollDestinationDescription,
  };
}

function getFallbackReplayInstruction(
  event: MidsceneRecorderEvent,
  elementDescription: string,
) {
  return buildMidsceneRecorderReplayInstruction(
    buildSemanticAction(event),
    elementDescription,
  );
}

function getFallbackActionSummary(
  event: MidsceneRecorderEvent,
  elementDescription: string,
) {
  return buildMidsceneRecorderActionSummary(
    buildSemanticAction(event),
    elementDescription,
  );
}

function getActionGuidance(
  event: MidsceneRecorderEvent,
  target?: MidsceneRecorderTarget,
) {
  const platformGuidance = getPlatformGuidance(target);

  switch (event.type) {
    case 'click':
      return `${platformGuidance} Identify the ${getPointerActionVerb(event).toLowerCase()} target by exact visible text first, then label/placeholder, then role plus stable surrounding context, then icon purpose, then visual position. Never describe it by coordinates, marker location, or as a nearby element.`;
    case 'input':
      return `${platformGuidance} Identify the exact input field at the marker before text entry. Use stable visible label, field role, field name, surrounding section, or sequence intent. Treat hint text that can change by user, time, data, or context as secondary evidence. Preserve the recorded input value only in replayInstruction; never describe the typed value or page title alone as the field.`;
    case 'scroll':
      return `${platformGuidance} Identify the scrollable page/region and concrete destination content revealed after scrolling. Use newly visible headings, section titles, list/table names, list items, or stable region labels; never say only "more content" or "current page".`;
    case 'drag':
      return `${platformGuidance} Identify the ${getDragActionVerb(event).toLowerCase()} start/end regions or the dragged UI control. Do not describe only the gesture path or coordinates.`;
    case 'keydown':
      return `${platformGuidance} Identify the focused element or keyboard target if visible, and preserve the recorded key in the replay instruction.`;
    default:
      return `${platformGuidance} Identify the UI target involved in this event using the most stable visible text or surrounding context.`;
  }
}

function getEventRawCoordinates(event: MidsceneRecorderEvent) {
  const x = event.elementRect?.x;
  const y = event.elementRect?.y;
  if (isFiniteNumber(x) && isFiniteNumber(y)) {
    return { x, y };
  }
  return undefined;
}

function getPageSemanticContext(event: MidsceneRecorderEvent) {
  const candidates = [event.title, event.url]
    .map((item) => item?.trim())
    .filter(Boolean) as string[];
  return candidates[0];
}

function isWeakDescription(value?: string) {
  if (!value) {
    return true;
  }
  if (isPendingDescription(value)) {
    return true;
  }
  const normalized = value.trim().toLowerCase();
  const compact = normalized.replace(/\s+/g, '');
  return (
    normalized.length === 0 ||
    /^\(?\d+(?:\.\d+)?,\s*\d+(?:\.\d+)?\)?$/.test(normalized) ||
    normalized === 'target' ||
    normalized === 'element' ||
    normalized === 'target element' ||
    normalized === 'the element' ||
    normalized === 'page element' ||
    normalized === 'input field' ||
    normalized === 'text input' ||
    normalized === 'text field' ||
    normalized === 'search box' ||
    normalized === 'more content' ||
    normalized === 'the page' ||
    normalized === 'current page' ||
    normalized === 'current screen' ||
    normalized === 'the screen' ||
    normalized === 'current ui' ||
    normalized === 'current visible ui' ||
    normalized === 'current visible page' ||
    normalized === 'current visible screen' ||
    normalized === 'main area' ||
    normalized === 'main scrollable area' ||
    normalized === 'scrollable area' ||
    normalized === 'highlighted element' ||
    normalized === 'highlighted item' ||
    normalized === 'marked element' ||
    normalized === 'marked item' ||
    normalized.includes('ai is analyzing element') ||
    compact.includes('坐标') ||
    compact.includes('附近') ||
    compact.includes('附近的元素') ||
    normalized.includes('coordinate') ||
    normalized.includes('near the coordinate') ||
    normalized.includes('near coordinates') ||
    normalized.includes('nearby element') ||
    normalized.includes('nearby item') ||
    normalized.includes('near the marker') ||
    normalized.includes('near marker') ||
    normalized.includes('near the point') ||
    normalized.includes('near point') ||
    normalized.includes('at the point') ||
    normalized.includes('button near point') ||
    normalized.includes('shown in the screenshot') ||
    normalized.includes('red rectangle') ||
    normalized.includes('red marker') ||
    normalized.includes('red box') ||
    normalized.includes('highlighted element') ||
    normalized.includes('highlighted item') ||
    normalized.includes('highlighted screenshot')
  );
}

function isWeakReplayInstruction(value?: string) {
  if (!value) {
    return true;
  }
  if (isPendingDescription(value)) {
    return true;
  }
  const normalized = value.trim().toLowerCase();
  const compact = normalized.replace(/\s+/g, '');
  return (
    compact.includes('坐标') ||
    compact.includes('附近') ||
    normalized.includes('coordinate') ||
    normalized.includes('near the coordinate') ||
    normalized.includes('nearby element') ||
    normalized.includes('nearby item') ||
    normalized.includes('near the marker') ||
    normalized.includes('near marker') ||
    normalized.includes('near the point') ||
    normalized.includes('near point') ||
    normalized.includes('at the point') ||
    normalized.includes('ai is analyzing element') ||
    normalized.includes('more content') ||
    normalized.includes('current page') ||
    normalized.includes('current screen') ||
    normalized.includes('highlighted element') ||
    normalized.includes('highlighted item') ||
    normalized.includes('red marker') ||
    normalized.includes('red box') ||
    normalized.includes('shown in the screenshot') ||
    normalized.includes('highlighted screenshot')
  );
}

function normalizeForComparison(value: string) {
  return value.trim().toLowerCase().replace(/["'`]/g, '').replace(/\s+/g, ' ');
}

function isInputValueUsedAsFieldDescription(
  event: MidsceneRecorderEvent,
  elementDescription?: string,
) {
  if (event.type !== 'input' || !event.value || !elementDescription) {
    return false;
  }

  const typedValue = normalizeForComparison(event.value);
  if (!typedValue) {
    return false;
  }
  const description = normalizeForComparison(elementDescription);

  return (
    description === typedValue ||
    description === `${typedValue} input` ||
    description === `${typedValue} field` ||
    description === `${typedValue} text field` ||
    description === `input ${typedValue}` ||
    description === `field ${typedValue}` ||
    description.includes(`typed value ${typedValue}`) ||
    description.includes(`value ${typedValue}`)
  );
}

function hasScrollDestination(
  replayInstruction: string,
  scrollDestinationDescription?: string,
) {
  if (
    scrollDestinationDescription &&
    !isWeakDescription(scrollDestinationDescription)
  ) {
    return true;
  }
  const normalized = replayInstruction.toLowerCase();
  return (
    normalized.includes(' until ') ||
    normalized.includes(' visible') ||
    normalized.includes(' reveal') ||
    normalized.includes(' to the ') ||
    normalized.includes(' toward ')
  );
}

async function describeWithRetry(
  event: MidsceneRecorderEvent,
  target: MidsceneRecorderTarget | undefined,
  highlightedScreenshot: string,
  modelConfig: IModelConfig,
  options: Required<
    Pick<DescribeRecorderUIEventOptions, 'maxRetries' | 'retryDelayMs'>
  >,
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.maxRetries; attempt += 1) {
    try {
      const afterScreenshot = getRecorderEventAfterScreenshot(event);
      const pageContext = getPageSemanticContext(event);
      const platformGuidance = getPlatformGuidance(target);
      const userContent: any[] = [
        {
          type: 'text',
          text: `Recorder event:
${JSON.stringify(
  {
    type: event.type,
    actionType: event.actionType,
    value: event.value,
    rawCoordinates: getEventRawCoordinates(event),
    url: event.url,
    title: event.title,
    pageContext,
    pageInfo: event.pageInfo,
    target,
    platformGuidance,
    guidance: getActionGuidance(event, target),
  },
  null,
  2,
)}

The target or region is highlighted in the screenshot below. Convert this event into semantic replay fields.`,
        },
        {
          type: 'image_url',
          image_url: {
            url: highlightedScreenshot,
            detail: 'high',
          },
        },
      ];
      if (afterScreenshot) {
        userContent.push(
          {
            type: 'text',
            text: 'Screenshot after the recorded action, for context only:',
          },
          {
            type: 'image_url',
            image_url: {
              url: afterScreenshot,
              detail: 'high',
            },
          },
        );
      }
      const response =
        await callAIWithObjectResponse<RecorderUIEventAIResponse>(
          [
            {
              role: 'system',
              content: RECORDER_UI_DESCRIBER_SYSTEM_PROMPT,
            },
            {
              role: 'user',
              content: userContent,
            },
          ],
          modelConfig,
        );

      const content = response.content;
      if (content.error) {
        throw new Error(content.error);
      }
      if (isWeakDescription(content.elementDescription)) {
        throw new Error('AI returned a weak recorder event description.');
      }
      if (
        isInputValueUsedAsFieldDescription(event, content.elementDescription)
      ) {
        throw new Error(
          'AI used the recorded input value as the field description.',
        );
      }
      const elementDescription = content.elementDescription!.trim();
      const scrollDestinationDescription =
        event.type === 'scroll'
          ? content.scrollDestinationDescription?.trim()
          : undefined;
      if (
        event.type === 'scroll' &&
        !hasScrollDestination('', scrollDestinationDescription)
      ) {
        throw new Error(
          'AI returned a scroll description without a destination.',
        );
      }
      const aiReplayInstruction = content.replayInstruction?.trim();
      if (aiReplayInstruction && isWeakReplayInstruction(aiReplayInstruction)) {
        throw new Error('AI returned a weak recorder replay instruction.');
      }
      const semanticAction = buildSemanticAction(
        event,
        scrollDestinationDescription,
      );
      const replayInstruction = buildMidsceneRecorderReplayInstruction(
        semanticAction,
        elementDescription,
      );
      if (isWeakReplayInstruction(replayInstruction)) {
        throw new Error('AI returned a weak recorder replay instruction.');
      }
      const actionSummary = buildMidsceneRecorderActionSummary(
        semanticAction,
        elementDescription,
      );

      return {
        source: 'recorderAI' as const,
        status: 'ready' as const,
        elementDescription,
        replayInstruction,
        actionSummary,
        confidence: content.confidence || 'medium',
      };
    } catch (error) {
      lastError = error;
      if (attempt < options.maxRetries) {
        await delay(options.retryDelayMs);
      }
    }
  }
  throw lastError;
}

async function createScreenshotWithBox(
  event: MidsceneRecorderEvent,
  rect: Rect,
) {
  if (event.screenshotWithBox) {
    return event.screenshotWithBox;
  }
  const screenshot = getRecorderEventScreenshot(event);
  if (!screenshot) {
    return undefined;
  }
  return compositeElementInfoImg({
    inputImgBase64: screenshot,
    size: event.pageInfo,
    elementsPositionInfo: [{ rect }],
    borderThickness: 3,
    annotationPadding: 2,
  });
}

function createFallbackEvent(
  event: MidsceneRecorderEvent,
  error: string,
  screenshotWithBox?: string,
  target?: MidsceneRecorderTarget,
): MidsceneRecorderEvent {
  const semantic = getMidsceneRecorderSemantic(event);
  const elementDescription =
    semantic?.elementDescription &&
    !isWeakDescription(semantic.elementDescription)
      ? semantic.elementDescription
      : getFallbackDescription(event, target);
  return {
    ...event,
    semantic: {
      source: 'heuristic',
      status: 'ready',
      elementDescription,
      replayInstruction: getFallbackReplayInstruction(
        event,
        elementDescription,
      ),
      actionSummary: getFallbackActionSummary(event, elementDescription),
      confidence: 'low',
      error,
    },
    screenshotWithBox: screenshotWithBox || event.screenshotWithBox,
  };
}

export async function describeRecorderUIEvent(
  input: DescribeRecorderUIEventInput,
  modelConfig: IModelConfig,
  options: DescribeRecorderUIEventOptions = {},
): Promise<DescribeRecorderUIEventResult> {
  const event = input.event;
  const rect = getRecorderUIEventTargetRect(event);
  const screenshot = getRecorderEventScreenshot(event);

  if (!rect || !screenshot) {
    const error = !rect
      ? 'Recorder event has no target rectangle.'
      : 'Recorder event has no screenshot.';
    return {
      usedFallback: true,
      event: createFallbackEvent(event, error, undefined, input.target),
    };
  }

  let screenshotWithBox: string | undefined;
  try {
    screenshotWithBox = await createScreenshotWithBox(event, rect);
    const semanticFields = await describeWithRetry(
      event,
      input.target,
      screenshotWithBox || screenshot,
      modelConfig,
      {
        maxRetries: options.maxRetries ?? RECORDER_UI_DESCRIBER_DEFAULT_RETRIES,
        retryDelayMs:
          options.retryDelayMs ?? RECORDER_UI_DESCRIBER_DEFAULT_RETRY_DELAY_MS,
      },
    );
    return {
      usedFallback: false,
      event: {
        ...event,
        semantic: semanticFields,
        screenshotWithBox: screenshotWithBox || event.screenshotWithBox,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      usedFallback: true,
      error: message,
      event: createFallbackEvent(
        event,
        message,
        screenshotWithBox,
        input.target,
      ),
    };
  }
}

export async function describeRecorderUIEvents(
  inputs: DescribeRecorderUIEventInput[],
  modelConfig: IModelConfig,
  options: DescribeRecorderUIEventOptions = {},
): Promise<DescribeRecorderUIEventResult[]> {
  const concurrency = Math.max(
    1,
    options.concurrency ?? RECORDER_UI_DESCRIBER_DEFAULT_CONCURRENCY,
  );
  const results: DescribeRecorderUIEventResult[] = new Array(inputs.length);
  let cursor = 0;

  async function worker() {
    while (cursor < inputs.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await describeRecorderUIEvent(
        inputs[index],
        modelConfig,
        options,
      );
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, inputs.length) }, () =>
      worker(),
    ),
  );
  return results;
}
