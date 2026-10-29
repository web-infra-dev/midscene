/** Return the open shadow root containing a node, including text nodes. */
export function getContainingShadowRoot(node: Node): ShadowRoot | null {
  const root = node.getRootNode?.();
  return root && 'host' in root ? (root as ShadowRoot) : null;
}

/** Walk the rendered ancestry across slots and shadow boundaries. */
export function getComposedParent(node: Node): Node | null {
  if ('assignedSlot' in node && node.assignedSlot) {
    return node.assignedSlot as HTMLSlotElement;
  }
  return node.parentNode || getContainingShadowRoot(node)?.host || null;
}

export function composedContains(ancestor: Node, node: Node): boolean {
  for (
    let current: Node | null = node;
    current;
    current = getComposedParent(current)
  ) {
    if (current === ancestor) return true;
  }
  return false;
}

/** Resolve the deepest accessible hit, or reject an unresolved shadow host. */
export function deepestElementAtPoint(
  element: Element,
  left: number,
  top: number,
): Element | null {
  const visited = new Set<Element>();
  while (element.shadowRoot) {
    if (visited.has(element)) return null;
    visited.add(element);
    const inner = element.shadowRoot.elementFromPoint(left, top);
    if (!inner || inner === element) return null;
    element = inner;
  }
  return element;
}

/** A finite running animation can invalidate a cached rectangle before input. */
export function hasRunningFiniteAnimation(node: Node): boolean {
  for (
    let current: Node | null = node;
    current;
    current = getComposedParent(current)
  ) {
    if (current.nodeType !== 1 || !('getAnimations' in current)) continue;
    for (const animation of (current as Element).getAnimations()) {
      const endTime = animation.effect?.getComputedTiming().endTime;
      if (
        animation.playState === 'running' &&
        typeof endTime === 'number' &&
        Number.isFinite(endTime)
      )
        return true;
    }
  }
  return false;
}
