import { createHash } from 'node:crypto';
import type { ScrollGeometry } from '@midscene/core/device';

type Node = {
  type?: unknown;
  isVisible?: unknown;
  name?: unknown;
  rawIdentifier?: unknown;
  rect?: unknown;
  nativeFrame?: unknown;
  children?: unknown;
};
const node = (value: unknown): Node | undefined =>
  value && typeof value === 'object' ? (value as Node) : undefined;
const children = (n: Node): Node[] =>
  Array.isArray(n.children)
    ? n.children.map(node).filter((n): n is Node => !!n)
    : [];
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex').slice(0, 24);
function rect(value: unknown): ScrollGeometry['viewport'] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const r = value as ScrollGeometry['viewport'];
  return [r.x, r.y, r.width, r.height].every(Number.isFinite) &&
    r.width > 0 &&
    r.height > 0
    ? { x: r.x, y: r.y, width: r.width, height: r.height }
    : undefined;
}

// WDA's rect uses CGRectIntegral; nativeFrame preserves fractional origins and
// sizes. A scroll can otherwise appear to resize every child by one point.
function nodeRect(n: Node): ScrollGeometry['viewport'] | undefined {
  if (typeof n.nativeFrame === 'string') {
    const match = n.nativeFrame.match(
      /^\{\{\s*([-+\deE.]+)\s*,\s*([-+\deE.]+)\s*\},\s*\{\s*([-+\deE.]+)\s*,\s*([-+\deE.]+)\s*\}\}$/,
    );
    if (match) {
      const [x, y, width, height] = match.slice(1).map(Number);
      const precise = rect({ x, y, width, height });
      if (precise) return precise;
    }
  }
  return rect(n.rect);
}

/** Ambiguous, nested, and custom-rendered containers deliberately return no native hint. */
export function readScrollGeometry(
  source: unknown,
): ScrollGeometry | undefined {
  const root = node(source);
  if (!root) return undefined;
  const views: { node: Node; path: string }[] = [];
  function visit(n: Node, path: string) {
    if (
      ['ScrollView', 'Table', 'CollectionView'].includes(String(n.type)) &&
      (n.isVisible === true || n.isVisible === 1 || n.isVisible === '1')
    )
      views.push({ node: n, path });
    children(n).forEach((c, i) => visit(c, `${path}.${i}`));
  }
  visit(root, 'root');
  if (views.length !== 1) return undefined;
  const view = views[0];
  const viewport = nodeRect(view.node);
  if (!viewport) return undefined;
  const descendants: { rect: ScrollGeometry['viewport']; id?: string }[] = [];
  function collect(n: Node) {
    for (const c of children(n)) {
      const r = nodeRect(c);
      const identity = c.rawIdentifier || c.name;
      if (r)
        descendants.push({
          rect: r,
          id:
            typeof identity === 'string' && identity
              ? hash(`${c.type}:${identity}`)
              : undefined,
        });
      collect(c);
    }
  }
  collect(view.node);
  const counts = new Map<string, number>();
  for (const c of descendants)
    if (c.id) counts.set(c.id, (counts.get(c.id) || 0) + 1);
  const anchors = Object.fromEntries(
    descendants
      .filter((c) => c.id && counts.get(c.id) === 1)
      .slice(0, 32)
      .map((c) => [c.id!, c.rect]),
  );
  const offscreenDirections = (['left', 'right', 'up', 'down'] as const).filter(
    (d) =>
      descendants.some(({ rect: r }) =>
        d === 'left'
          ? r.x < viewport.x
          : d === 'right'
            ? r.x + r.width > viewport.x + viewport.width
            : d === 'up'
              ? r.y < viewport.y
              : r.y + r.height > viewport.y + viewport.height,
      ),
  );
  if (!descendants.length) return undefined;
  return {
    targetId: hash(
      `${root.name}:${view.path}:${view.node.rawIdentifier || ''}`,
    ),
    viewport,
    anchors,
    offscreenDirections,
  };
}
