/**
 * Minimal XML parser tailored to the shapes Midscene's mobile adapters need:
 *   - WebDriverAgent `/source` (iOS XCUIElement tree)
 *   - `uiautomator dump` (Android view hierarchy)
 *
 * Both produce well-formed XML that consists only of element nodes with
 * attributes (no mixed text content, no CDATA, no namespaces, no DTDs beyond
 * the `<?xml ?>` prolog and an optional doctype). This parser deliberately
 * does NOT try to be a general-purpose XML implementation; anything outside
 * the supported subset throws or is ignored to keep the surface small.
 *
 * The parser is regex-driven over a single linear pass — O(n) on the input
 * length and zero npm dependencies.
 */
export interface XmlElement {
  /** Element tag name as it appeared in the source (case preserved). */
  name: string;
  attrs: Record<string, string>;
  children: XmlElement[];
}

const TAG_RE = /<(\/?)([A-Za-z_][A-Za-z0-9_.\-:]*)([^>]*?)(\/?)>/g;
const ATTR_RE = /([A-Za-z_][A-Za-z0-9_.\-:]*)\s*=\s*("([^"]*)"|'([^']*)')/g;

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
  const out: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex iteration
  while ((m = ATTR_RE.exec(raw))) {
    const name = m[1];
    const rawValue = m[3] ?? m[4] ?? '';
    out[name] = decodeEntities(rawValue);
  }
  return out;
}

/**
 * Strip XML prolog (`<?xml ?>`), DOCTYPE declarations and comments. We do this
 * up-front so the main tag scanner does not need to know about them.
 */
function stripNonElement(input: string): string {
  return input
    .replace(/<\?xml[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * Parse an XML document into a single root element. Throws on:
 *   - empty input
 *   - more than one top-level element
 *   - unbalanced open/close tags
 *
 * Whitespace-only text between tags is skipped silently. Any other text
 * content is also skipped (these payloads do not carry meaningful text).
 */
export function parseXml(input: string): XmlElement {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new Error('parseXml: input is empty');
  }

  const cleaned = stripNonElement(input);
  TAG_RE.lastIndex = 0;

  const stack: XmlElement[] = [];
  let root: XmlElement | undefined;
  let m: RegExpExecArray | null;

  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex iteration
  while ((m = TAG_RE.exec(cleaned))) {
    const isClose = m[1] === '/';
    const name = m[2];
    const rawAttrs = m[3] ?? '';
    const isSelfClosing = m[4] === '/';

    if (isClose) {
      const top = stack.pop();
      if (!top || top.name !== name) {
        throw new Error(
          `parseXml: unbalanced close tag </${name}> (expected </${top?.name ?? '<empty>'}>)`,
        );
      }
      continue;
    }

    const element: XmlElement = {
      name,
      attrs: parseAttrs(rawAttrs),
      children: [],
    };

    const parent = stack[stack.length - 1];
    if (parent) {
      parent.children.push(element);
    } else if (root) {
      throw new Error('parseXml: more than one top-level element');
    } else {
      root = element;
    }

    if (!isSelfClosing) {
      stack.push(element);
    }
  }

  if (stack.length !== 0) {
    throw new Error(
      `parseXml: unclosed tag(s): ${stack.map((e) => e.name).join(', ')}`,
    );
  }
  if (!root) {
    throw new Error('parseXml: no root element found');
  }
  return root;
}
