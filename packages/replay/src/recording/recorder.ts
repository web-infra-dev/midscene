import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { CDPSession, Dialog, Disposable, Frame, Page } from 'playwright';
import { writeJsonFile } from '../io';
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
  /** Maximum frames kept in memory and written. */
  maxFrames?: number;
  /** Answer for dialogs raised while recording. */
  onDialog?: (dialog: { type: string; message: string }) => Promise<{
    accept: boolean;
    text?: string;
  }>;
}

interface FrameRef {
  page: Page;
  id: string;
  at: number;
  hasCaptureTimestamp?: boolean;
  data: string | Buffer;
}

/** Browser events with recorder-only frame metadata. */
type ProbeEvent = TraceEvent & {
  frame?: boolean;
  probeStartedAt?: number;
  settle?: boolean;
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
    const { frame, probeStartedAt, settle, ...traced } = raw;
    // The browser may deliver the input before a frame from the new
    // document. Keep the action even when its pre-action image is unavailable.
    if (frame && probeStartedAt !== undefined)
      traced.before = this.frameBefore(traced.t, page, probeStartedAt);
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
      traced.after = this.frameBefore(traced.t, page);
    }
    this.events.push(traced);
    this.eventPages.set(traced.id, page);
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
        const documentStart = await page.evaluate('performance.timeOrigin');
        const data = await page.screenshot({ type: 'jpeg', quality: 80 });
        const currentDocumentStart = await page.evaluate(
          'performance.timeOrigin',
        );
        if (page.isClosed()) continue;
        if (page.url() !== screen || documentStart !== currentDocumentStart)
          throw new Error(
            'Navigation changed during final capture; finish recording after navigation settles',
          );
        if (this.page !== page) continue;
        const frame = `f${++this.frameSequence}`;
        this.frames.push({ page, id: frame, at, data });
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
      writeFileSync(join(root, path), frame.data, 'base64');
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
