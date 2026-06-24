import type { AiActProgressAction, ExecutionTask } from '@/types';

/**
 * Structured extraction helpers for aiAct progress notifications.
 *
 * This module turns a raw {@link ExecutionTask} into the structured
 * {@link AiActProgressAction} carried by progress events. It deliberately does
 * NOT build human-readable strings, truncate text for display, or format
 * coordinates into log lines - that is the consumer's job. Everything here is a
 * data transform that yields plain numbers/objects.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Keep params from bloating the progress payload without rendering them: this
// only bounds the size of the structured value, it never formats it.
const maxCompactStringLength = 180;

function compactProgressValue(value: unknown): unknown {
  if (value === undefined || value === null) {
    return value;
  }

  if (typeof value === 'string') {
    return value.length > maxCompactStringLength
      ? `${value.slice(0, maxCompactStringLength - 3)}...`
      : value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 5).map(compactProgressValue);
  }

  if (isRecord(value) && typeof value.prompt === 'string') {
    return compactProgressValue(value.prompt);
  }

  if (!isRecord(value)) {
    return String(value);
  }

  const entries = Object.entries(value).slice(0, 6);
  return Object.fromEntries(
    entries.map(([key, entryValue]) => [key, compactProgressValue(entryValue)]),
  );
}

function summarizeParam(param: unknown): unknown {
  if (!param || typeof param !== 'object') {
    return compactProgressValue(param);
  }

  const record = param as Record<string, unknown>;
  if (typeof record.prompt === 'string') {
    return compactProgressValue(record.prompt);
  }
  if (
    record.locate &&
    typeof record.locate === 'object' &&
    record.locate !== null
  ) {
    const locate = record.locate as Record<string, unknown>;
    return {
      locate: compactProgressValue(locate.prompt),
      ...Object.fromEntries(
        Object.entries(record)
          .filter(([key]) => key !== 'locate')
          .slice(0, 4)
          .map(([key, value]) => [key, compactProgressValue(value)]),
      ),
    };
  }

  return compactProgressValue(record);
}

export function errorMessageForAiAct(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function numberFromUnknown(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function bboxArrayFromProperty(
  value: Record<string, unknown>,
  key: string,
): [number, number, number, number] | undefined {
  const bbox = value[key];
  if (!Array.isArray(bbox) || bbox.length < 4) {
    return undefined;
  }

  const left = numberFromUnknown(bbox[0]);
  const top = numberFromUnknown(bbox[1]);
  const right = numberFromUnknown(bbox[2]);
  const bottom = numberFromUnknown(bbox[3]);
  if (
    left === undefined ||
    top === undefined ||
    right === undefined ||
    bottom === undefined
  ) {
    return undefined;
  }

  return [left, top, right, bottom];
}

function centerPointFromBbox(
  bbox: readonly [number, number, number, number],
): [number, number] {
  return [
    Math.floor((bbox[0] + bbox[2]) / 2),
    Math.floor((bbox[1] + bbox[3]) / 2),
  ];
}

function pointFromLocateLike(
  value: Record<string, unknown>,
): [number, number] | undefined {
  const center = value.center;
  if (Array.isArray(center) && center.length >= 2) {
    const x = numberFromUnknown(center[0]);
    const y = numberFromUnknown(center[1]);
    if (x !== undefined && y !== undefined) {
      return [x, y];
    }
  }

  const point = value.point;
  if (Array.isArray(point) && point.length >= 2) {
    const x = numberFromUnknown(point[0]);
    const y = numberFromUnknown(point[1]);
    if (x !== undefined && y !== undefined) {
      return [x, y];
    }
  }

  const locatedPixelBbox = bboxArrayFromProperty(value, 'locatedPixelBbox');
  if (locatedPixelBbox) {
    return centerPointFromBbox(locatedPixelBbox);
  }

  const bbox = bboxArrayFromProperty(value, 'bbox');
  if (bbox) {
    return centerPointFromBbox(bbox);
  }

  return undefined;
}

function bboxFromLocateLike(
  value: Record<string, unknown>,
): [number, number, number, number] | undefined {
  const locatedPixelBbox = bboxArrayFromProperty(value, 'locatedPixelBbox');
  if (locatedPixelBbox) {
    return locatedPixelBbox;
  }

  const bbox = bboxArrayFromProperty(value, 'bbox');
  if (bbox) {
    return bbox;
  }

  if (!isRecord(value.rect)) {
    return undefined;
  }

  const left = numberFromUnknown(value.rect.left);
  const top = numberFromUnknown(value.rect.top);
  const width = numberFromUnknown(value.rect.width);
  const height = numberFromUnknown(value.rect.height);
  if (
    left === undefined ||
    top === undefined ||
    width === undefined ||
    height === undefined
  ) {
    return undefined;
  }

  return [left, top, left + width, top + height];
}

function targetTextFromLocateLike(value: Record<string, unknown>): string {
  if (typeof value.description === 'string') {
    return value.description;
  }
  if (typeof value.prompt === 'string') {
    return value.prompt;
  }
  return '';
}

function isLocateLike(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false;
  }

  return (
    'center' in value ||
    'rect' in value ||
    'point' in value ||
    'bbox' in value ||
    'prompt' in value ||
    'description' in value
  );
}

const locatorParamKeys = ['locate', 'from', 'to', 'start', 'end'];

function firstLocateLikeParam(
  param: unknown,
): Record<string, unknown> | undefined {
  if (!isRecord(param)) {
    return undefined;
  }

  for (const key of locatorParamKeys) {
    const value = param[key];
    if (isLocateLike(value)) {
      return value;
    }
  }

  return Object.values(param).find(isLocateLike);
}

function hasUnresolvedLocateLikeParam(param: unknown): boolean {
  if (!isRecord(param)) {
    return false;
  }

  return Object.entries(param).some(([key, value]) => {
    if (locatorParamKeys.includes(key) && typeof value === 'string') {
      return true;
    }

    return (
      isLocateLike(value) &&
      !pointFromLocateLike(value) &&
      !bboxFromLocateLike(value)
    );
  });
}

/**
 * Extract the structured action descriptor for an Action Space task, or
 * `undefined` when the task is not a reportable action yet (e.g. a locate param
 * that has not been resolved to coordinates). Returns plain data only.
 */
export function extractProgressAction(
  task: ExecutionTask,
): AiActProgressAction | undefined {
  if (
    task.type !== 'Action Space' ||
    task.subType === 'Finished' ||
    task.subType === 'Error'
  ) {
    return undefined;
  }

  const name =
    typeof task.subType === 'string' && task.subType.length > 0
      ? task.subType
      : 'Action';

  const locate = firstLocateLikeParam(task.param);
  if (locate) {
    const point = pointFromLocateLike(locate);
    if (point) {
      const bbox = bboxFromLocateLike(locate);
      const target = targetTextFromLocateLike(locate);
      return {
        name,
        ...(target ? { target } : {}),
        point,
        ...(bbox ? { bbox } : {}),
      };
    }
  }

  // A locate-like param that has not resolved to a point/bbox is not reportable
  // yet; skip it so the consumer never renders a half-resolved action.
  if (hasUnresolvedLocateLikeParam(task.param)) {
    return undefined;
  }

  const param = summarizeParam(task.param);
  return {
    name,
    ...(param !== undefined && param !== '' ? { param } : {}),
  };
}
