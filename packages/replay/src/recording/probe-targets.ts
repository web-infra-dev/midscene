/// <reference lib="dom" />
import type { ProbeOptions } from './probe';

/* istanbul ignore next -- browser realm has no host coverage counters */
export function createProbeTargets(
  options: Pick<ProbeOptions, 'budgetMs' | 'secretSelectors'>,
  documentId: string,
) {
  let serial = 0;
  const nodeKeys = new WeakMap<Element, string>();
  const sampleCache = new WeakMap<
    Element,
    { at: number; sample: Record<string, unknown> }
  >();
  // ---------- locators (L1) ----------
  const literal = (value: string) => {
    if (!value.includes("'")) return `'${value}'`;
    if (!value.includes('"')) return `"${value}"`;
    return `concat(${value
      .split("'")
      .map((part) => `'${part}'`)
      .join(`,"'",`)})`;
  };
  const evaluate = (xpath: string) =>
    document.evaluate(
      xpath,
      document,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
    );
  const uniqueFor = (xpath: string, element: Element) => {
    try {
      const result = evaluate(xpath);
      return result.snapshotLength === 1 && result.snapshotItem(0) === element;
    } catch {
      return false;
    }
  };
  const randomId = (value: string) =>
    /[a-f0-9]{8,}|\d{5,}|^[a-z]{1,3}-?[A-Za-z0-9]{6,}$|^(ember|react|radix|mui|headlessui|:r)/i.test(
      value,
    );
  const text = (element: Element) =>
    (
      (element instanceof HTMLElement
        ? element.innerText
        : element.textContent) ?? ''
    )
      .replace(/\s+/g, ' ')
      .trim();
  const tagOf = (element: Element) =>
    `*[local-name()=${literal(element.localName)}]`;
  const interactiveSelector =
    'button,a[href],input,textarea,select,option,label,summary,[role=button],[role=link],[role=checkbox],[role=radio],[role=switch],[role=tab],[role=menuitem],[role=option],[contenteditable=true],[tabindex]';
  const roleOf = (element: Element): string => {
    const role = element.getAttribute('role');
    if (role) {
      if (['menuitem', 'tab'].includes(role)) return 'button';
      if (['listitem', 'row', 'treeitem'].includes(role)) return 'item';
      if (
        [
          'button',
          'link',
          'checkbox',
          'radio',
          'switch',
          'option',
          'textbox',
        ].includes(role)
      )
        return role;
    }
    const tag = element.localName;
    if (tag === 'button' || tag === 'summary') return 'button';
    if (tag === 'a') return 'link';
    if (tag === 'select') return 'select';
    if (tag === 'option') return 'option';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'li' || tag === 'tr') return 'item';
    if (tag === 'img') return 'image';
    if (tag === 'input') {
      const type = (element as HTMLInputElement).type;
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (['button', 'submit', 'reset'].includes(type)) return 'button';
      return 'textbox';
    }
    if ((element as HTMLElement).isContentEditable) return 'textbox';
    return element.children.length ? 'container' : 'text';
  };
  const nameOf = (element: Element): string | undefined => {
    const labelled = element.getAttribute('aria-label');
    if (labelled) return labelled.slice(0, 60);
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement
    ) {
      const label = element.labels?.[0];
      if (label) return text(label).slice(0, 60) || undefined;
      return (
        (element.placeholder || element.name || '').slice(0, 60) || undefined
      );
    }
    const value = text(element);
    return value ? value.slice(0, 60) : undefined;
  };
  const editableOf = (element: Element) =>
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLInputElement &&
      ![
        'checkbox',
        'radio',
        'button',
        'submit',
        'reset',
        'file',
        'range',
        'color',
        'image',
        'hidden',
      ].includes(element.type)) ||
    (element instanceof HTMLElement && element.isContentEditable);
  const checkableOf = (element: Element) =>
    (element instanceof HTMLInputElement &&
      ['checkbox', 'radio'].includes(element.type)) ||
    ['checkbox', 'radio', 'switch'].includes(
      element.getAttribute('role') ?? '',
    );
  const secretOf = (element: Element) => {
    if (
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement
      )
    )
      return false;
    if (element instanceof HTMLInputElement && element.type === 'password')
      return true;
    const auto = element.getAttribute('autocomplete') ?? '';
    if (
      /current-password|new-password|one-time-code|cc-number|cc-csc/.test(auto)
    )
      return true;
    if (element.closest('[data-midscene-secret]')) return true;
    return options.secretSelectors.some((selector) => {
      try {
        return element.matches(selector);
      } catch {
        return false;
      }
    });
  };
  const structural = (element: Element): string | undefined => {
    const parts: string[] = [];
    let current: Element | null = element;
    while (current && parts.length < 40) {
      let index = 1;
      for (
        let sibling = current.previousElementSibling;
        sibling;
        sibling = sibling.previousElementSibling
      )
        if (sibling.localName === current.localName) index++;
      parts.unshift(`${tagOf(current)}[${index}]`);
      current = current.parentElement;
    }
    return current ? undefined : `/${parts.join('/')}`;
  };
  const rowSelector = 'li,tr,[role=row],[role=listitem],article';
  const anchorOf = (element: Element): string | undefined => {
    const row =
      element.parentElement?.closest(rowSelector) ??
      element.parentElement?.closest('[data-testid]');
    if (!row || row === element) return undefined;
    const testid = row.getAttribute('data-testid');
    const byTestid =
      testid && !randomId(testid)
        ? `//*[@data-testid=${literal(testid)}]`
        : undefined;
    // Repeated rows often share one test id; their visible label tells them apart.
    const byLabel = () => {
      const label = row.querySelector(
        'label,[role=heading],h1,h2,h3,h4,strong',
      );
      const value = label ? text(label) : '';
      if (!value || value.length > 80) return undefined;
      return `//${tagOf(row)}[.//${tagOf(label!)}[normalize-space(.)=${literal(value)}]]`;
    };
    const base = byTestid && uniqueFor(byTestid, row) ? byTestid : byLabel();
    if (!base || !uniqueFor(base, row)) return undefined;
    const type = element.getAttribute('type');
    const candidate = `${base}//${tagOf(element)}${type ? `[@type=${literal(type)}]` : ''}`;
    return uniqueFor(candidate, element) ? candidate : undefined;
  };
  const locatorsFor = (element: Element, deadline: number) => {
    const out: Array<Record<string, unknown>> = [];
    const add = (
      value: string | undefined,
      tier: string,
      textDependent = false,
    ) => {
      if (!value || out.length >= 4 || out.some((item) => item.value === value))
        return;
      if (uniqueFor(value, element))
        out.push({
          kind: 'web.xpath',
          value,
          tier,
          ...(textDependent ? { textDependent: true } : {}),
        });
    };
    const tag = tagOf(element);
    for (const name of ['data-testid', 'data-test', 'data-qa', 'data-cy']) {
      const value = element.getAttribute(name);
      if (value && value.length <= 120)
        add(`//${tag}[@${name}=${literal(value)}]`, 'testid');
    }
    if (performance.now() < deadline) {
      const id = element.id;
      if (id && !randomId(id) && id.length <= 120)
        add(`//${tag}[@id=${literal(id)}]`, 'semantic');
      const name = element.getAttribute('name');
      if (name && name.length <= 120)
        add(`//${tag}[@name=${literal(name)}]`, 'semantic');
      const aria = element.getAttribute('aria-label');
      if (aria && aria.length <= 120)
        add(`//${tag}[@aria-label=${literal(aria)}]`, 'semantic', true);
      const placeholder = element.getAttribute('placeholder');
      if (placeholder && placeholder.length <= 120)
        add(`//${tag}[@placeholder=${literal(placeholder)}]`, 'semantic', true);
    }
    if (performance.now() < deadline && out.length < 3)
      add(anchorOf(element), 'anchored', true);
    if (
      performance.now() < deadline &&
      out.length < 3 &&
      (['button', 'a', 'label', 'option', 'summary', 'li', 'td'].includes(
        element.localName,
      ) ||
        !element.children.length)
    ) {
      const value = text(element);
      if (value && value.length <= 80)
        add(`//${tag}[normalize-space(.)=${literal(value)}]`, 'text', true);
    }
    if (out.length < 4) add(structural(element), 'structural');
    return { locators: out, partial: performance.now() >= deadline };
  };
  const keyOf = (element: Element) => {
    let key = nodeKeys.get(element);
    if (!key) {
      key = `${documentId}-n${++serial}`;
      nodeKeys.set(element, key);
    }
    return key;
  };
  /** Prefer the interactive ancestor of the hit element as the target. */
  const receiverOf = (element: Element | null): Element | null => {
    if (!element) return null;
    const interactive = element.closest(interactiveSelector);
    return interactive ?? element;
  };
  const sampleTarget = (
    element: Element | null,
  ): Record<string, unknown> | undefined => {
    if (!element) return undefined;
    if (element.getRootNode() !== document)
      return {
        key: keyOf(element),
        locators: [],
        fingerprint: { role: 'unknown' },
        rect: rectOf(element),
        visualOnly: 'shadow-dom',
      };
    if (
      ['iframe', 'frame', 'canvas', 'embed', 'object'].includes(
        element.localName,
      )
    )
      return {
        key: keyOf(element),
        locators: [],
        fingerprint: { role: 'unknown' },
        rect: rectOf(element),
        visualOnly: element.localName,
      };
    const cached = sampleCache.get(element);
    // Same element sampled again within a second: reuse locators, refresh the rect only.
    if (cached && performance.now() - cached.at < 1000)
      return { ...cached.sample, rect: rectOf(element) };
    const deadline = performance.now() + options.budgetMs;
    const { locators, partial } = locatorsFor(element, deadline);
    const tag = element.localName;
    const platform: Record<string, string> = { tag };
    if (element instanceof HTMLInputElement) platform.type = element.type;
    const sample = {
      key: keyOf(element),
      locators,
      fingerprint: {
        role: roleOf(element),
        ...(nameOf(element) ? { name: nameOf(element) } : {}),
        platform,
        size: [
          Math.round(
            (element.getBoundingClientRect().width / innerWidth) * 1000,
          ) / 1000,
          Math.round(
            (element.getBoundingClientRect().height / innerHeight) * 1000,
          ) / 1000,
        ],
      },
      rect: rectOf(element),
      ...(editableOf(element) ? { editable: true } : {}),
      ...(checkableOf(element) ? { checkable: true } : {}),
      ...(secretOf(element) ? { secret: true } : {}),
      ...(partial ? { partial: true } : {}),
    };
    sampleCache.set(element, { at: performance.now(), sample });
    return sample;
  };
  const rectOf = (element: Element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  };
  // ---------- state (L2) ----------
  const fieldValue = (element: Element) =>
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
      ? element.value
      : (element as HTMLElement).isContentEditable
        ? (element.textContent ?? '')
        : undefined;
  const stateOf = (element: Element | null): Record<string, unknown> => {
    const active =
      document.activeElement && document.activeElement !== document.body
        ? document.activeElement
        : null;
    const state: Record<string, unknown> = { screen: location.href };
    if (active) state.focusKey = keyOf(active);
    if (!element) return state;
    state.focused = active === element;
    if (editableOf(element) || element instanceof HTMLSelectElement) {
      const value = fieldValue(element);
      // Secret values never enter the trace; the host stores a placeholder.
      if (value !== undefined) {
        if (secretOf(element)) {
          state.secret = true;
        } else state.value = value.slice(0, 16384);
      }
    }
    if (
      element instanceof HTMLInputElement &&
      ['checkbox', 'radio'].includes(element.type)
    )
      state.checked = element.checked;
    else if (element.hasAttribute('aria-checked'))
      state.checked = element.getAttribute('aria-checked') === 'true';
    return state;
  };

  return {
    rowSelector,
    nameOf,
    locatorsFor,
    keyOf,
    receiverOf,
    sampleTarget,
    rectOf,
    editableOf,
    checkableOf,
    secretOf,
    fieldValue,
    stateOf,
  };
}
