import type { ScrollState } from '@midscene/core';

/** Runs in the browser realm. Never sends DOM content to the planner. */
/* istanbul ignore next -- serialized to the browser realm, where Node-side coverage counters do not exist */
export function inspectScrollTarget(
  x: number,
  y: number,
): ScrollState | undefined {
  let hit: Element | null = document.elementFromPoint(x, y);
  while (hit?.shadowRoot) {
    const inner = hit.shadowRoot.elementFromPoint(x, y);
    if (!inner || inner === hit) break;
    hit = inner;
  }
  // Frame contents and canvas widgets need visual observation instead.
  if (!hit || hit.closest('iframe,canvas')) return undefined;
  let target: Element | null = hit;
  while (target && target !== document.scrollingElement) {
    const style = getComputedStyle(target);
    const scrollsX =
      /auto|scroll/.test(style.overflowX) &&
      target.scrollWidth > target.clientWidth;
    const scrollsY =
      /auto|scroll/.test(style.overflowY) &&
      target.scrollHeight > target.clientHeight;
    if (scrollsX || scrollsY) break;
    const root = target.getRootNode();
    target =
      target.parentElement || (root instanceof ShadowRoot ? root.host : null);
  }
  target ||= document.scrollingElement;
  if (!target) return undefined;
  const key = Symbol.for('midscene.scroll-target-identities');
  const scope = window as unknown as Record<
    symbol,
    { prefix: string; next: number; ids: WeakMap<Element, string> }
  >;
  scope[key] ||= {
    prefix: Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) =>
      n.toString(16),
    ).join('-'),
    next: 0,
    ids: new WeakMap(),
  };
  const state = scope[key];
  let id = state.ids.get(target);
  if (!id) {
    id = `${state.prefix}:${++state.next}`;
    state.ids.set(target, id);
  }
  const rect = target.getBoundingClientRect();
  const style = getComputedStyle(target);
  // RTL, vertical writing and reverse flow may scroll toward negative offsets
  // even when starting at zero. Keep identity/progress, but leave ranges unknown.
  const ordinaryRanges =
    style.direction === 'ltr' &&
    style.writingMode === 'horizontal-tb' &&
    !style.flexDirection.endsWith('reverse');
  return {
    targetId: id,
    scrollLeft: target.scrollLeft,
    scrollTop: target.scrollTop,
    ...(ordinaryRanges
      ? {
          maxScrollLeft: Math.max(0, target.scrollWidth - target.clientWidth),
          maxScrollTop: Math.max(0, target.scrollHeight - target.clientHeight),
        }
      : {}),
    rect: {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    },
  };
}
