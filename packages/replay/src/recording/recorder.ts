import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { CDPSession, Dialog, Disposable, Frame, Page } from 'playwright';
import { writeJsonFile } from '../io';
import type { StateSample, TargetSample } from './platform';
import { domProbeSource } from './probe';
import {
  TRACE_VERSION,
  type Trace,
  type TraceEvent,
  type TraceMeta,
} from './trace';

export interface WebRecorderOptions {
  captureAncestors?: boolean;
  /** Pixel budget for locator generation per sampling point. */
  budgetMs?: number;
  /** Extra CSS selectors whose values are treated as secrets. */
  secretSelectors?: string[];
  /** Maximum frames kept in memory and written. */
  maxFrames?: number;
  /** Answer for dialogs raised while recording. */
  onDialog?: (dialog: { type: string; message: string }) => Promise<{
    accept: boolean;
    text?: string;
  }>;
}

type Rect = { x: number; y: number; width: number; height: number };
type Viewport = {
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
};
type RedactionGeometry = Viewport & { documentStart: number };
type RedactionSample = RedactionGeometry & { at: number; rects: Rect[] };

interface FrameRef {
  page: Page;
  id: string;
  at: number;
  hasCaptureTimestamp?: boolean;
  data: string;
  viewport: Viewport;
  compatibleViewport: boolean;
  exactMasks?: Rect[] | null;
}

/** Raw probe payload: events plus optional sampled target/state and a frame request. */
type ProbeEvent = Record<string, unknown> & {
  id: string;
  t: number;
  type: string;
  frame?: boolean;
  probeStartedAt?: number;
  settle?: boolean;
  redactionGeometry?: RedactionGeometry;
};

/**
 * Records trusted user input on a real page. The user drives the page directly;
 * nothing is dispatched on their behalf. Only sampled moments carry target,
 * state and frame references.
 */
export class WebRecorder {
  private readonly events: TraceEvent[] = [];
  private readonly eventPages = new Map<string, Page>();
  private readonly frames: FrameRef[] = [];
  private readonly keep = new Set<string>();
  private readonly redactions = new Map<Page, RedactionSample[]>();
  private readonly pendingRedactions = new Set<Promise<void>>();
  private readonly secretNames = new Map<string, string>();
  private latest?: FrameRef;
  private frameSequence = 0;
  private readonly cdps: CDPSession[] = [];
  private readonly pages = new Set<Page>();
  private readonly instrumentation: Disposable[] = [];
  private readonly pendingPages: Promise<void>[] = [];
  private stopped = false;
  private readonly key = `__midsceneRecorder_${randomUUID().replace(/-/g, '')}`;
  private readonly binding =
    `__midsceneRecorderSend_${randomUUID().replace(/-/g, '')}`;
  private startScreen = '';
  private startSize: [number, number] = [0, 0];
  private startedAt = '';
  private readonly actionPages = new Set<Page>();
  private activeAt = 0;
  private readonly listeners: Array<() => void> = [];

  constructor(
    private page: Page,
    private readonly options: WebRecorderOptions = {},
  ) {}

  async start() {
    const viewport =
      this.page.viewportSize() ??
      (await this.page.evaluate(
        /* istanbul ignore next -- browser realm has no host coverage counters */
        () => ({ width: innerWidth, height: innerHeight }),
      ));
    this.startSize = [viewport.width, viewport.height];
    this.startScreen = this.page.url();
    this.startedAt = new Date().toISOString();
    const probe = domProbeSource({
      captureAncestors: this.options.captureAncestors,
      binding: this.binding,
      key: this.key,
      budgetMs: this.options.budgetMs ?? 8,
      dwellMs: 300,
      scrollSettleMs: 150,
      effectWindowMs: 500,
      secretSelectors: this.options.secretSelectors ?? [],
    });
    const instrument = async (page: Page) => {
      // A real browser context may contain unrelated, signed-in tabs.
      this.instrumentation.push(
        await page.exposeBinding(
          this.binding,
          (source, batch: ProbeEvent[]) => {
            if (source.frame === page.mainFrame()) this.receive(batch, page);
          },
        ),
      );
      this.instrumentation.push(await page.addInitScript(probe));
      await page.evaluate(probe);
      await this.observeRedaction(page);
      await this.startFrames(page);
    };
    const recordDialog = async (page: Page, dialog: Dialog) => {
      const answer = (await this.options.onDialog?.({
        type: dialog.type(),
        message: dialog.message(),
      })) ?? { accept: true };
      this.events.push({
        type: 'dialog',
        id: this.id(),
        t: Date.now(),
        dialog: dialog.type() as 'alert',
        message: dialog.message().slice(0, 500),
        accept: answer.accept,
        ...(answer.text !== undefined ? { text: answer.text } : {}),
      });
      // Answer first: page scripts are blocked while the dialog is open.
      if (answer.accept) await dialog.accept(answer.text);
      else await dialog.dismiss();
      await this.note(page, 'dialog');
    };
    // No file chooser listener: registering one would suppress the native picker.
    // The probe records the chosen file names from the input's change event.
    const attach = (page: Page, opener?: Page) => {
      if (this.pages.has(page)) return;
      this.pages.add(page);
      const onNavigated = (frame: Frame) => {
        if (frame.parentFrame() || this.stopped) return;
        this.recordScreen(frame.url(), 'navigation', page);
        const observation = this.observeRedaction(page).finally(() =>
          this.pendingRedactions.delete(observation),
        );
        this.pendingRedactions.add(observation);
      };
      const onDialog = (dialog: Dialog) => recordDialog(page, dialog);
      const onPopup = (popup: Page) => {
        this.activate(popup, Date.now());
        attach(popup, page);
        const ready = instrument(popup).catch((error) => {
          // Chromium can close a popup before its probe or screencast has attached.
          if (!popup.isClosed()) throw error;
        });
        this.pendingPages.push(ready);
        // Keep setup errors available to stop() without an unhandled rejection.
        void ready.catch(() => undefined);
        this.recordScreen(popup.url() || 'about:blank', 'newWindow', page);
      };
      const onClose = () => {
        if (this.page === page) {
          const next =
            opener && !opener.isClosed()
              ? opener
              : [...this.pages].findLast((candidate) => !candidate.isClosed());
          if (next) this.activate(next, Date.now());
        }
        this.recordScreen(page.url(), 'closed');
      };
      page.on('framenavigated', onNavigated);
      page.on('dialog', onDialog);
      page.on('popup', onPopup);
      page.on('close', onClose);
      this.listeners.push(
        () => page.off('framenavigated', onNavigated),
        () => page.off('dialog', onDialog),
        () => page.off('popup', onPopup),
        () => page.off('close', onClose),
      );
    };
    attach(this.page);
    await instrument(this.page);
  }

  private id() {
    return `h${this.events.length + 1}-${Math.random().toString(36).slice(2, 6)}`;
  }

  /** Screencast frames are kept as references; only referenced frames survive. */
  private async startFrames(page: Page) {
    try {
      const cdp = await page.context().newCDPSession(page);
      this.cdps.push(cdp);
      let firstFrame!: () => void;
      const ready = new Promise<void>((resolve) => {
        firstFrame = resolve;
      });
      cdp.on('Page.screencastFrame', (frame) => {
        const { timestamp } = frame.metadata;
        const ref = {
          page,
          id: `f${++this.frameSequence}`,
          at: timestamp === undefined ? Date.now() : timestamp * 1000,
          hasCaptureTimestamp: timestamp !== undefined,
          data: frame.data,
          viewport: {
            width: frame.metadata.deviceWidth,
            height: frame.metadata.deviceHeight,
            scrollX: frame.metadata.scrollOffsetX,
            scrollY: frame.metadata.scrollOffsetY,
          },
          compatibleViewport:
            frame.metadata.offsetTop === 0 &&
            frame.metadata.pageScaleFactor === 1 &&
            timestamp !== undefined,
        };
        this.latest = ref;
        this.frames.push(ref);
        firstFrame();
        this.trimFrames();
        void cdp
          .send('Page.screencastFrameAck', { sessionId: frame.sessionId })
          .catch(() => undefined);
      });
      await cdp.send('Page.startScreencast', {
        format: 'jpeg',
        quality: 70,
        everyNthFrame: 1,
      });
      // A static page may produce no further frame until the first user input.
      await Promise.race([ready, new Promise((done) => setTimeout(done, 500))]);
    } catch {
      throw new Error('Web recording requires Chromium screencast support');
    }
  }

  private trimFrames() {
    const max = this.options.maxFrames ?? 600;
    // Drop unreferenced frames older than two seconds; screencast only emits on change.
    const cutoff = Date.now() - 2000;
    for (
      let index = 0;
      index < this.frames.length && this.frames.length > 8;
    ) {
      const frame = this.frames[index];
      if (
        frame.at < cutoff &&
        !this.keep.has(frame.id) &&
        frame !== this.latest
      )
        this.frames.splice(index, 1);
      else index++;
    }
    while (this.frames.length > max) {
      const index = this.frames.findIndex(
        (frame) => frame !== this.latest && !this.keep.has(frame.id),
      );
      if (index < 0) break;
      this.frames.splice(index, 1);
    }
  }

  /** Latest frame at or before a timestamp: the UI the user acted on. */
  private frameBefore(at: number, page: Page, probeStartedAt?: number) {
    const frame = this.frames.findLast(
      (item) =>
        item.at <= at &&
        item.page === page &&
        (probeStartedAt === undefined ||
          (item.hasCaptureTimestamp && item.at >= probeStartedAt)),
    );
    if (!frame) return undefined;
    this.keep.add(frame.id);
    return frame.id;
  }

  private receive(batch: ProbeEvent[], page: Page) {
    if (this.stopped) return;
    for (const raw of batch) this.accept(raw, page);
  }

  private accept(raw: ProbeEvent, page: Page) {
    const { frame, probeStartedAt, settle, redactionGeometry, ...event } = raw;
    const sample: {
      target?: TargetSample;
      state?: StateSample & { secret?: boolean };
    } = {
      target: event.target as TargetSample | undefined,
      state: event.state as StateSample | undefined,
    };
    if (sample.state?.secret || sample.target?.secret) {
      // Replace secret values with a parameter placeholder; keep the original only locally.
      const name = this.secretName(sample.target?.key ?? event.id);
      if (sample.state) {
        sample.state.value = `{{${name}}}`;
      }
      if (sample.target) sample.target.secret = true;
    }
    const traced = {
      ...event,
      ...(sample.target ? { target: sample.target } : {}),
      ...(sample.state ? { state: sample.state } : {}),
    } as TraceEvent;
    // The browser may deliver the input before a frame from the new
    // document. Keep the action even when its pre-action image is unavailable.
    if (frame && probeStartedAt !== undefined)
      (traced as { before?: string }).before = this.frameBefore(
        event.t,
        page,
        probeStartedAt,
      );
    if (
      (traced.type === 'pointer' && traced.phase === 'down') ||
      traced.type === 'key'
    ) {
      this.actionPages.add(page);
      this.activate(page, traced.t);
    }
    if (settle && traced.type === 'effect') {
      // Pin the image at effect close while the short screencast buffer is live.
      // stop() bounds it against subsequent inputs, including batched probe events.
      traced.after = this.frameBefore(event.t, page);
    }
    if (sample.target?.secret && sample.target.rect && redactionGeometry)
      this.addRedaction(page, {
        ...redactionGeometry,
        at: event.t,
        rects: [sample.target.rect],
      });
    this.events.push(traced);
    this.eventPages.set(traced.id, page);
  }

  private addRedaction(page: Page, sample: RedactionSample) {
    let samples = this.redactions.get(page);
    if (!samples) {
      samples = [];
      this.redactions.set(page, samples);
    }
    samples.push(sample);
  }

  private redactionSnapshot(page: Page) {
    return page.evaluate(
      /* istanbul ignore next -- browser realm has no host coverage counters */
      (key) => {
        const probe = (
          window as never as Record<string, { secretRects(): Rect[] }>
        )[key];
        if (!probe) return undefined;
        return {
          documentStart: performance.timeOrigin,
          at: performance.timeOrigin + performance.now(),
          width: innerWidth,
          height: innerHeight,
          scrollX,
          scrollY,
          rects: probe.secretRects(),
          visualScale: visualViewport?.scale ?? 1,
        };
      },
      this.key,
    );
  }

  private async observeRedaction(page: Page) {
    // A navigation or popup close can destroy the just-observed document.
    // Historical samples still protect its frames through the transition.
    const sample = await this.redactionSnapshot(page).catch(() => undefined);
    if (sample) this.addRedaction(page, sample);
  }

  private frameMasks(frame: FrameRef): Rect[] | null {
    if (frame.exactMasks !== undefined) return frame.exactMasks;
    const samples = this.redactions.get(frame.page);
    if (!samples?.length) return [];
    const active = samples.findLast((sample) => sample.at <= frame.at);
    const next = samples.find((sample) => sample.at > frame.at);
    // The document can appear in a screencast before its first observation.
    // Cover both possibilities during the navigation interval.
    const possible = new Set([active?.documentStart]);
    if (next && (!active || next.documentStart <= frame.at))
      possible.add(next.documentStart);
    const masks = samples.filter(
      (sample) =>
        sample.rects.length &&
        (!frame.compatibleViewport || possible.has(sample.documentStart)),
    );
    if (
      masks.some(
        (sample) =>
          !frame.compatibleViewport || !sameViewport(sample, frame.viewport),
      )
    )
      return null; // Geometry is uncertain, so redact the entire frame.
    return masks.flatMap((sample) => sample.rects);
  }

  private secretName(key: string) {
    let name = this.secretNames.get(key);
    if (!name) {
      name = this.secretNames.size
        ? `secret${this.secretNames.size + 1}`
        : 'secret';
      this.secretNames.set(key, name);
    }
    return name;
  }

  private activate(page: Page, at: number) {
    if (page.isClosed() || at < this.activeAt) return;
    this.page = page;
    this.activeAt = at;
  }

  private note(page: Page, kind: 'navigated' | 'dialog') {
    return page
      .evaluate(
        /* istanbul ignore next -- browser realm has no host coverage counters */
        ({ key, kind }) =>
          (window as never as Record<string, { note(kind: string): void }>)[
            key
          ]?.note(kind),
        { key: this.key, kind },
      )
      .catch(() => undefined);
  }

  private recordScreen(
    screen: string,
    reason: Extract<TraceEvent, { type: 'screen' }>['reason'],
    actionPage?: Page,
  ) {
    if (actionPage && this.actionPages.has(actionPage))
      void this.note(actionPage, 'navigated');
    this.events.push({
      type: 'screen',
      id: this.id(),
      t: Date.now(),
      screen,
      reason,
    });
  }

  /** Remove the recorder from its pages, leaving the caller's browser open. */
  async dispose() {
    if (this.stopped) return;
    this.stopped = true;
    for (const off of this.listeners) off();
    await Promise.allSettled(this.pendingPages);
    await Promise.allSettled(this.pendingRedactions);
    // Remove future-document hooks before clearing probes in current documents.
    await Promise.allSettled(
      this.instrumentation.map((handle) => handle.dispose()),
    );
    await Promise.allSettled([
      ...Array.from(this.pages, (page) =>
        page.evaluate(
          /* istanbul ignore next -- browser realm has no host coverage counters */
          (key) =>
            (window as never as Record<string, { dispose(): void }>)[
              key
            ]?.dispose(),
          this.key,
        ),
      ),
      ...this.cdps.map(async (cdp) => {
        await cdp.send('Page.stopScreencast').catch(() => undefined);
        await cdp.detach();
      }),
    ]);
  }

  private async captureEnd(): Promise<TraceMeta['end']> {
    while (!this.page.isClosed()) {
      const page = this.page;
      const at = Date.now();
      const screen = page.url();
      try {
        const before = await this.redactionSnapshot(page);
        const data = (
          await page.screenshot({ type: 'jpeg', quality: 80 })
        ).toString('base64');
        const after = await this.redactionSnapshot(page);
        if (page.isClosed()) continue;
        // A field may be populated without an input event (for example,
        // autofill). Its terminal viewport rectangles also cover compatible
        // historical frames in this same document.
        if (before) this.addRedaction(page, before);
        if (after) this.addRedaction(page, after);
        if (
          page.url() !== screen ||
          (before && after && before.documentStart !== after.documentStart)
        )
          throw new Error(
            'Navigation changed during final capture; finish recording after navigation settles',
          );
        if (this.page !== page) continue;
        const frame = `f${++this.frameSequence}`;
        const stable =
          before &&
          after &&
          before.visualScale === 1 &&
          after.visualScale === 1 &&
          sameViewport(before, after);
        const viewport = before ?? {
          width: 0,
          height: 0,
          scrollX: 0,
          scrollY: 0,
        };
        this.frames.push({
          page,
          id: frame,
          at,
          data,
          viewport,
          compatibleViewport: !!stable,
          // A terminal sample with no reliable geometry must be covered even
          // when there were no earlier secret events on this page.
          exactMasks: stable ? [...before.rects, ...after.rects] : null,
        });
        this.keep.add(frame);
        return { screen, frame, at };
      } catch (error) {
        if (!page.isClosed()) throw error;
      }
    }
    return undefined;
  }

  /** Stop recording and write the trace directory. Returns its path. */
  async stop(directory: string): Promise<string> {
    if (this.stopped) throw new Error('Recorder already stopped');
    await Promise.all(this.pendingPages);
    await Promise.all(
      [...this.pages]
        .filter((page) => !page.isClosed())
        .map(async (page) => {
          const drained = (await page
            .evaluate(
              /* istanbul ignore next -- browser realm has no host coverage counters */
              (key) =>
                (window as never as Record<string, { drain(): unknown[] }>)[
                  key
                ]?.drain() ?? [],
              this.key,
            )
            .catch(() => [])) as ProbeEvent[];
          for (const raw of drained) this.accept(raw, page);
        }),
    );
    await new Promise((done) => setTimeout(done, 200));
    const end = await this.captureEnd();
    await this.dispose();
    for (const samples of this.redactions.values())
      samples.sort((a, b) => a.at - b.at);
    const root = resolve(directory);
    mkdirSync(join(root, 'frames'), { recursive: true });
    const frames: Record<string, string> = {};
    const frameTimes: Record<string, number> = {};
    const events = this.events.sort((a, b) => a.t - b.t);
    const effects = new Map(
      events.flatMap((event) =>
        event.type === 'effect' ? [[event.of, event] as const] : [],
      ),
    );
    let nextInput = Number.POSITIVE_INFINITY;
    for (const event of [...events].reverse()) {
      if (
        event.type === 'effect' ||
        event.type === 'screen' ||
        event.type === 'dialog' ||
        event.type === 'move' ||
        (event.type === 'pointer' && event.phase === 'up') ||
        (event.type === 'edit' && event.phase === 'end')
      )
        continue;
      const effect = effects.get(event.id);
      if (effect) {
        const frame = this.frames.findLast(
          (item) =>
            item.page === this.eventPages.get(event.id) &&
            item.at > event.t &&
            item.at <= effect.t &&
            item.at < nextInput,
        );
        effect.after = frame?.id;
      }
      nextInput = event.t;
    }
    // During collection `keep` pins candidate frames through eviction. An
    // effect's final selection can replace a pinned candidate, so publish
    // only frames still referenced by the finished trace.
    const referenced = new Set(
      events.flatMap((event) => [
        event.before,
        event.type === 'effect' ? event.after : undefined,
      ]),
    );
    if (end) referenced.add(end.frame);
    for (const frame of this.frames) {
      if (!referenced.has(frame.id)) continue;
      const path = `frames/${frame.id}.jpg`;
      const bytes = Buffer.from(frame.data, 'base64');
      writeFileSync(
        join(root, path),
        await maskSecrets(bytes, this.frameMasks(frame), frame.viewport),
      );
      frames[frame.id] = path;
      frameTimes[frame.id] = frame.at;
    }
    const trace: Trace = {
      meta: {
        version: TRACE_VERSION,
        id: randomUUID(),
        platform: 'web',
        capture: 'native',
        start: { screen: this.startScreen, size: this.startSize },
        startedAt: this.startedAt,
        collector: '@midscene/replay web-probe 1',
        ...(end && { end }),
        frameTimes,
      },
      events,
      frames,
    };
    writeJsonFile(join(root, 'trace.json'), trace.meta);
    writeFileSync(
      join(root, 'events.jsonl'),
      `${events.map((event) => JSON.stringify(event)).join('\n')}\n`,
    );
    writeJsonFile(join(root, 'frames.json'), frames);
    return root;
  }
}

function sameViewport(a: Viewport, b: Viewport) {
  return (
    a.width === b.width &&
    a.height === b.height &&
    Math.abs(a.scrollX - b.scrollX) < 1 &&
    Math.abs(a.scrollY - b.scrollY) < 1
  );
}

/** Mask secret field areas in the captured frame. */
async function maskSecrets(
  bytes: Buffer,
  rects: Rect[] | null,
  viewport: Viewport,
): Promise<Buffer> {
  if (rects?.length === 0) return bytes;
  const { default: sharp } = await import('sharp');
  const image = sharp(bytes);
  const { width, height } = await image.metadata();
  const scaleX = width / viewport.width;
  const scaleY = height / viewport.height;
  const rectsInPixels =
    !rects || !Number.isFinite(scaleX) || !Number.isFinite(scaleY)
      ? [{ x: 0, y: 0, width, height }]
      : rects.map((rect) => {
          const x = Math.max(0, Math.floor(rect.x * scaleX));
          const y = Math.max(0, Math.floor(rect.y * scaleY));
          return {
            x,
            y,
            width:
              Math.min(width, Math.ceil((rect.x + rect.width) * scaleX)) - x,
            height:
              Math.min(height, Math.ceil((rect.y + rect.height) * scaleY)) - y,
          };
        });
  const overlays = rectsInPixels
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .map(({ x, y, width, height }) => ({
      input: {
        create: { width, height, channels: 3 as const, background: '#808080' },
      },
      left: x,
      top: y,
    }));
  if (!overlays.length) return bytes;
  return image.composite(overlays).jpeg().toBuffer();
}
