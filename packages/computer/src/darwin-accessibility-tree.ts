import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { UiNode } from '@midscene/core/device-cache';
import {
  type AccessibilityDumpNode,
  accessibilityJsonToUiNode,
  accessibilityNodeToUiNode,
} from './accessibility-tree';

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

export interface DarwinAccessibilityTreeOptions {
  /**
   * macOS AX bounds are in global desktop coordinates. When Midscene is scoped
   * to a selected display, subtract that display origin so cache coordinates
   * stay in the same display-local space as screenshots and locate results.
   */
  displayOffset?: PointOffset;
}

export function darwinAccessibilityNodeToUiNode(
  node: AccessibilityDumpNode,
  options: DarwinAccessibilityTreeOptions = {},
): UiNode {
  return accessibilityNodeToUiNode(node, {
    defaultType: 'AXElement',
    displayOffset: options.displayOffset,
    errorPrefix: 'darwinAccessibilityNodeToUiNode',
  });
}

export function darwinAccessibilityJsonToUiNode(
  json: string,
  options: DarwinAccessibilityTreeOptions = {},
): UiNode {
  return accessibilityJsonToUiNode(json, {
    defaultType: 'AXElement',
    displayOffset: options.displayOffset,
    errorPrefix: 'darwinAccessibilityJsonToUiNode',
  });
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
