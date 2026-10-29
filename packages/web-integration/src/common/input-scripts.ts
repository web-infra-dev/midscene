/**
 * Select all editable content in the currently focused element.
 *
 * Keep this as source text instead of a closure: both Playwright/Puppeteer and
 * the Chrome extension execute it in a browser realm where Node-side coverage
 * counters and module bindings do not exist.
 */
export const focusedInputFrameScript = `(() => {
  let element = document.activeElement;
  while (element?.shadowRoot?.activeElement) {
    element = element.shadowRoot.activeElement;
  }
  return element instanceof HTMLIFrameElement || element instanceof HTMLFrameElement
    ? element
    : null;
})()`;

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

export type DateTimeInputResult = { handled: boolean; error?: string };

export const focusedDateTimeInputScript = `(() => {
  let element = document.activeElement;
  while (element?.shadowRoot?.activeElement) {
    element = element.shadowRoot.activeElement;
  }
  return element instanceof HTMLInputElement &&
    ['date', 'datetime-local', 'time', 'month', 'week'].includes(element.type)
      ? element : null;
})()`;

/** Native date/time controls do not accept CDP insertText as ordinary text. */
export const fillDateTimeInputScript = (
  value: string,
  target?: [number, number],
) => `(() => {
  const element = ${focusedDateTimeInputScript};
  if (!element) return { handled: false };
  const target = ${JSON.stringify(target ?? null)};
  const rect = element.getBoundingClientRect();
  if (target && (target[0] < rect.left || target[0] > rect.right ||
      target[1] < rect.top || target[1] > rect.bottom)) {
    return { handled: true, error: 'Native date/time input target did not receive focus' };
  }
  if (element.matches(':disabled') || element.readOnly ||
      !element.getClientRects().length || getComputedStyle(element).visibility === 'hidden') {
    return { handled: true, error: 'Native date/time input is not editable' };
  }

  // Let the browser validate and normalize the format before touching the field.
  // Do not enforce min/max/step: Input may intentionally test invalid form values.
  const probe = document.createElement('input');
  probe.type = element.type;
  probe.value = ${JSON.stringify(value)};
  if (!probe.value) {
    return { handled: true, error: 'Invalid value for native ' + element.type + ' input' };
  }
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(element, probe.value);
  element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  return { handled: true };
})()`;
