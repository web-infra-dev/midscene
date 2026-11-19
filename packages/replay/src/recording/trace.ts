import type { Effect, StateSample, TargetSample } from './platform';

export const TRACE_VERSION = 1 as const;

export interface TraceMeta {
  version: typeof TRACE_VERSION;
  id: string;
  platform: 'web';
  capture: 'native';
  start: { screen?: string; size: [number, number]; dpr?: number };
  startedAt: string;
  collector: string;
  /** Stop snapshot, available when a recorded page is still open. */
  end?: { screen: string; frame: string; at: number };
  /** Capture time for each retained screenshot, in the event clock. */
  frameTimes?: Record<string, number>;
}

/** Sampled facts attached to an event; only produced at sampling points. */
export interface EventSample {
  target?: TargetSample;
  state?: StateSample;
  /** Frame id captured before the event took effect. */
  before?: string;
  /** Pointer target is a descendant of the element revealed by this dwell event. */
  revealedBy?: string;
  /** Target became visible through this scroll or swipe event. */
}

interface Base extends EventSample {
  id: string;
  /** Milliseconds since capture start (monotonic). */
  t: number;
}

export type TraceEvent =
  | (Base & {
      type: 'pointer';
      phase: 'down' | 'up';
      x: number;
      y: number;
      button?: 'left' | 'right' | 'middle';
      clickCount?: number;
    })
  /** Merged pointer path: start, dwell points and end only. */
  | (Base & { type: 'move'; path: Array<[number, number, number]> })
  /** The pointer rested and the UI changed while it rested. */
  | (Base & { type: 'dwell'; x: number; y: number; ms: number })
  | (Base & { type: 'key'; key: string; modifiers: string[] })
  | (Base & {
      type: 'edit';
      phase: 'start' | 'end';
      inputs?: number;
      externalMutations?: number;
    })
  | (Base & {
      type: 'scroll';
      x: number;
      y: number;
      from: [number, number];
      to: [number, number];
    })
  | (Base & { type: 'select'; value: string; label?: string })
  | (Base & {
      type: 'screen';
      screen: string;
      reason: 'navigation' | 'newWindow' | 'closed';
    })
  | (Base & {
      type: 'dialog';
      dialog: 'alert' | 'confirm' | 'prompt' | 'beforeunload';
      message: string;
      accept: boolean;
      text?: string;
    })
  | (Base & { type: 'files'; files: string[] })
  /** Effect observed after the referenced event, and the frame once the UI settled. */
  | (Base & {
      type: 'effect';
      of: string;
      effect: Effect;
      after?: string;
      focusKey?: string;
    });

export type TraceEventType = TraceEvent['type'];

export interface Trace {
  meta: TraceMeta;
  events: TraceEvent[];
  /** Frame id → relative file path inside the trace directory. */
  frames: Record<string, string>;
}
