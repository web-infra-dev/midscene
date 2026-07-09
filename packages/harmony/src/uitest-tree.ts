import type { UiNode } from '@midscene/core/device-cache';

/**
 * Shape of a single node in `uitest dumpLayout` output. The exact attribute
 * set varies by HarmonyOS version and component library, so we treat
 * `attributes` as a free-form string map and look up known fields lazily.
 */
interface UiTestNode {
  attributes?: Record<string, unknown>;
  children?: UiTestNode[];
}

const BOUNDS_RE = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/;

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNonEmptyString(value: unknown): string | undefined {
  const str = asString(value)?.trim();
  return str ? str : undefined;
}

function parseBounds(raw: unknown, scale: number): UiNode['bounds'] {
  const safeScale = scale > 0 ? scale : 1;
  if (typeof raw === 'string') {
    const match = BOUNDS_RE.exec(raw);
    if (match) {
      const x1 = Number.parseInt(match[1], 10);
      const y1 = Number.parseInt(match[2], 10);
      const x2 = Number.parseInt(match[3], 10);
      const y2 = Number.parseInt(match[4], 10);
      return {
        left: x1 / safeScale,
        top: y1 / safeScale,
        width: Math.max(0, x2 - x1) / safeScale,
        height: Math.max(0, y2 - y1) / safeScale,
      };
    }
  }
  if (raw && typeof raw === 'object') {
    // some uitest versions emit a structured rect instead of the bracket form
    const r = raw as Record<string, unknown>;
    const left = Number(r.left ?? r.x ?? 0);
    const top = Number(r.top ?? r.y ?? 0);
    const right = Number(r.right ?? Number(r.x ?? 0) + Number(r.width ?? 0));
    const bottom = Number(r.bottom ?? Number(r.y ?? 0) + Number(r.height ?? 0));
    if ([left, top, right, bottom].every(Number.isFinite)) {
      return {
        left: left / safeScale,
        top: top / safeScale,
        width: Math.max(0, right - left) / safeScale,
        height: Math.max(0, bottom - top) / safeScale,
      };
    }
  }
  return { left: 0, top: 0, width: 0, height: 0 };
}

function toUiNode(node: UiTestNode, scale: number): UiNode {
  const attributes = node.attributes ?? {};
  const attrs: Record<string, string> = {};
  for (const [k, v] of Object.entries(attributes)) {
    if (k === 'bounds' || k === 'rect') continue;
    if (typeof v === 'string') attrs[k] = v;
    else if (typeof v === 'number' || typeof v === 'boolean')
      attrs[k] = String(v);
  }
  const type =
    asNonEmptyString(attributes.type) ??
    asNonEmptyString(attributes.componentType) ??
    asNonEmptyString(attributes.tag) ??
    'unknown';
  const bounds = parseBounds(attributes.bounds ?? attributes.rect, scale);
  const children = Array.isArray(node.children)
    ? node.children.map((c) => toUiNode(c, scale))
    : [];
  return { type, attrs, bounds, children };
}

/**
 * Convert a `uitest dumpLayout` JSON payload into the platform-neutral UiNode
 * tree consumed by `@midscene/core/device-cache`.
 *
 * `scale` defaults to 1: HarmonyDevice currently treats screenshots and
 * coordinates in the same physical-pixel space, so no scale conversion is
 * needed. Pass a non-1 value if a future device wrapper exposes a real
 * device-pixel ratio (logical = physical / scale).
 */
export function uitestJsonToUiNode(json: string, scale = 1): UiNode {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(`uitestJsonToUiNode: invalid JSON: ${error}`);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('uitestJsonToUiNode: payload is not an object');
  }
  return toUiNode(parsed as UiTestNode, scale);
}
