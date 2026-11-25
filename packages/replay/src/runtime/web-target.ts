/// <reference lib="dom" />
import type { Agent } from '@midscene/core';
import { replayError } from './web-page';

export interface Locator {
  xpath: string;
}

/**
 * Business identity of a target. Strict XPath results must satisfy it. With
 * `text` or `attr` it is an identity that can re-find the target without a
 * model; `tag`/`role` alone only constrain an AI-located answer.
 */
export interface TargetGuard {
  tag?: string;
  text?: string;
  attr?: Record<string, string>;
  role?: string;
}

export interface StrictLocate {
  candidates: [Locator, ...Locator[]];
  within?: Locator;
  guard?: TargetGuard;
  /** Maximum readiness wait; returns immediately when ready. Default 5000 ms. */
  timeoutMs?: number;
  /**
   * Opt-in recovery when strict candidates stop identifying the target before
   * dispatch. `guard` re-finds the unique guard match without a model;
   * `locate` additionally asks the host Agent's locate model.
   */
  fallback?: 'guard' | 'locate';
  /** Submits, deletes, pays or otherwise changes business state. */
  sideEffect?: boolean;
  /** Program check run after every successful dispatch. Required for `locate`. */
  postcondition?: () => Promise<unknown> | unknown;
}

export interface ElementState {
  text: string;
  value?: string;
  checked?: boolean;
  selected?: boolean;
  visible: boolean;
  attributes: Record<string, string>;
}

export type SelectOption =
  | { value: string; label?: never }
  | { label: string; value?: never };

export type Point = NonNullable<TargetSample['point']>;

type Mode =
  | 'action'
  | 'inspect'
  | 'reveal'
  | 'fallback-context'
  | 'select-ready'
  | 'select';
export type Resolution =
  | { by: 'guard'; editable?: boolean }
  | { by: 'point'; x: number; y: number; editable?: boolean };
export interface TargetSample {
  error?: { code: string; message: string; details?: unknown };
  geometry?: number[];
  context?: { href: string; scope: string; scroll: (number | undefined)[] };
  state?: ElementState;
  point?: { x: number; y: number; identity: string; tag: string };
  suggestions?: string[];
  reveal?: {
    offset: [number, number];
    motion?: {
      direction: 'up' | 'down' | 'left' | 'right';
      distance: number;
    };
  };
}

type SamplingTarget = StrictLocate & { scrollContainer?: Locator };

export function hasGuardIdentity(guard?: TargetGuard) {
  return (
    !!guard &&
    (typeof guard.text === 'string' || Object.keys(guard.attr ?? {}).length > 0)
  );
}

// Serialized into the page. Leave all DOM dependencies inside this function.
/* istanbul ignore next -- browser realm has no host coverage counters */
export function sampleWebTarget(
  options: SamplingTarget,
  mode: Mode,
  resolution?: Resolution,
  option?: SelectOption,
): TargetSample {
  function fail(code: string, details?: unknown): never {
    throw Object.assign(new Error(code), { replayCode: code, details });
  }

  // Transparent controls can receive input even when they are not visible.
  function visibility(element: Element) {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const rendered =
      element.isConnected &&
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility === 'visible' &&
      element.checkVisibility();
    return {
      rendered,
      visible: rendered && element.checkVisibility({ checkOpacity: true }),
    };
  }

  function unique(locator: Locator, root: Node) {
    if (typeof locator?.xpath !== 'string' || !locator.xpath.trim())
      fail('INVALID_XPATH');
    let matches: XPathResult;
    try {
      matches = document.evaluate(
        locator.xpath,
        root,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null,
      );
    } catch (error) {
      fail('INVALID_XPATH', { xpath: locator.xpath, message: String(error) });
    }
    if (matches.snapshotLength > 1) fail('TARGET_AMBIGUOUS');
    const node = matches.snapshotItem(0);
    if (node && (!(node instanceof Element) || !root.contains(node)))
      fail('TARGET_OUTSIDE_SCOPE');
    return node as Element | null;
  }

  const text = (element: Element) =>
    (element.textContent ?? '').trim().replace(/\s+/g, ' ');

  function roleOf(element: Element) {
    const explicit = element.getAttribute('role');
    if (explicit) return explicit;
    const tag = element.localName;
    const type = element.getAttribute('type')?.toLowerCase();
    if (tag === 'a' && element.hasAttribute('href')) return 'link';
    if (tag === 'button') return 'button';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'select') return 'combobox';
    if (tag === 'input')
      return type === 'checkbox'
        ? 'checkbox'
        : type === 'radio'
          ? 'radio'
          : ['button', 'submit', 'reset', 'image'].includes(type ?? '')
            ? 'button'
            : 'textbox';
    return undefined;
  }

  function matchesGuard(element: Element, guard?: TargetGuard) {
    return (
      !guard ||
      ((guard.tag === undefined || guard.tag === element.localName) &&
        (guard.role === undefined || guard.role === roleOf(element)) &&
        (guard.text === undefined || text(element) === guard.text) &&
        Object.entries(guard.attr ?? {}).every(
          ([key, value]) => element.getAttribute(key) === value,
        ))
    );
  }

  const editable = (element: Element) =>
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
  const interactive = (element: Element) =>
    element.matches(
      'a[href], button, input, textarea, select, label, summary, [role], [tabindex], [contenteditable=""], [contenteditable="true"], [onclick]',
    );

  function identity(element: Element) {
    const doc = document as Document & {
      __midsceneReplayNodes?: WeakMap<Element, string>;
    };
    doc.__midsceneReplayNodes ??= new WeakMap();
    const nodes = doc.__midsceneReplayNodes;
    let value = nodes.get(element);
    if (!value) {
      value = `${performance.timeOrigin}/${Math.random().toString(36)}`;
      nodes.set(element, value);
    }
    return value;
  }

  // Unique, readable XPath suggestions for repairing strict candidates.
  function suggest(element: Element) {
    const tag = element.localName;
    const options: string[] = [];
    const quoted = (value: string) =>
      value && !value.includes('"') && value.length <= 80;
    const id = element.getAttribute('id');
    if (id && quoted(id)) options.push(`//*[@id="${id}"]`);
    for (const name of [
      'data-testid',
      'data-test',
      'name',
      'aria-label',
      'href',
      'placeholder',
      'title',
    ]) {
      const value = element.getAttribute(name);
      if (value && quoted(value)) options.push(`//${tag}[@${name}="${value}"]`);
    }
    const label = text(element);
    if (quoted(label)) options.push(`//${tag}[normalize-space(.)="${label}"]`);
    return options
      .filter((xpath) => {
        const found = document.evaluate(
          xpath,
          document,
          null,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
          null,
        );
        return found.snapshotLength === 1 && found.snapshotItem(0) === element;
      })
      .slice(0, 3);
  }

  let selecting = false;
  try {
    const scope = options.within
      ? unique(options.within, document)
      : document.documentElement;
    if (!scope) fail('SCOPE_MISSING');
    if (!Array.isArray(options.candidates) || !options.candidates.length)
      fail('INVALID_XPATH');

    const geometry = [
      performance.timeOrigin,
      innerWidth,
      innerHeight,
      devicePixelRatio,
      visualViewport?.scale ?? 1,
    ];
    function sourceContext() {
      return {
        href: location.href,
        scope: identity(scope!),
        scroll: [
          scrollX,
          scrollY,
          visualViewport?.offsetLeft,
          visualViewport?.offsetTop,
        ],
      };
    }
    if (mode === 'fallback-context')
      return { geometry, context: sourceContext() };

    let element: Element | null = null;
    if (!resolution) {
      for (const candidate of options.candidates) {
        const match = unique(candidate, options.within ? scope : document);
        if (!match) continue;
        if (element && element !== match) fail('TARGET_AMBIGUOUS');
        element = match;
      }
      if (!element) fail('TARGET_MISSING');
      if (!matchesGuard(element, options.guard)) fail('TARGET_GUARD_MISMATCH');
    } else if (resolution.by === 'guard') {
      const matches = Array.from(
        scope.querySelectorAll(options.guard?.tag ?? '*'),
      ).filter(
        (candidate) =>
          matchesGuard(candidate, options.guard) &&
          (!resolution.editable || editable(candidate)),
      );
      if (matches.length !== 1)
        fail(matches.length ? 'GUARD_AMBIGUOUS' : 'GUARD_MISSING', {
          count: matches.length,
        });
      element = matches[0];
    } else {
      const hit = document.elementFromPoint(resolution.x, resolution.y);
      for (let node = hit; node && scope.contains(node); ) {
        if (
          (options.guard
            ? matchesGuard(node, options.guard)
            : interactive(node)) &&
          (!resolution.editable || editable(node))
        ) {
          element = node;
          break;
        }
        node = node.parentElement;
      }
      if (!element)
        fail('FALLBACK_REJECTED', {
          reason: hit && scope.contains(hit) ? 'identity' : 'outside-scope',
          hit: hit?.localName,
        });
    }

    const isSelect = mode === 'select' || mode === 'select-ready';
    if (
      isSelect &&
      (!(element instanceof HTMLSelectElement) || element.multiple)
    )
      fail('SELECT_REQUIRES_SINGLE_SELECT');
    const { rendered, visible } = visibility(element);
    if (mode === 'reveal') {
      const locator = options.scrollContainer;
      const container = locator
        ? unique(locator, document)
        : document.scrollingElement;
      if (!container) fail('SCROLL_CONTAINER_MISSING');
      if (!container.contains(element)) fail('TARGET_OUTSIDE_SCROLL_CONTAINER');
      if (!rendered)
        fail('TARGET_NOT_INTERACTABLE', { reason: 'not-rendered' });
      const rect = element.getBoundingClientRect();
      const box = container.getBoundingClientRect();
      const left = locator ? Math.max(0, box.left + container.clientLeft) : 0;
      const top = locator ? Math.max(0, box.top + container.clientTop) : 0;
      const right = locator
        ? Math.min(
            innerWidth,
            box.left + container.clientLeft + container.clientWidth,
          )
        : innerWidth;
      const bottom = locator
        ? Math.min(
            innerHeight,
            box.top + container.clientTop + container.clientHeight,
          )
        : innerHeight;
      if (right <= left || bottom <= top) fail('SCROLL_CONTAINER_NOT_VISIBLE');

      const reveal: NonNullable<TargetSample['reveal']> = {
        offset: [container.scrollLeft, container.scrollTop],
      };
      const x = (Math.max(0, rect.left) + Math.min(innerWidth, rect.right)) / 2;
      const y =
        (Math.max(0, rect.top) + Math.min(innerHeight, rect.bottom)) / 2;
      if (
        x >= left &&
        x < right &&
        y >= top &&
        y < bottom &&
        element.contains(document.elementFromPoint(x, y))
      )
        return { reveal };

      // Aim inside the visible part of the container, leaving room at its edges.
      const deltaY =
        rect.top < top || rect.bottom > bottom
          ? (rect.top + rect.bottom - top - bottom) / 2
          : 0;
      const deltaX =
        rect.left < left || rect.right > right
          ? (rect.left + rect.right - left - right) / 2
          : 0;
      if (!deltaY && !deltaX)
        fail('TARGET_NOT_INTERACTABLE', { reason: 'hit-target-mismatch' });
      reveal.motion =
        Math.abs(deltaY) >= Math.abs(deltaX)
          ? {
              direction: deltaY > 0 ? 'down' : 'up',
              distance: Math.ceil(Math.abs(deltaY)),
            }
          : {
              direction: deltaX > 0 ? 'right' : 'left',
              distance: Math.ceil(Math.abs(deltaX)),
            };
      return { reveal };
    }
    if (mode === 'inspect') {
      const state: ElementState = {
        text: element.textContent?.trim() ?? '',
        visible,
        attributes: Object.fromEntries(
          Array.from(element.attributes, (a) => [a.name, a.value]),
        ),
      };
      if ('value' in element && typeof element.value === 'string')
        state.value = element.value;
      if ('checked' in element && typeof element.checked === 'boolean')
        state.checked = element.checked;
      if ('selected' in element && typeof element.selected === 'boolean')
        state.selected = element.selected;
      return { state };
    }

    const rect = element.getBoundingClientRect();
    const x = (Math.max(0, rect.left) + Math.min(innerWidth, rect.right)) / 2;
    const y = (Math.max(0, rect.top) + Math.min(innerHeight, rect.bottom)) / 2;
    const hit = document.elementFromPoint(x, y);
    const recovered = !!resolution;
    const reason =
      !rendered || (recovered && !visible)
        ? 'not-rendered'
        : Math.min(innerWidth, rect.right) <= Math.max(0, rect.left) ||
            Math.min(innerHeight, rect.bottom) <= Math.max(0, rect.top)
          ? 'outside-viewport'
          : element.matches(':disabled') ||
              element.closest('[inert]') ||
              (recovered && element.closest('[aria-disabled="true"]'))
            ? 'disabled'
            : !element.contains(hit)
              ? 'hit-target-mismatch'
              : undefined;
    if (reason)
      fail('TARGET_NOT_INTERACTABLE', {
        reason,
        rendered,
        visible,
        point: { x, y },
        rect: rect.toJSON(),
        target: element.localName,
        hitTarget: hit?.localName,
      });
    const sample: TargetSample = {
      point: { x, y, identity: identity(element), tag: element.localName },
      geometry,
      ...(recovered && {
        context: sourceContext(),
        suggestions: suggest(element),
      }),
    };
    if (isSelect && element instanceof HTMLSelectElement && option) {
      const matches = Array.from(element.options).filter((item) =>
        option.value === undefined
          ? item.label === option.label
          : item.value === option.value,
      );
      if (matches.length !== 1)
        fail(
          matches.length ? 'SELECT_OPTION_AMBIGUOUS' : 'SELECT_OPTION_MISSING',
          option,
        );
      const matched = matches[0];
      if (matched.disabled || matched.closest('optgroup')?.disabled)
        fail('SELECT_OPTION_DISABLED', option);

      if (mode === 'select') {
        // Resolve and commit in the same page turn. Once selection starts, a
        // runtime error cannot be reported as a safe pre-dispatch failure.
        selecting = true;
        element.selectedIndex = matched.index;
        element.dispatchEvent(
          new Event('input', { bubbles: true, composed: true }),
        );
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    return sample;
  } catch (error) {
    if (selecting) throw error;
    const failure = error as { replayCode?: string; details?: unknown };
    return {
      error: {
        code: failure?.replayCode ?? 'PAGE_EVALUATION_ERROR',
        message: String(error),
        details: failure?.details,
      },
    };
  }
}

export function sampleExpression(
  options: SamplingTarget,
  mode: Mode,
  resolution?: Resolution,
  option?: SelectOption,
) {
  return `(${sampleWebTarget.toString()})(${JSON.stringify(options)},${JSON.stringify(mode)},${JSON.stringify(resolution)},${JSON.stringify(option)})`;
}

export async function sampleTarget(
  agent: Agent,
  target: SamplingTarget,
  mode: Mode,
  resolution?: Resolution,
  option?: SelectOption,
): Promise<TargetSample> {
  const result: TargetSample = await agent.evaluateJavaScript(
    sampleExpression(target, mode, resolution, option),
  );
  if (result.error)
    throw replayError(
      result.error.code,
      result.error.details ?? { message: result.error.message },
    );
  return result;
}

export function samePoint(before: TargetSample, after: TargetSample) {
  return (
    before.point?.identity === after.point?.identity &&
    before.point?.x === after.point?.x &&
    before.point?.y === after.point?.y &&
    JSON.stringify(before.geometry) === JSON.stringify(after.geometry)
  );
}
