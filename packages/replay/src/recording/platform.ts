/** Facts captured from a Web document; other platforms need their own adapters. */
export interface Locator {
  kind: 'web.xpath';
  value: string;
  tier: 'testid' | 'semantic' | 'anchored' | 'text' | 'structural';
  textDependent?: boolean;
}

export type Role =
  | 'button'
  | 'link'
  | 'textbox'
  | 'checkbox'
  | 'radio'
  | 'switch'
  | 'select'
  | 'option'
  | 'item'
  | 'image'
  | 'text'
  | 'container'
  | 'unknown';

export interface Fingerprint {
  role: Role;
  /** Accessible name or visible text, at most 60 characters. */
  name?: string;
  /** Platform identity that must match exactly, such as input type or class. */
  platform?: Record<string, string>;
  /** Size normalized to the screen. Used for scoring only. */
  size?: [number, number];
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Sampled at selected moments. Coordinates are logical screen units. */
export interface TargetSample {
  /** Stable within one recording: the same element yields the same key. */
  key: string;
  locators: Locator[];
  fingerprint: Fingerprint;
  rect: Rect;
  editable?: boolean;
  checkable?: boolean;
  /** Candidate generation stopped at its time budget. */
  partial?: boolean;
  /** Only visual locating is possible for this surface. */
  visualOnly?: string;
  /** Scroll container position, for scroll samples. */
  scroll?: [number, number];
}

export interface StateSample {
  value?: string;
  checked?: boolean;
  focused?: boolean;
  visible?: boolean;
  editable?: boolean;
  /** Target key of the element owning focus. */
  focusKey?: string;
  screen?: string;
}

export interface Effect {
  mutations: number;
  added: number;
  removed?: number;
  valueChanged: boolean;
  focusMoved: boolean;
  navigated: boolean;
  dialog: boolean;
}
