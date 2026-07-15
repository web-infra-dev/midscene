import type { UiNode } from '@midscene/core/internal/device-cache';

export interface AccessibilityPointOffset {
  x: number;
  y: number;
}

export interface AccessibilityTreeOptions {
  defaultType: string;
  displayOffset?: AccessibilityPointOffset;
  errorPrefix?: string;
}

export interface AccessibilityDumpNode {
  type?: unknown;
  attrs?: unknown;
  bounds?: unknown;
  position?: unknown;
  size?: unknown;
  children?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function toAttrValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return undefined;
}

function sanitizeType(type: unknown, defaultType: string): string {
  const value = toAttrValue(type)?.trim();
  if (value && /^[A-Za-z_*][A-Za-z0-9_.\-:*]*$/.test(value)) {
    return value;
  }
  return defaultType;
}

function parsePair(value: unknown): [number, number] | undefined {
  if (Array.isArray(value) && value.length >= 2) {
    return [toNumber(value[0]), toNumber(value[1])];
  }
  if (isRecord(value)) {
    if ('x' in value || 'y' in value) {
      return [toNumber(value.x), toNumber(value.y)];
    }
    if ('width' in value || 'height' in value) {
      return [toNumber(value.width), toNumber(value.height)];
    }
  }
  return undefined;
}

function parseRawBounds(node: AccessibilityDumpNode): UiNode['bounds'] {
  if (isRecord(node.bounds)) {
    return {
      left: toNumber(node.bounds.left),
      top: toNumber(node.bounds.top),
      width: toNumber(node.bounds.width),
      height: toNumber(node.bounds.height),
    };
  }

  const position = parsePair(node.position) ?? [0, 0];
  const size = parsePair(node.size) ?? [0, 0];
  return {
    left: position[0],
    top: position[1],
    width: size[0],
    height: size[1],
  };
}

function normalizeBounds(
  bounds: UiNode['bounds'],
  displayOffset: AccessibilityPointOffset | undefined,
): UiNode['bounds'] {
  const offset = displayOffset ?? { x: 0, y: 0 };
  return {
    left: bounds.left - offset.x,
    top: bounds.top - offset.y,
    width: bounds.width,
    height: bounds.height,
  };
}

function hasUsableBounds(bounds: UiNode['bounds']): boolean {
  return bounds.width > 0 && bounds.height > 0;
}

function unionChildrenBounds(children: UiNode[]): UiNode['bounds'] | undefined {
  const visible = children.filter((child) => hasUsableBounds(child.bounds));
  if (visible.length === 0) return undefined;

  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const child of visible) {
    left = Math.min(left, child.bounds.left);
    top = Math.min(top, child.bounds.top);
    right = Math.max(right, child.bounds.left + child.bounds.width);
    bottom = Math.max(bottom, child.bounds.top + child.bounds.height);
  }

  return {
    left,
    top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

function attrsToRecord(attrs: unknown): UiNode['attrs'] {
  if (!isRecord(attrs)) return {};

  const output: UiNode['attrs'] = {};
  for (const [key, value] of Object.entries(attrs)) {
    output[key] = toAttrValue(value);
  }
  return output;
}

export function accessibilityNodeToUiNode(
  node: AccessibilityDumpNode,
  options: AccessibilityTreeOptions,
): UiNode {
  const errorPrefix = options.errorPrefix ?? 'accessibilityNodeToUiNode';
  if (!isRecord(node)) {
    throw new Error(`${errorPrefix}: node is not an object`);
  }

  const children = Array.isArray(node.children)
    ? node.children
        .filter(isRecord)
        .map((child) =>
          accessibilityNodeToUiNode(child as AccessibilityDumpNode, options),
        )
    : [];

  const rawBounds = normalizeBounds(
    parseRawBounds(node),
    options.displayOffset,
  );
  const bounds = hasUsableBounds(rawBounds)
    ? rawBounds
    : (unionChildrenBounds(children) ?? rawBounds);

  return {
    type: sanitizeType(node.type, options.defaultType),
    attrs: attrsToRecord(node.attrs),
    bounds,
    children,
  };
}

export function accessibilityJsonToUiNode(
  json: string,
  options: AccessibilityTreeOptions,
): UiNode {
  const errorPrefix = options.errorPrefix ?? 'accessibilityJsonToUiNode';
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(`${errorPrefix}: invalid JSON: ${error}`);
  }
  if (!isRecord(parsed)) {
    throw new Error(`${errorPrefix}: payload is not an object`);
  }
  return accessibilityNodeToUiNode(parsed as AccessibilityDumpNode, options);
}
