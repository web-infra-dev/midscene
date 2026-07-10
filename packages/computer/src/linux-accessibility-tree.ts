import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { UiNode } from '@midscene/core/device-cache';
import {
  type AccessibilityPointOffset,
  accessibilityJsonToUiNode,
} from './accessibility-tree';

const LINUX_ACCESSIBILITY_TIMEOUT_MS = 10_000;
const LINUX_ACCESSIBILITY_MAX_BUFFER = 16 * 1024 * 1024;
const execFileAsync = promisify(execFile);

export interface LinuxAccessibilityTreeOptions {
  displayOffset?: AccessibilityPointOffset;
}

export const LINUX_ACCESSIBILITY_TREE_SCRIPT = String.raw`
import json
import math
import re
import sys

try:
    import gi
    gi.require_version('Atspi', '2.0')
    from gi.repository import Atspi
except Exception as error:
    raise RuntimeError(
        'Python GI and the Atspi 2.0 typelib are required. '
        'On Debian/Ubuntu install python3-gi gir1.2-atspi-2.0.'
    ) from error

MAX_DEPTH = 5
MAX_NODES = 300
MAX_CHILDREN = 80
ACTIVITY_SCAN_DEPTH = 6
ACTIVITY_SCAN_NODES = 500
node_count = 0


def safe(call, default=None):
    try:
        return call()
    except Exception:
        return default


def child_nodes(node, limit=MAX_CHILDREN):
    count = safe(lambda: int(node.get_child_count()), 0)
    children = []
    for index in range(min(max(count, 0), limit)):
        child = safe(lambda index=index: node.get_child_at_index(index))
        if child is not None:
            children.append(child)
    return children


def has_state(node, state):
    state_set = safe(lambda: node.get_state_set())
    return bool(state_set and safe(lambda: state_set.contains(state), False))


def activity_score(application):
    score = 0
    scanned = 0
    stack = [(application, 0)]
    while stack and scanned < ACTIVITY_SCAN_NODES:
        node, depth = stack.pop()
        scanned += 1
        if has_state(node, Atspi.StateType.ACTIVE):
            score = max(score, 2)
        if has_state(node, Atspi.StateType.FOCUSED):
            score = max(score, 3)
        if depth < ACTIVITY_SCAN_DEPTH:
            stack.extend((child, depth + 1) for child in child_nodes(node))
    return score


def finite_number(value):
    try:
        number = float(value)
        return number if math.isfinite(number) else 0
    except Exception:
        return 0


def bounds_for(node):
    component = safe(lambda: node.get_component_iface())
    if component is None:
        return {'left': 0, 'top': 0, 'width': 0, 'height': 0}
    rect = safe(lambda: component.get_extents(Atspi.CoordType.SCREEN))
    if rect is None:
        return {'left': 0, 'top': 0, 'width': 0, 'height': 0}
    return {
        'left': finite_number(rect.x),
        'top': finite_number(rect.y),
        'width': max(0, finite_number(rect.width)),
        'height': max(0, finite_number(rect.height)),
    }


def has_visible_bounds(application):
    scanned = 0
    stack = [(application, 0)]
    while stack and scanned < ACTIVITY_SCAN_NODES:
        node, depth = stack.pop()
        scanned += 1
        bounds = bounds_for(node)
        if bounds['width'] > 0 and bounds['height'] > 0:
            return True
        if depth < ACTIVITY_SCAN_DEPTH:
            stack.extend((child, depth + 1) for child in child_nodes(node))
    return False


def select_application(desktop):
    applications = [
        app for app in child_nodes(desktop)
        if not has_state(app, Atspi.StateType.DEFUNCT)
    ]
    if not applications:
        raise RuntimeError(
            'AT-SPI returned no applications. Ensure the accessibility bus '
            'is running and the target application exposes accessibility data.'
        )

    scored = [(activity_score(app), app) for app in applications]
    best_score = max(score for score, _app in scored)
    if best_score > 0:
        best = [app for score, app in scored if score == best_score]
        if len(best) == 1:
            return best[0]
        raise RuntimeError('AT-SPI reported multiple active or focused applications.')

    visible = [app for app in applications if has_visible_bounds(app)]
    if len(visible) == 1:
        return visible[0]
    raise RuntimeError(
        'Unable to determine the active AT-SPI application. Focus one target '
        'application before using element location cache.'
    )


def role_type(node):
    role = safe(lambda: node.get_role_name(), '') or ''
    words = re.findall(r'[A-Za-z0-9]+', str(role))
    suffix = ''.join(word[:1].upper() + word[1:] for word in words)
    return 'ATSPI' + (suffix or 'Element')


def add_attr(attrs, name, value):
    if value is None:
        return
    text = str(value)
    if text:
        attrs[name] = text


def attributes_for(node):
    attrs = {}
    accessible_id_fn = getattr(node, 'get_accessible_id', None)
    if callable(accessible_id_fn):
        add_attr(attrs, 'AccessibleId', safe(accessible_id_fn))
    add_attr(attrs, 'Name', safe(lambda: node.get_name()))
    add_attr(attrs, 'Description', safe(lambda: node.get_description()))

    help_text_fn = getattr(node, 'get_help_text', None)
    if callable(help_text_fn):
        add_attr(attrs, 'HelpText', safe(help_text_fn))

    raw_attrs = safe(lambda: node.get_attributes(), {}) or {}
    if hasattr(raw_attrs, 'items'):
        normalized = {str(key).lower(): value for key, value in raw_attrs.items()}
        for name in ('id', 'automation-id', 'placeholder-text'):
            add_attr(attrs, name, normalized.get(name))
        if 'HelpText' not in attrs:
            add_attr(
                attrs,
                'HelpText',
                normalized.get('help-text') or normalized.get('tool-tip-text'),
            )
    return attrs


def convert_node(node, depth):
    global node_count
    node_count += 1

    children = []
    if depth < MAX_DEPTH and node_count < MAX_NODES:
        for child in child_nodes(node):
            if node_count >= MAX_NODES:
                break
            children.append(convert_node(child, depth + 1))

    return {
        'type': role_type(node),
        'attrs': attributes_for(node),
        'bounds': bounds_for(node),
        'children': children,
    }


Atspi.init()
desktop = Atspi.get_desktop(0)
if desktop is None:
    raise RuntimeError('AT-SPI virtual desktop 0 is unavailable.')
application = select_application(desktop)
json.dump(convert_node(application, 0), sys.stdout, separators=(',', ':'))
`;

export function linuxAccessibilityJsonToUiNode(
  json: string,
  options: LinuxAccessibilityTreeOptions = {},
): UiNode {
  return accessibilityJsonToUiNode(json, {
    defaultType: 'ATSPIElement',
    displayOffset: options.displayOffset,
    errorPrefix: 'linuxAccessibilityJsonToUiNode',
  });
}

function subprocessErrorMessage(error: unknown): string {
  if (typeof error !== 'object' || error === null) return String(error);
  const details = error as { message?: unknown; stderr?: unknown };
  const stderr =
    typeof details.stderr === 'string'
      ? details.stderr.trim()
      : Buffer.isBuffer(details.stderr)
        ? details.stderr.toString('utf8').trim()
        : '';
  const message =
    typeof details.message === 'string' ? details.message : String(error);
  return stderr || message;
}

export async function readLinuxAccessibilityTree(
  options: LinuxAccessibilityTreeOptions = {},
): Promise<UiNode> {
  if (process.platform !== 'linux') {
    throw new Error('readLinuxAccessibilityTree is only supported on Linux');
  }

  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(
      'python3',
      ['-c', LINUX_ACCESSIBILITY_TREE_SCRIPT],
      {
        encoding: 'utf8',
        timeout: LINUX_ACCESSIBILITY_TIMEOUT_MS,
        maxBuffer: LINUX_ACCESSIBILITY_MAX_BUFFER,
      },
    ));
  } catch (error) {
    throw new Error(
      `Failed to read Linux AT-SPI accessibility tree: ${subprocessErrorMessage(error)}`,
    );
  }

  if (!stdout.trim()) {
    throw new Error(
      'Failed to read Linux AT-SPI accessibility tree: python3 returned no accessibility data',
    );
  }
  return linuxAccessibilityJsonToUiNode(stdout, options);
}
