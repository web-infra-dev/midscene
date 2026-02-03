import { getDebug } from '@midscene/shared/logger';
import type { ADB } from 'appium-adb';

const debug = getDebug('android:ui-hierarchy');

/** Temp file path on device for uiautomator dump output */
const DUMP_PATH = '/sdcard/midscene_dump.xml';

/**
 * Get short class name from full Android class name
 * e.g. "android.widget.Button" → "Button"
 */
function shortClassName(className: string): string {
  return className.split('.').pop() || className;
}

/**
 * Extract attribute value from an XML tag string
 */
function extractAttr(tag: string, attrName: string): string {
  const regex = new RegExp(`${attrName}="([^"]*)"`, '');
  const match = tag.match(regex);
  return match ? match[1] : '';
}

/**
 * Dump the raw UIAutomator XML from the device.
 */
export async function dumpAccessibilityTreeXml(
  adb: ADB,
): Promise<string> {
  debug('dumping accessibility tree via uiautomator');

  const dumpCmd = `uiautomator dump ${DUMP_PATH}`;
  const dumpResult = await adb.shell(dumpCmd);
  debug('uiautomator dump result:', dumpResult);

  const xml = await adb.shell(`cat ${DUMP_PATH}`);

  // Clean up (non-blocking)
  adb.shell(`rm ${DUMP_PATH}`).catch(() => {
    // ignore cleanup errors
  });

  return xml || '';
}

// =====================================================
// Formatting pipeline: parse → collapse → format
// Produces clean XML without bounds for AI context
// =====================================================

/**
 * Lightweight node for the formatting pipeline.
 * Only carries semantic attributes — no bounds/rect.
 */
interface FormatNode {
  className: string;
  text: string;
  resourceId: string;
  contentDesc: string;
  clickable: boolean;
  selected: boolean;
  checked: boolean;
  scrollable: boolean;
  children: FormatNode[];
}

/** Max characters for text/content-desc in formatted output to limit token usage */
const MAX_TEXT_LENGTH = 200;

function createEmptyFormatNode(): FormatNode {
  return {
    className: '',
    text: '',
    resourceId: '',
    contentDesc: '',
    clickable: false,
    selected: false,
    checked: false,
    scrollable: false,
    children: [],
  };
}

/**
 * Parse UIAutomator XML into a lightweight tree for formatting.
 * Does not retain bounds/rect — only semantic attributes.
 */
function parseXmlToFormatTree(xml: string): FormatNode {
  const root = createEmptyFormatNode();
  const stack: FormatNode[] = [root];

  // Match: <node .../>  (self-closing, capture group 1)
  //        <node ...>   (opening, capture group 2)
  //        </node>      (closing, no capture)
  const tagRegex = /<node\s+([^>]*?)\/\s*>|<node\s+([^>]*?)>|<\/node>/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(xml)) !== null) {
    const fullMatch = match[0];

    if (fullMatch.startsWith('</node')) {
      if (stack.length > 1) stack.pop();
      continue;
    }

    const attrString = match[1] || match[2] || '';
    const isSelfClosing = !!match[1];

    const text = extractAttr(attrString, 'text');
    const resourceId = extractAttr(attrString, 'resource-id');
    const className = extractAttr(attrString, 'class');
    const contentDesc = extractAttr(attrString, 'content-desc');
    const clickable = extractAttr(attrString, 'clickable') === 'true';
    const selected = extractAttr(attrString, 'selected') === 'true';
    const checked = extractAttr(attrString, 'checked') === 'true';
    const scrollable = extractAttr(attrString, 'scrollable') === 'true';

    // Leaf filter: skip self-closing nodes that carry no semantic info
    // (no visible text, no accessibility description, not interactive)
    if (isSelfClosing && !text && !contentDesc && !clickable && !scrollable) {
      continue;
    }

    const node: FormatNode = {
      className: shortClassName(className),
      text,
      resourceId,
      contentDesc,
      clickable,
      selected,
      checked,
      scrollable,
      children: [],
    };

    const parent = stack[stack.length - 1];
    parent.children.push(node);

    if (!isSelfClosing) {
      stack.push(node);
    }
  }

  return root;
}

/**
 * Determine if a node is a pure wrapper that should be collapsed.
 * Retention signals: text, content-desc, clickable, scrollable.
 * Containers with resource-id are kept only if they group ≥2 children
 * (providing meaningful structure), otherwise collapsed as pass-through.
 */
function shouldCollapseNode(node: FormatNode): boolean {
  if (node.text) return false;
  if (node.contentDesc) return false;
  if (node.clickable) return false;
  if (node.scrollable) return false;
  if (node.resourceId && node.children.length >= 2) return false;
  return true;
}

/**
 * Collapse pure wrapper containers by promoting their children to the parent.
 */
function collapseWrappers(node: FormatNode): void {
  node.children = node.children.flatMap((child) => {
    collapseWrappers(child);
    if (shouldCollapseNode(child)) {
      return child.children;
    }
    return [child];
  });
}

function escapeXmlAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

/**
 * Format a single node to XML. Uses className as the tag name
 * (e.g. <TextView>, <Button>) to reduce output size.
 */
function formatNodeToXml(node: FormatNode, indent: number): string {
  const indentStr = '  '.repeat(indent);
  const tag = escapeXmlAttr(node.className) || 'node';
  const attrs: string[] = [];

  if (node.text)
    attrs.push(
      `text="${escapeXmlAttr(truncateText(node.text, MAX_TEXT_LENGTH))}"`,
    );
  if (node.resourceId)
    attrs.push(`resource-id="${escapeXmlAttr(node.resourceId)}"`);
  if (node.contentDesc)
    attrs.push(
      `content-desc="${escapeXmlAttr(truncateText(node.contentDesc, MAX_TEXT_LENGTH))}"`,
    );
  if (node.clickable) attrs.push('clickable="true"');
  if (node.selected) attrs.push('selected="true"');
  if (node.checked) attrs.push('checked="true"');
  if (node.scrollable) attrs.push('scrollable="true"');

  const attrStr = attrs.length > 0 ? ` ${attrs.join(' ')}` : '';

  if (node.children.length === 0) {
    return `${indentStr}<${tag}${attrStr} />`;
  }

  const childrenStr = node.children
    .map((child) => formatNodeToXml(child, indent + 1))
    .join('\n');

  return `${indentStr}<${tag}${attrStr}>\n${childrenStr}\n${indentStr}</${tag}>`;
}

/** Format the full tree to XML string, skipping the virtual root node */
function formatTreeToXml(root: FormatNode): string {
  if (root.children.length === 0) return '';
  return root.children
    .map((child) => formatNodeToXml(child, 0))
    .join('\n');
}

/**
 * Dump the Android accessibility tree, parse, collapse wrappers,
 * and format as clean XML without bounds for AI planning context.
 */
export async function dumpAndFormatAccessibilityTree(
  adb: ADB,
): Promise<string> {
  const xml = await dumpAccessibilityTreeXml(adb);
  // A valid UIAutomator XML has at least a <hierarchy> tag (~11 chars).
  // Skip obviously invalid/empty output from failed dumps.
  if (xml.length < 10) {
    debug('uiautomator dump returned empty or too short XML');
    return '';
  }

  debug(`formatting uiautomator XML (${xml.length} chars)`);
  const root = parseXmlToFormatTree(xml);
  collapseWrappers(root);
  const result = formatTreeToXml(root);
  debug(`formatted accessibility tree (${result.length} chars)`);
  return result;
}

export {
  parseXmlToFormatTree,
  collapseWrappers,
  formatTreeToXml,
  type FormatNode,
};
