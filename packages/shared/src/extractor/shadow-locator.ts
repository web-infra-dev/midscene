// Encode the complete shadow segment so XPath text and iframe separators cannot
// collide with its grammar. Ordinary XPath strings keep their existing meaning.
export const shadowLocatorPrefix = 'midscene-shadow-v1:';

type Match = { kind: 'text'; value: string } | { kind: 'index'; value: number };
interface ShadowStep {
  tag: string;
  namespace: string | null;
  match: Match;
}
interface ShadowLocator {
  host: string;
  steps: ShadowStep[];
  text: string | null;
}

const normalizeText = (text: string) => text.replace(/\s+/g, ' ').trim();

/** Serialize a root-local element or text target and the locator of its host. */
export function buildShadowLocator(
  node: Node,
  root: ShadowRoot,
  host: string,
  orderSensitive: boolean,
  leaf: boolean,
): string {
  const textNode = node.nodeType === 3;
  const element = textNode ? node.parentElement : (node as Element);
  if (!element) throw new Error('Cannot cache a detached shadow text node');
  const steps: ShadowStep[] = [];
  for (
    let current: Element | null = element;
    current;
    current = current.parentElement
  ) {
    const parent = current.parentNode;
    if (!parent) throw new Error('Cannot cache a detached shadow element');
    const tag = current.localName;
    const namespace = current.namespaceURI;
    const siblings = Array.from(parent.children).filter(
      (sibling) =>
        sibling.localName === tag && sibling.namespaceURI === namespace,
    );
    const text = normalizeText(current.textContent || '');
    steps.unshift({
      tag,
      namespace,
      match:
        !orderSensitive && (leaf || textNode) && current === element && text
          ? { kind: 'text', value: text }
          : { kind: 'index', value: siblings.indexOf(current) },
    });
    if (parent === root) {
      const locator: ShadowLocator = {
        host,
        steps,
        text: textNode ? normalizeText(node.textContent || '') : null,
      };
      return shadowLocatorPrefix + encodeURIComponent(JSON.stringify(locator));
    }
  }
  throw new Error('Shadow target does not belong to the supplied root');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isShadowStep(value: unknown): value is ShadowStep {
  if (
    !isRecord(value) ||
    typeof value.tag !== 'string' ||
    !value.tag ||
    !(value.namespace === null || typeof value.namespace === 'string') ||
    !isRecord(value.match)
  )
    return false;
  const match = value.match;
  return (
    (match.kind === 'text' && typeof match.value === 'string') ||
    (match.kind === 'index' &&
      typeof match.value === 'number' &&
      Number.isInteger(match.value) &&
      match.value >= 0)
  );
}

function parseShadowLocator(encoded: string): ShadowLocator {
  let value: unknown;
  try {
    value = JSON.parse(
      decodeURIComponent(encoded.slice(shadowLocatorPrefix.length)),
    );
  } catch (cause) {
    throw new Error('Invalid encoded shadow locator', { cause });
  }
  if (
    !isRecord(value) ||
    typeof value.host !== 'string' ||
    !value.host ||
    !Array.isArray(value.steps) ||
    !value.steps.length ||
    !value.steps.every(isShadowStep) ||
    !(value.text === null || typeof value.text === 'string')
  ) {
    throw new Error(
      'Invalid shadow locator: expected host, steps and text target',
    );
  }
  return { host: value.host, steps: value.steps, text: value.text };
}

/** Resolve each step uniquely; missing/ambiguous targets are normal cache misses. */
export function resolveShadowLocator(
  encoded: string,
  resolveHost: (path: string) => Node | null,
): Node | null {
  const locator = parseShadowLocator(encoded);
  const host = resolveHost(locator.host);
  if (!host || !('shadowRoot' in host) || !host.shadowRoot) return null;
  let parent: ShadowRoot | Element = host.shadowRoot as ShadowRoot;
  for (const step of locator.steps) {
    let candidates: Element[] = Array.from(parent.children).filter(
      (child) =>
        child.localName === step.tag && child.namespaceURI === step.namespace,
    );
    const match = step.match;
    candidates =
      match.kind === 'text'
        ? candidates.filter(
            (child) => normalizeText(child.textContent || '') === match.value,
          )
        : candidates.slice(match.value, match.value + 1);
    if (candidates.length !== 1) return null;
    parent = candidates[0];
  }
  if (locator.text === null) return parent;
  const texts = Array.from(parent.childNodes).filter(
    (child) =>
      child.nodeType === 3 &&
      normalizeText(child.textContent || '') === locator.text,
  );
  return texts.length === 1 ? texts[0] : null;
}
