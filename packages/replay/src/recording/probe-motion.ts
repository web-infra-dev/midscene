/// <reference lib="dom" />
import type { ProbeOptions } from './probe';
import type { createProbeTargets } from './probe-targets';

/* istanbul ignore next -- browser realm has no host coverage counters */
export function createProbeMotion(
  options: Pick<ProbeOptions, 'dwellMs' | 'scrollSettleMs'>,
  {
    rowSelector,
    receiverOf,
    sampleTarget,
  }: ReturnType<typeof createProbeTargets>,
  {
    now,
    nextId,
    push,
    listen,
  }: {
    now(): number;
    nextId(): string;
    push(event: Record<string, unknown>): void;
    listen(type: string, handler: (event: Event) => void): void;
  },
) {
  // :hover can already be applied by pointerover. Sample buttons while the row is unhovered.
  const hiddenButtons = new WeakMap<Element, Set<Element>>();
  let rowHover: { row: Element; x: number; y: number; at: number } | undefined;
  const rendered = (el: Element) =>
    el.getClientRects().length > 0 &&
    getComputedStyle(el).visibility === 'visible';
  const sampleRow = (row: Element) => {
    hiddenButtons.delete(row);
    if (!row.isConnected || row === rowHover?.row || row.matches(':hover'))
      return;
    const buttons = row.querySelectorAll(
      'button,[role=button],input[type=button],input[type=submit],input[type=reset]',
    );
    if (!buttons.length || !rendered(row)) return;
    const hidden = new Set(
      Array.from(buttons).filter((button) => !rendered(button)),
    );
    if (hidden.size) hiddenButtons.set(row, hidden);
  };
  // Mutation counter; a dwell is sampled when it advanced since the pointer arrived.
  let mutationCount = 0;
  let move:
    | {
        path: Array<[number, number, number]>;
        restX: number;
        restY: number;
      }
    | undefined;
  let dwellTimer: number | undefined;
  /** Element under the pointer and the mutation count when the pointer arrived on it. */
  let hovered: {
    element: Element | null;
    mutations: number;
    sampled: boolean;
  } = { element: null, mutations: 0, sampled: false };
  const flushMove = () => {
    if (!move || move.path.length < 2) {
      move = undefined;
      return;
    }
    push({ type: 'move', id: nextId(), t: now(), path: move.path });
    move = undefined;
  };
  const recordDwell = (element: Element, x: number, y: number, ms: number) => {
    flushMove();
    const id = nextId();
    push({
      type: 'dwell',
      id,
      t: now(),
      x,
      y,
      ms,
      target: sampleTarget(element),
      frame: true,
    });
    if (rowHover?.row.contains(element)) hiddenButtons.delete(rowHover.row);
    return id;
  };
  const onMove = (event: PointerEvent | MouseEvent) => {
    if (
      !event.isTrusted ||
      ('pointerType' in event && event.pointerType === 'touch')
    )
      return;
    const t = now();
    const point: [number, number, number] = [
      Math.round(event.clientX),
      Math.round(event.clientY),
      t,
    ];
    if (!move)
      move = {
        path: [point],
        restX: point[0],
        restY: point[1],
      };
    else if (Math.hypot(point[0] - move.restX, point[1] - move.restY) > 4) {
      move.restX = point[0];
      move.restY = point[1];
      // Keep only endpoints; intermediate samples are not replayed.
      if (move.path.length > 1) move.path[move.path.length - 1] = point;
      else move.path.push(point);
    }
    if (dwellTimer !== undefined) clearTimeout(dwellTimer);
    dwellTimer = window.setTimeout(() => {
      dwellTimer = undefined;
      // A dwell is only sampled once per element, when the UI changed after the pointer arrived.
      if (
        hovered.sampled ||
        !hovered.element ||
        mutationCount === hovered.mutations
      )
        return;
      hovered.sampled = true;
      recordDwell(hovered.element, point[0], point[1], options.dwellMs);
    }, options.dwellMs);
  };
  // pointerover is dispatched before the page's enter/over handlers run, so the
  // mutation count taken here excludes changes those handlers make.
  listen('pointerover', (event) => {
    const e = event as PointerEvent;
    if (!e.isTrusted || e.pointerType === 'touch') return;
    const element = receiverOf(e.target instanceof Element ? e.target : null);
    const row = element?.closest(rowSelector);
    if (row !== rowHover?.row) {
      const previous = rowHover?.row;
      rowHover = row
        ? {
            row,
            x: e.clientX,
            y: e.clientY,
            at: now(),
          }
        : undefined;
      if (previous) sampleRow(previous);
    }
    if (element !== hovered.element)
      hovered = { element, mutations: mutationCount, sampled: false };
  });
  let scroll:
    | {
        element: Element | Document;
        from: [number, number];
        x: number;
        y: number;
        timer?: number;
        startedAt: number;
        user: boolean;
      }
    | undefined;
  const scrollPos = (element: Element | Document): [number, number] =>
    element instanceof Document
      ? [Math.round(scrollX), Math.round(scrollY)]
      : [
          Math.round((element as Element).scrollLeft),
          Math.round((element as Element).scrollTop),
        ];
  /**
   * Scroll events are trusted even when page code or focus moves scrolled. Only a
   * scroll that starts right after a wheel, touch move, scroll key or while the
   * pointer is held (scrollbar drag) is a user action.
   */
  let scrollIntentAt = Number.NEGATIVE_INFINITY;
  let pointerHeld = false;
  const userScrolling = () => pointerHeld || now() - scrollIntentAt < 250;
  const onScroll = (event: Event) => {
    if (!event.isTrusted) return;
    const element = event.target instanceof Element ? event.target : document;
    if (!scroll || scroll.element !== element) {
      endScroll();
      scroll = {
        element,
        from: lastScroll.get(element) ?? [0, 0],
        x: lastPointer[0],
        y: lastPointer[1],
        startedAt: now(),
        user: false,
      };
    }
    if (userScrolling()) scroll.user = true;
    window.clearTimeout(scroll.timer);
    scroll.timer = window.setTimeout(endScroll, options.scrollSettleMs);
  };
  const lastScroll = new Map<Element | Document, [number, number]>();
  const endScroll = () => {
    if (!scroll) return;
    const current = scroll;
    scroll = undefined;
    const to = scrollPos(current.element);
    lastScroll.set(current.element, to);
    if (
      !current.user ||
      (to[0] === current.from[0] && to[1] === current.from[1])
    )
      return;
    const id = nextId();
    push({
      type: 'scroll',
      id,
      t: current.startedAt,
      x: current.x,
      y: current.y,
      from: current.from,
      to,
      target:
        current.element instanceof Element
          ? sampleTarget(current.element)
          : undefined,
      frame: true,
    });
  };
  const lastPointer: [number, number] = [0, 0];
  listen('pointermove', (event) => onMove(event as PointerEvent));
  listen('wheel', (event) => {
    const e = event as WheelEvent;
    if (!e.isTrusted) return;
    scrollIntentAt = now();
    lastPointer[0] = Math.round(e.clientX);
    lastPointer[1] = Math.round(e.clientY);
  });
  listen('touchmove', (event) => {
    if (event.isTrusted) scrollIntentAt = now();
  });
  listen('pointercancel', () => {
    pointerHeld = false;
  });
  listen('scroll', onScroll);

  return {
    onMutations(records: MutationRecord[]) {
      let added = 0;
      const rows = new Set<Element>();
      for (const record of records) {
        const root =
          record.target instanceof Element
            ? record.target
            : record.target.parentElement;
        const row = root?.closest(rowSelector);
        if (row) rows.add(row);
        if (record.type === 'attributes' && root && !row)
          root
            .querySelectorAll(rowSelector)
            .forEach((child) => rows.add(child));
        for (const node of Array.from(record.addedNodes))
          if (node instanceof Element) {
            const rect = node.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) added++;
            if (node.matches(rowSelector)) rows.add(node);
            node
              .querySelectorAll(rowSelector)
              .forEach((child) => rows.add(child));
          }
      }
      for (const row of rows) sampleRow(row);
      mutationCount += records.length;
      return added;
    },
    sampleRows() {
      document.querySelectorAll(rowSelector).forEach(sampleRow);
    },
    press(e: PointerEvent) {
      pointerHeld = true;
      lastPointer[0] = Math.round(e.clientX);
      lastPointer[1] = Math.round(e.clientY);
      flushMove();
      endScroll();
      return lastPointer;
    },
    release() {
      pointerHeld = false;
    },
    reveal(e: PointerEvent, element: Element | null) {
      // Changes caused by this press are its effects, not something the hover revealed.
      hovered.sampled = true;
      let revealedBy: string | undefined;
      if (
        e.pointerType === 'mouse' &&
        element &&
        rowHover &&
        rowHover.row.contains(element) &&
        hiddenButtons.get(rowHover.row)?.has(element) &&
        rendered(element)
      ) {
        revealedBy = recordDwell(
          rowHover.row,
          rowHover.x,
          rowHover.y,
          now() - rowHover.at,
        );
      }
      return revealedBy;
    },
    noteScrollIntent() {
      scrollIntentAt = now();
    },
    drain() {
      flushMove();
      endScroll();
    },
    dispose() {
      clearTimeout(dwellTimer);
      clearTimeout(scroll?.timer);
    },
  };
}
