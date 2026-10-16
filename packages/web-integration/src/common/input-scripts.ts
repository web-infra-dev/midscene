/**
 * Select editable content in the focused field, or in the editable element
 * under a click point.
 *
 * Keep these as source text instead of closures: Playwright, Puppeteer, and
 * the Chrome extension execute them in a browser realm where Node-side
 * coverage counters and module bindings do not exist.
 *
 * The no-point boolean script preserves the previous focused-element behavior
 * for the Chrome extension. Point-aware selection never issues a page-level
 * select-all; callers decide whether a confirmed editable focus may use CDP.
 */

export type EditableSelectPoint = {
  x: number;
  y: number;
};

export type EditableSelectStatus = {
  selected: boolean;
  editableFocused: boolean;
};

const LEGACY_FOCUSED_SELECT_SCRIPT = `(() => {
  let activeElement = document.activeElement;
  while (activeElement?.shadowRoot?.activeElement) {
    activeElement = activeElement.shadowRoot.activeElement;
  }

  if (
    activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement
  ) {
    try {
      activeElement.select();
      return true;
    } catch {
      return false;
    }
  }

  if (activeElement instanceof HTMLElement && activeElement.isContentEditable) {
    const selection = window.getSelection();
    if (!selection) return false;
    const range = document.createRange();
    range.selectNodeContents(activeElement);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  return false;
})()`;

function serializePoint(point?: EditableSelectPoint | null): string {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return 'null';
  }

  return JSON.stringify({ x: point.x, y: point.y });
}

function buildEditableSelectScript(
  pointLiteral: string,
  reportStatus: boolean,
): string {
  return `(() => {
  const point = ${pointLiteral};
  const reportStatus = ${reportStatus ? 'true' : 'false'};
  if (!reportStatus && !point) {
    return ${LEGACY_FOCUSED_SELECT_SCRIPT};
  }

  function deepActiveElement() {
    let activeElement = document.activeElement;
    while (activeElement?.shadowRoot?.activeElement) {
      activeElement = activeElement.shadowRoot.activeElement;
    }
    return activeElement;
  }

  function contentEditableHost(element) {
    if (!(element instanceof HTMLElement) || !element.isContentEditable) {
      return null;
    }
    let host = element;
    let current = element;
    while (current instanceof HTMLElement && current.isContentEditable) {
      host = current;
      const parent = current.parentElement;
      if (parent instanceof HTMLElement && parent.isContentEditable) {
        current = parent;
        continue;
      }
      const root = current.getRootNode();
      if (
        root instanceof ShadowRoot &&
        root.host instanceof HTMLElement &&
        root.host.isContentEditable
      ) {
        current = root.host;
        continue;
      }
      break;
    }
    return host;
  }

  function editableTarget(element) {
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement
    ) {
      if (element.disabled) return null;
      if (
        element instanceof HTMLInputElement &&
        String(element.type || '').toLowerCase() === 'hidden'
      ) {
        return null;
      }
      return element;
    }
    return contentEditableHost(element);
  }

  function rectContains(element, x, y) {
    if (!(element instanceof Element)) return false;
    const rect = element.getBoundingClientRect();
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom
    );
  }

  function focusElement(element) {
    if (deepActiveElement() === element) return true;
    try {
      element.focus({ preventScroll: true });
      return true;
    } catch (error) {
      try {
        element.focus();
        return true;
      } catch (focusError) {
        return false;
      }
    }
  }

  function selectTarget(element) {
    const target = editableTarget(element);
    if (!target || !focusElement(target)) return false;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement
    ) {
      try {
        target.select();
      } catch (error) {
        return false;
      }
      if (
        typeof target.selectionStart === 'number' &&
        typeof target.selectionEnd === 'number'
      ) {
        return (
          target.selectionStart === 0 &&
          target.selectionEnd === target.value.length
        );
      }
      return deepActiveElement() === target;
    }
    const selection = window.getSelection();
    if (!selection) return false;
    try {
      const range = document.createRange();
      range.selectNodeContents(target);
      selection.removeAllRanges();
      selection.addRange(range);
      return selection.rangeCount > 0;
    } catch (error) {
      return false;
    }
  }

  function rememberEditable(candidate, x, y, state) {
    const target = editableTarget(candidate);
    if (!target || !rectContains(target, x, y)) return;
    const rect = target.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area < state.area) {
      state.best = target;
      state.area = area;
    }
  }

  function visitScope(scope, x, y, state, seen) {
    if (!scope || typeof scope.querySelectorAll !== 'function' || seen.has(scope)) {
      return;
    }
    seen.add(scope);
    const nodes = scope.querySelectorAll('input, textarea, [contenteditable]');
    for (const node of nodes) {
      rememberEditable(node, x, y, state);
      if (node.shadowRoot) visitScope(node.shadowRoot, x, y, state, seen);
    }
  }

  function collectHitElements(root, x, y, out, seen) {
    if (!root || typeof root.elementsFromPoint !== 'function') return;
    let elements = [];
    try {
      elements = root.elementsFromPoint(x, y);
    } catch (error) {
      return;
    }
    for (const element of elements) {
      if (!(element instanceof Element) || seen.has(element)) continue;
      seen.add(element);
      out.push(element);
      if (element.shadowRoot) {
        collectHitElements(element.shadowRoot, x, y, out, seen);
      }
    }
  }

  function findEditableAtPoint(x, y) {
    const stack = [];
    const seen = new Set();
    collectHitElements(document, x, y, stack, seen);
    let pierced = document.elementFromPoint(x, y);
    const piercedSeen = new Set();
    while (pierced instanceof Element && !piercedSeen.has(pierced)) {
      piercedSeen.add(pierced);
      if (!seen.has(pierced)) {
        seen.add(pierced);
        stack.push(pierced);
      }
      if (!pierced.shadowRoot || typeof pierced.shadowRoot.elementFromPoint !== 'function') {
        break;
      }
      const inner = pierced.shadowRoot.elementFromPoint(x, y);
      if (!inner || inner === pierced) break;
      pierced = inner;
    }
    for (const element of stack) {
      const target = editableTarget(element);
      if (target && rectContains(target, x, y)) return target;
    }
    const top = stack[0] || null;
    if (!(top instanceof Element)) return null;
    const state = { best: null, area: Infinity };
    const scopes = new Set();
    visitScope(top, x, y, state, scopes);
    if (top.shadowRoot) visitScope(top.shadowRoot, x, y, state, scopes);
    return state.best;
  }

  function confirmedEditableFocus() {
    const target = editableTarget(deepActiveElement());
    if (!target) return false;
    if (!point) return true;
    return rectContains(target, point.x, point.y);
  }

  let selected = false;
  const activeTarget = editableTarget(deepActiveElement());
  if (
    activeTarget &&
    (!point || rectContains(activeTarget, point.x, point.y))
  ) {
    selected = selectTarget(activeTarget);
  }
  if (!selected && point) {
    const found = findEditableAtPoint(point.x, point.y);
    if (found) selected = selectTarget(found);
  }
  if (!reportStatus) return !!selected;
  return {
    selected: !!selected,
    editableFocused: confirmedEditableFocus(),
  };
})()`;
}

/**
 * Select the focused input, textarea, or contenteditable element.
 * Returns false when focus is not an editable field. No click point is
 * available here, so this must not search the page or select page text.
 */
export const selectAllInputScript = buildEditableSelectScript('null', false);

export function buildEditableSelectStatusScript(
  point?: EditableSelectPoint | null,
): string {
  return buildEditableSelectScript(serializePoint(point), true);
}
