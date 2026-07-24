import {
  type UiNode,
  type XmlElement,
  parseXml,
} from '@midscene/core/internal/device-cache';

const BOUNDS_RE = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/;

/**
 * `uiautomator dump` emits bounds in **physical pixels**, formatted as
 * "[x1,y1][x2,y2]". Midscene's cache pipeline operates in logical pixels
 * (same space as the AI's locate result), so divide by the device pixel
 * ratio when materializing UiNode bounds.
 */
function parseBounds(raw: string | undefined, dpr: number): UiNode['bounds'] {
  if (!raw) return { left: 0, top: 0, width: 0, height: 0 };
  const match = BOUNDS_RE.exec(raw);
  if (!match) return { left: 0, top: 0, width: 0, height: 0 };
  const x1 = Number.parseInt(match[1], 10);
  const y1 = Number.parseInt(match[2], 10);
  const x2 = Number.parseInt(match[3], 10);
  const y2 = Number.parseInt(match[4], 10);
  const safeDpr = dpr > 0 ? dpr : 1;
  return {
    left: x1 / safeDpr,
    top: y1 / safeDpr,
    width: Math.max(0, x2 - x1) / safeDpr,
    height: Math.max(0, y2 - y1) / safeDpr,
  };
}

function toUiNode(element: XmlElement, dpr: number): UiNode {
  // The semantic "type" for an Android view is its `class` attribute
  // (e.g. android.widget.Button) — the XML tag is always "node".
  const attrs: Record<string, string> = {};
  for (const [k, v] of Object.entries(element.attrs)) {
    if (k === 'bounds') continue;
    attrs[k] = v;
  }
  const type = element.attrs.class || element.name;
  return {
    type,
    attrs,
    bounds: parseBounds(element.attrs.bounds, dpr),
    children: element.children.map((c) => toUiNode(c, dpr)),
  };
}

/**
 * Convert a `uiautomator dump` XML payload into the platform-neutral `UiNode`
 * tree. `dpr` (device pixel ratio) is required because uiautomator emits
 * physical pixels and the rest of Midscene operates in logical pixels.
 *
 * The root `<hierarchy>` element is unwrapped — most real trees have a single
 * top-level `<node>` child which becomes our UiNode root. If `<hierarchy>`
 * has multiple children (multi-window scenarios), we keep `<hierarchy>` as
 * the synthetic root so all top-level windows are reachable.
 */
export function uiautomatorXmlToUiNode(xml: string, dpr: number): UiNode {
  const root = parseXml(xml);
  if (root.name === 'hierarchy' && root.children.length === 1) {
    return toUiNode(root.children[0], dpr);
  }
  return toUiNode(root, dpr);
}
