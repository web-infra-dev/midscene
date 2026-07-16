import {
  type UiNode,
  type XmlElement,
  parseXml,
} from '@midscene/core/internal/device-cache';

/**
 * Attribute names on a WDA `/source` XML element that hold its on-screen
 * bounding box. Values are integers in **point space** (logical coordinates),
 * which is the same coordinate space the rest of Midscene uses for
 * `cacheFeatureForPoint` / `rectMatchesCacheFeature`. No DPR conversion needed.
 */
const BOUNDS_ATTRS = ['x', 'y', 'width', 'height'] as const;

function parseBounds(attrs: Record<string, string>): UiNode['bounds'] {
  const left = Number.parseFloat(attrs.x ?? '0');
  const top = Number.parseFloat(attrs.y ?? '0');
  const width = Number.parseFloat(attrs.width ?? '0');
  const height = Number.parseFloat(attrs.height ?? '0');
  return {
    left: Number.isFinite(left) ? left : 0,
    top: Number.isFinite(top) ? top : 0,
    width: Number.isFinite(width) ? width : 0,
    height: Number.isFinite(height) ? height : 0,
  };
}

function toUiNode(element: XmlElement): UiNode {
  // Drop bounds attributes from the attrs map so xpath predicates do not
  // accidentally key off geometry (which is screen-state dependent).
  const attrs: Record<string, string> = {};
  for (const [k, v] of Object.entries(element.attrs)) {
    if (!BOUNDS_ATTRS.includes(k as (typeof BOUNDS_ATTRS)[number])) {
      attrs[k] = v;
    }
  }
  // WDA's `name` is the accessibilityIdentifier when one exists, otherwise it
  // may fall back to visible label text. Only promote the unambiguous case to
  // a stable synthetic identity; the raw `name` remains available as semantic
  // text and therefore requires prompt grounding.
  if (
    attrs.name &&
    attrs.label &&
    normalizeAccessibilityText(attrs.name) !==
      normalizeAccessibilityText(attrs.label)
  ) {
    attrs['accessibility-id'] = attrs.name;
  }
  return {
    type: element.name,
    attrs,
    bounds: parseBounds(element.attrs),
    children: element.children.map(toUiNode),
  };
}

function normalizeAccessibilityText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Convert a WebDriverAgent `/source` XML payload into the platform-neutral
 * `UiNode` tree consumed by `@midscene/core/internal/device-cache`. The root is the
 * WDA application element.
 */
export function wdaSourceToUiNode(xml: string): UiNode {
  const root = parseXml(xml);
  return toUiNode(root);
}
