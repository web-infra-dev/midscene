/**
 * Select all editable content in the currently focused element.
 *
 * Keep this as source text instead of a closure: both Playwright/Puppeteer and
 * the Chrome extension execute it in a browser realm where Node-side coverage
 * counters and module bindings do not exist.
 */
export const selectAllInputScript = `(() => {
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
