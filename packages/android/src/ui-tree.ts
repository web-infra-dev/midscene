import type { UITreeSnapshot, UiNode } from '@midscene/core';

export const ANDROID_UI_TREE_XPATH_POLICY: UITreeSnapshot['xpathPolicy'] = {
  stableAttrs: ['resource-id'],
  textAttrs: ['content-desc', 'text'],
  excludedTargetTypes: [
    'android.widget.GridView',
    'android.widget.ListView',
    'android.widget.ScrollView',
    'android.widget.HorizontalScrollView',
    'android.widget.RecyclerView',
    'android.support.v7.widget.RecyclerView',
    'androidx.recyclerview.widget.RecyclerView',
    'android.support.v4.view.ViewPager',
    'androidx.viewpager.widget.ViewPager',
    'androidx.viewpager2.widget.ViewPager2',
    'android.webkit.WebView',
  ],
  max: 3,
};

interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlElement[];
}

const TAG_RE = /<(\/?)([A-Za-z_][A-Za-z0-9_.\-:]*)([^>]*?)(\/?)>/g;
const ATTR_RE = /([A-Za-z_][A-Za-z0-9_.\-:]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
const BOUNDS_RE = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/;
const ENTITY_TABLE: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeEntities(value: string): string {
  if (!value.includes('&')) return value;
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (full, body) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : full;
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : full;
    }
    return ENTITY_TABLE[body] ?? full;
  });
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex iteration
  while ((match = ATTR_RE.exec(raw))) {
    attrs[match[1]] = decodeEntities(match[3] ?? match[4] ?? '');
  }
  return attrs;
}

function parseXml(input: string): XmlElement {
  if (input.trim().length === 0) {
    throw new Error('parseAndroidUITreeXml: input is empty');
  }
  const cleaned = input
    .replace(/<\?xml[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  TAG_RE.lastIndex = 0;

  const stack: XmlElement[] = [];
  let root: XmlElement | undefined;
  let match: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex iteration
  while ((match = TAG_RE.exec(cleaned))) {
    const isClose = match[1] === '/';
    const name = match[2];
    if (isClose) {
      const current = stack.pop();
      if (!current || current.name !== name) {
        throw new Error(
          `parseAndroidUITreeXml: unbalanced close tag </${name}>`,
        );
      }
      continue;
    }

    const element: XmlElement = {
      name,
      attrs: parseAttrs(match[3] ?? ''),
      children: [],
    };
    const parent = stack[stack.length - 1];
    if (parent) {
      parent.children.push(element);
    } else if (root) {
      throw new Error('parseAndroidUITreeXml: more than one top-level element');
    } else {
      root = element;
    }
    if (match[4] !== '/') stack.push(element);
  }

  if (stack.length > 0) {
    throw new Error('parseAndroidUITreeXml: unclosed element');
  }
  if (!root) {
    throw new Error('parseAndroidUITreeXml: no root element');
  }
  return root;
}

function parseBounds(
  raw: string | undefined,
  devicePixelRatio: number,
): UiNode['bounds'] {
  const match = raw ? BOUNDS_RE.exec(raw) : undefined;
  if (!match) return { left: 0, top: 0, width: 0, height: 0 };
  const left = Number.parseInt(match[1], 10);
  const top = Number.parseInt(match[2], 10);
  const right = Number.parseInt(match[3], 10);
  const bottom = Number.parseInt(match[4], 10);
  const ratio = devicePixelRatio > 0 ? devicePixelRatio : 1;
  return {
    left: left / ratio,
    top: top / ratio,
    width: Math.max(0, right - left) / ratio,
    height: Math.max(0, bottom - top) / ratio,
  };
}

function toUiNode(element: XmlElement, devicePixelRatio: number): UiNode {
  const attrs: Record<string, string> = {};
  for (const [name, value] of Object.entries(element.attrs)) {
    if (name !== 'bounds') attrs[name] = value;
  }
  return {
    type: element.attrs.class || element.name,
    attrs,
    bounds: parseBounds(element.attrs.bounds, devicePixelRatio),
    children: element.children.map((child) =>
      toUiNode(child, devicePixelRatio),
    ),
  };
}

export function uiautomatorXmlToUiNode(
  xml: string,
  devicePixelRatio: number,
): UiNode {
  const root = parseXml(xml);
  if (root.name === 'hierarchy' && root.children.length === 1) {
    return toUiNode(root.children[0], devicePixelRatio);
  }
  return toUiNode(root, devicePixelRatio);
}
