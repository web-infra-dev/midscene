/// <reference lib="dom" />
import { createProbeMotion } from './probe-motion';
import { createProbeTargets } from './probe-targets';

export interface ProbeOptions {
  captureAncestors?: boolean;
  /** Host binding for trusted-event batches. */
  binding: string;
  key: string;
  /** Per-sample budget for locator generation, milliseconds. */
  budgetMs: number;
  dwellMs: number;
  scrollSettleMs: number;
  effectWindowMs: number;
}

/**
 * Use the same self-contained expression for the current document and future
 * navigations. Browser-side functions receive their dependencies explicitly.
 */
export function domProbeSource(options: ProbeOptions): string {
  return `(${installDomProbe.toString()})(${JSON.stringify(options)}, ${createProbeTargets.toString()}, ${createProbeMotion.toString()})`;
}

/* istanbul ignore next -- browser realm has no host coverage counters */
function installDomProbe(
  options: ProbeOptions,
  createTargets: typeof createProbeTargets,
  createMotion: typeof createProbeMotion,
): void {
  const host = window as unknown as Record<string, unknown>;
  if (window !== window.top || host[options.key]) return;
  const abort = new AbortController();
  const { signal } = abort;
  const send = host[options.binding] as
    | ((batch: unknown[]) => Promise<void>)
    | undefined;
  // Wall-clock milliseconds, comparable with screencast frame timestamps and across documents.
  const now = () =>
    Math.round((performance.timeOrigin + performance.now()) * 10) / 10;
  // The navigation time origin can precede the commit while the old page is
  // still visible. Use installation in this document as the frame boundary.
  const probeStartedAt = now();
  const documentId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  let eventSerial = 0;
  const buffer: Record<string, unknown>[] = [];
  let flushTimer: number | undefined;
  const flush = () => {
    flushTimer = undefined;
    if (!buffer.length || !send) return;
    void send(buffer.splice(0, buffer.length)).catch(() => undefined);
  };
  const push = (event: Record<string, unknown>) => {
    if (event.frame) event.probeStartedAt = probeStartedAt;
    buffer.push(event);
    // Actions are sent at once: a navigation they cause may unload the page before a timer fires.
    if (event.type === 'pointer' || event.type === 'key') flush();
    else if (flushTimer === undefined)
      flushTimer = window.setTimeout(flush, 50);
  };
  const nextId = () => `${documentId}-e${++eventSerial}`;

  const listen = (type: string, handler: (event: Event) => void) =>
    window.addEventListener(type, handler, {
      capture: true,
      passive: true,
      signal,
    });

  // Sample before the page's handlers run to preserve identity and state.
  const targets = createTargets(options, documentId);
  const {
    nameOf,
    locatorsFor,
    keyOf,
    receiverOf,
    sampleTarget,
    editableOf,
    checkableOf,
    fieldValue,
    stateOf,
  } = targets;
  const motion = createMotion(options, targets, { now, nextId, push, listen });

  // ---------- effects (L4) ----------
  let pendingEffect:
    | {
        of: string;
        mutations: number;
        added: number;
        removed: number;
        focus: Element | null;
        value?: string;
        target?: Element | null;
        navigated: boolean;
        dialog: boolean;
      }
    | undefined;
  let effectTimer: number | undefined;
  const closeEffect = () => {
    if (!pendingEffect) return;
    const effect = pendingEffect;
    pendingEffect = undefined;
    if (effectTimer !== undefined) clearTimeout(effectTimer);
    effectTimer = undefined;
    const target = effect.target;
    // After-state is a sampling point too: it grounds assertions (value cleared, box checked).
    const after =
      target?.isConnected && (editableOf(target) || checkableOf(target))
        ? stateOf(target)
        : undefined;
    push({
      type: 'effect',
      id: nextId(),
      t: now(),
      of: effect.of,
      effect: {
        mutations: effect.mutations,
        added: effect.added,
        ...(effect.removed ? { removed: effect.removed } : {}),
        valueChanged: Boolean(
          target &&
            effect.value !== undefined &&
            fieldValue(target) !== effect.value,
        ),
        focusMoved: document.activeElement !== effect.focus,
        navigated: effect.navigated,
        dialog: effect.dialog,
      },
      ...(after ? { state: after } : {}),
      focusKey:
        document.activeElement && document.activeElement !== document.body
          ? keyOf(document.activeElement)
          : undefined,
      settle: true,
    });
  };
  const openEffect = (of: string, target: Element | null) => {
    closeEffect();
    pendingEffect = {
      of,
      mutations: 0,
      added: 0,
      removed: 0,
      focus: document.activeElement,
      value: target ? fieldValue(target) : undefined,
      target,
      navigated: false,
      dialog: false,
    };
    effectTimer = window.setTimeout(closeEffect, options.effectWindowMs);
  };
  // ---------- event handling ----------
  let editing:
    | {
        element: Element;
        inputs: number;
        externalMutations: number;
      }
    | undefined;
  const endEdit = (at = now()) => {
    if (!editing) return;
    const current = editing;
    editing = undefined;
    const id = nextId();
    push({
      type: 'edit',
      id,
      t: at,
      phase: 'end',
      inputs: current.inputs,
      externalMutations: current.externalMutations,
      target: sampleTarget(current.element),
      state: stateOf(current.element),
      frame: true,
    });
  };
  const observer = new MutationObserver((records) => {
    const added = motion.onMutations(records);
    if (pendingEffect) {
      pendingEffect.mutations += records.length;
      pendingEffect.added += added;
      for (const record of records)
        for (const node of Array.from(record.removedNodes))
          if (node instanceof Element) pendingEffect.removed++;
    }
    if (editing)
      editing.externalMutations += records.filter(
        (record) => !editing!.element.contains(record.target),
      ).length;
  });
  const observe = () => {
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    motion.sampleRows();
  };
  if (document.documentElement) observe();
  else
    document.addEventListener('DOMContentLoaded', observe, {
      once: true,
      signal,
    });

  listen('pointerdown', (event) => {
    const e = event as PointerEvent;
    if (!e.isTrusted) return;
    const [x, y] = motion.press(e);
    const hit = options.captureAncestors ? e.composedPath()[0] : e.target;
    const element = receiverOf(hit instanceof Element ? hit : null);
    const target = sampleTarget(element);
    if (target && element && options.captureAncestors && !target.visualOnly) {
      const ancestor = element.parentElement?.closest(
        'li,tr,[role="row"],[role="listitem"],form,[role="dialog"]',
      );
      if (ancestor)
        target.ancestor = {
          tag: ancestor.localName,
          name: nameOf(ancestor),
          locators: locatorsFor(ancestor, performance.now() + options.budgetMs)
            .locators,
        };
    }
    if (editing) endEdit();
    const revealedBy = motion.reveal(e, element);
    const id = nextId();
    // Sampled at press time: the element may disappear once clicked.
    push({
      type: 'pointer',
      id,
      t: now(),
      phase: 'down',
      ...(revealedBy ? { revealedBy } : {}),
      x,
      y,
      button: e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left',
      clickCount: e.detail || 1,
      target,
      state: stateOf(element),
      frame: true,
    });
    openEffect(id, element);
  });
  listen('pointerup', (event) => {
    const e = event as PointerEvent;
    if (!e.isTrusted) return;
    motion.release();
    push({
      type: 'pointer',
      id: nextId(),
      t: now(),
      phase: 'up',
      x: Math.round(e.clientX),
      y: Math.round(e.clientY),
      button: e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left',
      clickCount: e.detail || 1,
    });
  });
  // A printable key in an editor can be an application shortcut. Delay recording
  // it until the default action runs; only a matching edit consumes that key.
  let pendingKey:
    | { element: Element; key: string; modifiers: string[]; at: number }
    | undefined;
  const flushKey = () => {
    if (!pendingKey) return;
    const { element, key, modifiers, at } = pendingKey;
    pendingKey = undefined;
    endEdit(at);
    push({
      type: 'key',
      id: nextId(),
      t: at,
      key,
      modifiers,
      target: sampleTarget(element),
      state: stateOf(element),
      frame: true,
    });
  };
  listen('keyup', flushKey);
  listen('input', (event) => {
    if (event.isTrusted && pendingKey?.element === event.target)
      pendingKey = undefined;
  });
  listen('beforeinput', (event) => {
    if (!event.isTrusted) return;
    const element = receiverOf(
      event.target instanceof Element ? event.target : null,
    );
    if (!element) return;
    // Enter in a single-line field submits; it is recorded as a key action, not an edit.
    const inputType = (event as InputEvent).inputType;
    if (
      (inputType === 'insertLineBreak' || inputType === 'insertParagraph') &&
      element instanceof HTMLInputElement
    )
      return;
    closeEffect();
    if (editing && editing.element === element) {
      editing.inputs++;
      return;
    }
    endEdit();
    const id = nextId();
    editing = { element, inputs: 1, externalMutations: 0 };
    push({
      type: 'edit',
      id,
      t: now(),
      phase: 'start',
      target: sampleTarget(element),
      state: stateOf(element),
      frame: true,
    });
  });
  listen('change', (event) => {
    if (!event.isTrusted) return;
    const element = event.target as Element;
    if (element instanceof HTMLInputElement && element.type === 'file') {
      // Only file names: the page never sees local paths, and contents stay out of the trace.
      push({
        type: 'files',
        id: nextId(),
        t: now(),
        files: Array.from(element.files ?? []).map((file) =>
          file.name.slice(0, 200),
        ),
        target: sampleTarget(element),
      });
      return;
    }
    if (element instanceof HTMLSelectElement) {
      const option = element.selectedOptions[0];
      push({
        type: 'select',
        id: nextId(),
        t: now(),
        value: element.value,
        ...(option ? { label: option.label.slice(0, 60) } : {}),
        target: sampleTarget(element),
        state: stateOf(element),
        frame: true,
      });
    } else if (editing && editing.element === element) endEdit();
  });
  listen('keydown', (event) => {
    const e = event as KeyboardEvent;
    if (!e.isTrusted || e.repeat) return;
    if (
      [
        ' ',
        'PageDown',
        'PageUp',
        'ArrowDown',
        'ArrowUp',
        'Home',
        'End',
      ].includes(e.key)
    )
      motion.noteScrollIntent();
    const modifiers = ['Control', 'Alt', 'Meta', 'Shift'].filter((name) =>
      e.getModifierState(name),
    );
    const chord = modifiers.filter((name) => name !== 'Shift').length > 0;
    // Text-producing keys are covered by the edit run; only non-text keys are actions.
    flushKey();
    const editor = document.activeElement;
    if (
      editor &&
      editableOf(editor) &&
      !chord &&
      (e.key.length === 1 ||
        ['Backspace', 'Delete', 'Process', 'Dead', 'Unidentified'].includes(
          e.key,
        ) ||
        e.isComposing)
    ) {
      if (
        !e.isComposing &&
        !['Process', 'Dead', 'Unidentified'].includes(e.key)
      )
        pendingKey = { element: editor, key: e.key, modifiers, at: now() };
      return;
    }
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return;
    const active =
      document.activeElement && document.activeElement !== document.body
        ? document.activeElement
        : null;
    if (editing) endEdit();
    const id = nextId();
    push({
      type: 'key',
      id,
      t: now(),
      key: e.key,
      modifiers,
      target: sampleTarget(active),
      state: stateOf(active),
      frame: true,
    });
    openEffect(id, active);
  });
  listen('focusout', (event) => {
    if (!event.isTrusted) return;
    if (editing && editing.element === event.target) endEdit();
  });
  listen('pagehide', () => {
    endEdit();
    motion.drain();
    closeEffect();
    flush();
  });

  host[options.key] = {
    dispose() {
      abort.abort();
      observer.disconnect();
      motion.dispose();
      clearTimeout(flushTimer);
      clearTimeout(effectTimer);
      delete host[options.key];
    },
    /** Called by the host when it observes a navigation or dialog caused by the last action. */
    note(kind: 'navigated' | 'dialog') {
      if (pendingEffect) pendingEffect[kind] = true;
    },
    /** Called by the host before it stops so pending runs are closed. */
    drain() {
      flushKey();
      endEdit();
      motion.drain();
      closeEffect();
      const events = buffer.splice(0, buffer.length);
      return events;
    },
  };
}
