import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { UiNode } from '@midscene/core/device-cache';

const MAX_OSASCRIPT_BUFFER = 16 * 1024 * 1024;
const DARWIN_ACCESSIBILITY_TIMEOUT_MS = 10000;
const execFileAsync = promisify(execFile);

const DARWIN_ACCESSIBILITY_TREE_SCRIPT = String.raw`
function run() {
  const systemEvents = Application('System Events');
  const processes = systemEvents.applicationProcesses.whose({ frontmost: true })();
  if (!processes.length) {
    throw new Error('No frontmost application process');
  }

  const MAX_DEPTH = 5;
  const MAX_NODES = 300;
  const MAX_CHILDREN = 80;
  let nodeCount = 0;

  function safe(fn) {
    try {
      return fn();
    } catch (error) {
      return undefined;
    }
  }

  function normalize(value) {
    if (value === null || value === undefined) return undefined;
    if (Array.isArray(value)) return value.map(normalize);
    if (typeof value === 'object') {
      try {
        return String(value);
      } catch (error) {
        return undefined;
      }
    }
    return value;
  }

  function scalar(value) {
    const normalized = normalize(value);
    if (normalized === undefined || Array.isArray(normalized)) return undefined;
    return String(normalized);
  }

  function pair(value) {
    const normalized = normalize(value);
    if (!Array.isArray(normalized) || normalized.length < 2) return undefined;
    return [
      Number(normalized[0]) || 0,
      Number(normalized[1]) || 0,
    ];
  }

  function attr(element, name) {
    return safe(function () {
      return element.attributes.byName(name).value();
    });
  }

  function pushAttr(attrs, name, value) {
    const text = scalar(value);
    if (text !== undefined && text !== '') attrs[name] = text;
  }

  function windowsFor(element) {
    const value = safe(function () {
      return element.windows();
    });
    return Array.isArray(value) ? value : [];
  }

  function uiElementsFor(element) {
    const value = safe(function () {
      return element.uiElements();
    });
    return Array.isArray(value) ? value : [];
  }

  function childrenFor(element, role) {
    const windows = windowsFor(element);
    if (role === 'AXApplication' && windows.length > 0) {
      return windows.slice(0, MAX_CHILDREN);
    }
    return uiElementsFor(element).filter(function (child) {
      return scalar(safe(function () { return child.role(); })) !== 'AXMenuBar';
    }).slice(0, MAX_CHILDREN);
  }

  function nodeFor(element, depth) {
    nodeCount += 1;

    const attrs = {};
    const role =
      scalar(safe(function () { return element.role(); })) ||
      scalar(attr(element, 'AXRole')) ||
      'AXElement';

    pushAttr(attrs, 'AXRole', role);
    // Attribute value reads through System Events are expensive. Keep the
    // payload focused on selector-worthy fields so cache lookup cannot stall
    // standard AppKit apps such as Calculator.
    pushAttr(attrs, 'AXRoleDescription', attr(element, 'AXRoleDescription'));
    pushAttr(attrs, 'AXIdentifier', attr(element, 'AXIdentifier'));
    pushAttr(attrs, 'AXName', safe(function () { return element.name(); }));
    pushAttr(attrs, 'AXDescription', safe(function () { return element.description(); }));
    pushAttr(attrs, 'AXValue', safe(function () { return element.value(); }));

    const position =
      pair(safe(function () { return element.position(); })) ||
      pair(attr(element, 'AXPosition')) ||
      [0, 0];
    const size =
      pair(safe(function () { return element.size(); })) ||
      pair(attr(element, 'AXSize')) ||
      [0, 0];

    const children = [];
    if (depth < MAX_DEPTH && nodeCount < MAX_NODES) {
      const rawChildren = childrenFor(element, role);
      for (let i = 0; i < rawChildren.length && nodeCount < MAX_NODES; i++) {
        children.push(nodeFor(rawChildren[i], depth + 1));
      }
    }

    return {
      type: role,
      attrs,
      bounds: {
        left: position[0],
        top: position[1],
        width: size[0],
        height: size[1],
      },
      children,
    };
  }

  return JSON.stringify(nodeFor(processes[0], 0));
}
`;

interface PointOffset {
  x: number;
  y: number;
}

interface DarwinAccessibilityDumpNode {
  type?: unknown;
  attrs?: unknown;
  bounds?: unknown;
  position?: unknown;
  size?: unknown;
  children?: unknown;
}

export interface DarwinAccessibilityTreeOptions {
  /**
   * macOS AX bounds are in global desktop coordinates. When Midscene is scoped
   * to a selected display, subtract that display origin so cache coordinates
   * stay in the same display-local space as screenshots and locate results.
   */
  displayOffset?: PointOffset;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toAttrValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return undefined;
}

function sanitizeType(type: unknown): string {
  const value = toAttrValue(type)?.trim();
  if (value && /^[A-Za-z_*][A-Za-z0-9_.\-:*]*$/.test(value)) {
    return value;
  }
  return 'AXElement';
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

function parseRawBounds(node: DarwinAccessibilityDumpNode): UiNode['bounds'] {
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
  options: DarwinAccessibilityTreeOptions,
): UiNode['bounds'] {
  const displayOffset = options.displayOffset ?? { x: 0, y: 0 };
  return {
    left: bounds.left - displayOffset.x,
    top: bounds.top - displayOffset.y,
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

  const out: UiNode['attrs'] = {};
  for (const [key, value] of Object.entries(attrs)) {
    out[key] = toAttrValue(value);
  }
  return out;
}

export function darwinAccessibilityNodeToUiNode(
  node: DarwinAccessibilityDumpNode,
  options: DarwinAccessibilityTreeOptions = {},
): UiNode {
  if (!isRecord(node)) {
    throw new Error('darwinAccessibilityNodeToUiNode: node is not an object');
  }

  const children = Array.isArray(node.children)
    ? node.children
        .filter(isRecord)
        .map((child) =>
          darwinAccessibilityNodeToUiNode(
            child as DarwinAccessibilityDumpNode,
            options,
          ),
        )
    : [];

  const rawBounds = normalizeBounds(parseRawBounds(node), options);
  const bounds = hasUsableBounds(rawBounds)
    ? rawBounds
    : (unionChildrenBounds(children) ?? rawBounds);

  return {
    type: sanitizeType(node.type),
    attrs: attrsToRecord(node.attrs),
    bounds,
    children,
  };
}

export function darwinAccessibilityJsonToUiNode(
  json: string,
  options: DarwinAccessibilityTreeOptions = {},
): UiNode {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(`darwinAccessibilityJsonToUiNode: invalid JSON: ${error}`);
  }
  if (!isRecord(parsed)) {
    throw new Error(
      'darwinAccessibilityJsonToUiNode: payload is not an object',
    );
  }
  return darwinAccessibilityNodeToUiNode(
    parsed as DarwinAccessibilityDumpNode,
    options,
  );
}

export async function readDarwinAccessibilityTree(
  options: DarwinAccessibilityTreeOptions = {},
): Promise<UiNode> {
  if (process.platform !== 'darwin') {
    throw new Error('readDarwinAccessibilityTree is only supported on macOS');
  }

  const { stdout } = await execFileAsync(
    'osascript',
    ['-l', 'JavaScript', '-e', DARWIN_ACCESSIBILITY_TREE_SCRIPT],
    {
      encoding: 'utf8',
      maxBuffer: MAX_OSASCRIPT_BUFFER,
      timeout: DARWIN_ACCESSIBILITY_TIMEOUT_MS,
    },
  );
  return darwinAccessibilityJsonToUiNode(stdout, options);
}
