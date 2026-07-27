import { createHash } from 'node:crypto';
import type {
  AndroidAccessibilitySnapshot,
  AndroidAgent,
  AndroidAuditOverlay,
  AndroidAuditReplaySummary,
  AndroidAuditTreeNode,
  AndroidAuditVisualElement,
  AndroidAuditVisualElementInput,
  AndroidLiveTreeAudit,
} from '@midscene/android';
import {
  buildAndroidLiveTreeAudit,
  buildAndroidVisualAudit,
} from '@midscene/android';
import { getDebug } from '@midscene/shared/logger';
import type { Application, Request, Response } from 'express';
import express from 'express';
import {
  type AndroidAuditDownloadBundle,
  type AndroidAuditExportResult,
  writeAndroidAuditExportWithDownload,
} from './android-audit-export';

const debugAudit = getDebug('android:playground:audit');
const warnAudit = getDebug('android:playground:audit', { console: true });

const DEFAULT_CAPTURE_INTERVAL_MS = 1_000;
const MAX_VISUAL_SCAN_ELEMENTS = 60;

export interface AndroidAuditSnapshotSummary {
  captureId: string;
  capturedAt: string;
  dpr: number;
  durationMs: number;
  logicalSize: { width: number; height: number };
  rotation: number;
  source: 'yadb' | 'uiautomator';
}

export interface AndroidAuditState {
  deviceId?: string;
  enabled: boolean;
  error?: string;
  errorDetail?: string;
  overlays: AndroidAuditOverlay[];
  replay: AndroidAuditReplaySummary;
  revisit?: {
    baselineCaptureId: string;
    replay?: AndroidAuditReplaySummary;
    status: 'baseline-ready' | 'verifying' | 'verified';
    verifiedCaptureId?: string;
  };
  revision: number;
  lastExport?: AndroidAuditExportResult;
  source?: AndroidAuditSnapshotSummary;
  status: 'idle' | 'capturing' | 'ready' | 'error';
  treeNodes: AndroidAuditTreeNode[];
  updatedAt?: string;
  visualElements: AndroidAuditVisualElement[];
  visualScan: {
    automatic?: boolean;
    error?: string;
    status: 'idle' | 'scanning' | 'ready' | 'error';
    updatedAt?: string;
  };
}

export interface AndroidAuditDevice {
  captureAccessibilitySnapshot(): Promise<AndroidAccessibilitySnapshot>;
  screenshotBase64(): Promise<string>;
}

export interface AndroidAuditSessionOptions {
  autoVisualScan?: boolean;
  captureIntervalMs?: number;
}

function emptyReplay(): AndroidAuditReplaySummary {
  return { attempted: 0, hits: 0, misses: 0, wrongMappings: 0 };
}

function emptyState(deviceId?: string): AndroidAuditState {
  return {
    deviceId,
    enabled: false,
    overlays: [],
    replay: emptyReplay(),
    revision: 0,
    status: 'idle',
    treeNodes: [],
    visualElements: [],
    visualScan: { status: 'idle' },
  };
}

function snapshotSummary(
  snapshot: AndroidAccessibilitySnapshot,
): AndroidAuditSnapshotSummary {
  return {
    captureId: snapshot.captureId,
    capturedAt: snapshot.capturedAt,
    dpr: snapshot.dpr,
    durationMs: snapshot.durationMs,
    logicalSize: snapshot.logicalSize,
    rotation: snapshot.rotation,
    source: snapshot.source,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function hashRecords(records: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(records)).digest('hex');
}

function treeFingerprint(
  snapshot: AndroidAccessibilitySnapshot,
  includeBounds: boolean,
): string {
  const records: unknown[] = [
    snapshot.rotation,
    snapshot.logicalSize.width,
    snapshot.logicalSize.height,
  ];
  const visit = (node: AndroidAccessibilitySnapshot['root']) => {
    const resourceId = node.attrs['resource-id'] || '';
    const webRole =
      node.attrs['chrome-role'] ||
      node.attrs.chromeRole ||
      node.attrs.role ||
      '';
    if (
      includeBounds ||
      resourceId ||
      webRole ||
      node.type.toLowerCase().includes('webview')
    ) {
      records.push([
        node.type,
        node.attrs.package || '',
        resourceId,
        webRole,
        ...(includeBounds
          ? [
              Math.round(node.bounds.left),
              Math.round(node.bounds.top),
              Math.round(node.bounds.width),
              Math.round(node.bounds.height),
            ]
          : []),
      ]);
    }
    node.children.forEach(visit);
  };
  visit(snapshot.root);
  return hashRecords(records);
}

function pageIdentityFingerprint(
  snapshot: AndroidAccessibilitySnapshot,
): string {
  return treeFingerprint(snapshot, false);
}

function pageLayoutFingerprint(snapshot: AndroidAccessibilitySnapshot): string {
  return treeFingerprint(snapshot, true);
}

function needsWebViewVisualInventory(audit: AndroidLiveTreeAudit): boolean {
  return audit.treeNodes.some((node) =>
    node.type.toLowerCase().includes('webview'),
  );
}

function accessibilityCaptureError(detail: string): string {
  if (
    detail.includes('uiautomator') &&
    (detail.includes('code 137') ||
      detail.includes('No such file or directory'))
  ) {
    return 'Accessibility tree capture failed and live retries were paused automatically. YADB and UIAutomator could not establish a UiAutomation session. Another automation process, such as Maestro or Appium, may be holding the device. Release it, then click Recapture to resume live auditing.';
  }
  return 'Accessibility tree capture failed and live retries were paused automatically. Resolve the device error, then click Recapture to resume live auditing.';
}

function mergeVisualAndTreeOverlays(
  treeAudit: AndroidLiveTreeAudit,
  visualAudit: ReturnType<typeof buildAndroidVisualAudit> | null,
): AndroidAuditOverlay[] {
  if (!visualAudit) return treeAudit.overlays;
  return visualAudit.overlays;
}

export class AndroidAuditSessionController {
  private activeCaptureToken: object | null = null;
  private agent: Pick<AndroidAgent, 'aiLocate' | 'aiQuery'> | null = null;
  private autoVisualScanAttemptedPageFingerprint: string | null = null;
  private autoVisualScanEnabled: boolean;
  private autoVisualScanTimer: NodeJS.Timeout | null = null;
  private captureIntervalMs: number;
  private capturePromise: Promise<AndroidAuditState> | null = null;
  private device: AndroidAuditDevice | null = null;
  private generation = 0;
  private latestSnapshot: AndroidAccessibilitySnapshot | null = null;
  private latestPageFingerprint: string | null = null;
  private latestTreeAudit: AndroidLiveTreeAudit | null = null;
  private previousTreeNodes: AndroidAuditTreeNode[] = [];
  private revisitBaseline: {
    snapshot: AndroidAccessibilitySnapshot;
    treeNodes: AndroidAuditTreeNode[];
  } | null = null;
  private revisitSnapshot: AndroidAccessibilitySnapshot | null = null;
  private state = emptyState();
  private subscribers = new Set<Response>();
  private timer: NodeJS.Timeout | null = null;
  private visualInputs: AndroidAuditVisualElementInput[] = [];
  private visualInputsLayoutFingerprint: string | null = null;
  private visualScanPromise: Promise<AndroidAuditState> | null = null;

  constructor(options: AndroidAuditSessionOptions = {}) {
    this.autoVisualScanEnabled = options.autoVisualScan ?? false;
    this.captureIntervalMs =
      options.captureIntervalMs ?? DEFAULT_CAPTURE_INTERVAL_MS;
  }

  attachDevice(
    deviceId: string,
    device: AndroidAuditDevice,
    agent?: Pick<AndroidAgent, 'aiLocate' | 'aiQuery'>,
  ): void {
    const resume = this.state.enabled;
    this.clearTimer();
    this.clearAutoVisualScanTimer();
    this.generation++;
    this.activeCaptureToken = null;
    this.capturePromise = null;
    this.device = device;
    this.agent = agent ?? null;
    this.latestSnapshot = null;
    this.latestPageFingerprint = null;
    this.latestTreeAudit = null;
    this.previousTreeNodes = [];
    this.revisitBaseline = null;
    this.revisitSnapshot = null;
    this.visualInputs = [];
    this.visualInputsLayoutFingerprint = null;
    this.visualScanPromise = null;
    this.autoVisualScanAttemptedPageFingerprint = null;
    this.state = { ...emptyState(deviceId), enabled: resume };
    this.emitState();
    if (resume) this.scheduleCapture(0);
  }

  detachDevice(): void {
    this.clearTimer();
    this.clearAutoVisualScanTimer();
    this.generation++;
    this.activeCaptureToken = null;
    this.capturePromise = null;
    this.device = null;
    this.agent = null;
    this.latestSnapshot = null;
    this.latestPageFingerprint = null;
    this.latestTreeAudit = null;
    this.previousTreeNodes = [];
    this.revisitBaseline = null;
    this.revisitSnapshot = null;
    this.visualInputs = [];
    this.visualInputsLayoutFingerprint = null;
    this.visualScanPromise = null;
    this.autoVisualScanAttemptedPageFingerprint = null;
    this.state = emptyState();
    this.emitState();
  }

  getState(): AndroidAuditState {
    return this.state;
  }

  getLatestSnapshot(): AndroidAccessibilitySnapshot | null {
    return this.latestSnapshot;
  }

  async start(): Promise<AndroidAuditState> {
    if (!this.device) {
      throw new Error('No Android device session is connected');
    }
    this.state = {
      ...this.state,
      enabled: true,
      error: undefined,
      errorDetail: undefined,
    };
    this.emitState();
    return this.captureNow();
  }

  pause(): AndroidAuditState {
    this.clearTimer();
    this.state = { ...this.state, enabled: false };
    this.emitState();
    return this.state;
  }

  async setRevisitBaseline(): Promise<AndroidAuditState> {
    if (!this.device) {
      throw new Error('No Android device session is connected');
    }
    if (!this.latestSnapshot) await this.captureNow();
    if (!this.latestSnapshot) {
      throw new Error('Unable to capture a revisit baseline');
    }
    this.revisitBaseline = {
      snapshot: this.latestSnapshot,
      treeNodes: this.previousTreeNodes,
    };
    this.revisitSnapshot = null;
    this.state = {
      ...this.state,
      revisit: {
        baselineCaptureId: this.latestSnapshot.captureId,
        status: 'baseline-ready',
      },
      revision: this.state.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    this.emitState();
    return this.state;
  }

  async verifyRevisit(): Promise<AndroidAuditState> {
    if (!this.revisitBaseline) {
      throw new Error('Set a revisit baseline before verifying revisit');
    }
    this.state = {
      ...this.state,
      revisit: {
        baselineCaptureId: this.revisitBaseline.snapshot.captureId,
        status: 'verifying',
      },
    };
    this.emitState();
    const previousSnapshot = this.latestSnapshot;
    await this.captureNow();
    if (
      !this.latestSnapshot ||
      this.latestSnapshot === previousSnapshot ||
      this.state.status !== 'ready'
    ) {
      this.state = {
        ...this.state,
        revisit: {
          baselineCaptureId: this.revisitBaseline.snapshot.captureId,
          status: 'baseline-ready',
        },
        revision: this.state.revision + 1,
        updatedAt: new Date().toISOString(),
      };
      this.emitState();
      throw new Error(
        this.state.errorDetail || 'Unable to capture the revisit tree',
      );
    }
    const revisitAudit = buildAndroidLiveTreeAudit(
      this.latestSnapshot.root,
      this.latestSnapshot.logicalSize,
      this.revisitBaseline.treeNodes,
    );
    this.revisitSnapshot = this.latestSnapshot;
    this.state = {
      ...this.state,
      revisit: {
        baselineCaptureId: this.revisitBaseline.snapshot.captureId,
        replay: revisitAudit.replay,
        status: 'verified',
        verifiedCaptureId: this.latestSnapshot.captureId,
      },
      revision: this.state.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    this.emitState();
    return this.state;
  }

  async scanVisualElements(
    options: {
      automatic?: boolean;
    } = {},
  ): Promise<AndroidAuditState> {
    if (this.visualScanPromise) return this.visualScanPromise;
    const visualScanPromise = this.runVisualScan(Boolean(options.automatic));
    this.visualScanPromise = visualScanPromise;
    try {
      return await visualScanPromise;
    } finally {
      if (this.visualScanPromise === visualScanPromise) {
        this.visualScanPromise = null;
      }
    }
  }

  private async runVisualScan(automatic: boolean): Promise<AndroidAuditState> {
    if (!this.device || !this.agent) {
      throw new Error('No Android Agent session is connected');
    }
    if (!this.latestSnapshot || !this.latestTreeAudit) await this.captureNow();
    if (!this.latestSnapshot || !this.latestTreeAudit) {
      throw new Error(
        this.state.errorDetail || 'Unable to capture a tree for visual scan',
      );
    }
    const generation = this.generation;
    const device = this.device;
    const agent = this.agent;
    const scanPageFingerprint = pageIdentityFingerprint(this.latestSnapshot);
    const scanLayoutFingerprint = pageLayoutFingerprint(this.latestSnapshot);
    this.clearTimer();
    this.state = {
      ...this.state,
      ...(automatic ? {} : { error: undefined }),
      visualScan: { automatic, status: 'scanning' },
    };
    this.emitState();

    try {
      const suggestions = await agent.aiQuery<unknown>(
        automatic
          ? '{name: string, description: string, rect: {left: number, top: number, width: number, height: number}}[], list every visible interactive control on the current screenshot. Return each bounding rectangle in a normalized 0-1000 coordinate system: (0, 0) is the screenshot top-left and (1000, 1000) is the bottom-right. Return the full tappable region instead of a child icon or text label. Treat adjacent labels, values, and chevrons that trigger one action as one control, and do not emit their children separately. Include buttons, links, tabs, inputs, toggles, icons with click actions, and floating controls. Exclude non-interactive video content, decorations, and bullet comments. Give repeated controls a position-specific unique description.'
          : '{name: string, description: string}[], list every visible interactive control on the current screenshot. Include buttons, links, tabs, inputs, toggles, icons with click actions, and floating controls. Exclude non-interactive video content, decorations, and bullet comments. Give repeated controls a position-specific unique description.',
        { domIncluded: false, screenshotIncluded: true },
      );
      if (generation !== this.generation || device !== this.device) {
        throw new Error('Android device changed during the visual scan');
      }
      if (!Array.isArray(suggestions)) {
        throw new Error('AI visual scan did not return an element list');
      }
      const normalized = suggestions
        .map((suggestion) => {
          if (!suggestion || typeof suggestion !== 'object') return null;
          const record = suggestion as Record<string, unknown>;
          const name =
            typeof record.name === 'string' ? record.name.trim() : '';
          const description =
            typeof record.description === 'string'
              ? record.description.trim()
              : name;
          const rawRect =
            record.rect && typeof record.rect === 'object'
              ? (record.rect as Record<string, unknown>)
              : null;
          const rect =
            rawRect &&
            ['left', 'top', 'width', 'height'].every((key) =>
              Number.isFinite(rawRect[key]),
            )
              ? {
                  left: Number(rawRect.left),
                  top: Number(rawRect.top),
                  width: Number(rawRect.width),
                  height: Number(rawRect.height),
                }
              : undefined;
          return name && description ? { name, description, rect } : null;
        })
        .filter(
          (
            suggestion,
          ): suggestion is {
            name: string;
            description: string;
            rect:
              | {
                  left: number;
                  top: number;
                  width: number;
                  height: number;
                }
              | undefined;
          } => Boolean(suggestion),
        )
        .slice(0, MAX_VISUAL_SCAN_ELEMENTS);
      if (normalized.length === 0) {
        throw new Error('AI visual scan found no visible interactive controls');
      }

      const inputs: AndroidAuditVisualElementInput[] = [];
      for (const [index, suggestion] of normalized.entries()) {
        let rect:
          | {
              left: number;
              top: number;
              width: number;
              height: number;
            }
          | undefined;
        if (automatic && suggestion.rect) {
          const logicalSize = this.latestSnapshot?.logicalSize;
          if (!logicalSize) {
            throw new Error(
              'The Accessibility snapshot disappeared during the visual scan',
            );
          }
          rect = {
            left: (suggestion.rect.left / 1000) * logicalSize.width,
            top: (suggestion.rect.top / 1000) * logicalSize.height,
            width: (suggestion.rect.width / 1000) * logicalSize.width,
            height: (suggestion.rect.height / 1000) * logicalSize.height,
          };
        } else if (automatic) {
          warnAudit(
            `Automatic visual scan omitted a rectangle for "${suggestion.description}"`,
          );
          continue;
        } else {
          try {
            const located = (await agent.aiLocate(suggestion.description, {
              cacheable: false,
            })) as {
              dpr?: number;
              rect?: {
                left: number;
                top: number;
                width: number;
                height: number;
              };
            };
            if (located.rect) {
              const dpr = located.dpr || this.latestSnapshot?.dpr || 1;
              rect = {
                left: located.rect.left / dpr,
                top: located.rect.top / dpr,
                width: located.rect.width / dpr,
                height: located.rect.height / dpr,
              };
            }
          } catch (error) {
            warnAudit(
              `Unable to locate visual control "${suggestion.description}": ${errorMessage(error)}`,
            );
            continue;
          }
        }
        if (generation !== this.generation || device !== this.device) {
          throw new Error('Android device changed during the visual scan');
        }
        if (!rect) continue;
        if (
          !Number.isFinite(rect.left) ||
          !Number.isFinite(rect.top) ||
          !Number.isFinite(rect.width) ||
          !Number.isFinite(rect.height) ||
          rect.width <= 0 ||
          rect.height <= 0
        ) {
          continue;
        }
        inputs.push({
          description: suggestion.description,
          id: `ai-${Date.now()}-${index + 1}`,
          name: suggestion.name,
          rect,
          rectSource: 'ai',
        });
      }
      if (inputs.length === 0) {
        throw new Error(
          'AI visual scan could not locate any control rectangles',
        );
      }

      this.visualInputs = inputs;
      this.visualInputsLayoutFingerprint = scanLayoutFingerprint;
      const previousSnapshot = this.latestSnapshot;
      await this.captureNow();
      if (
        !this.latestSnapshot ||
        this.latestSnapshot === previousSnapshot ||
        this.state.status !== 'ready'
      ) {
        throw new Error(
          this.state.errorDetail ||
            'Unable to capture a fresh tree after the visual scan',
        );
      }
      if (
        this.latestPageFingerprint !== scanPageFingerprint ||
        this.visualInputs.length === 0 ||
        this.visualInputsLayoutFingerprint !== scanLayoutFingerprint
      ) {
        throw new Error(
          'The Android page changed during the visual scan; stale visual boxes were discarded',
        );
      }
      this.state = {
        ...this.state,
        revision: this.state.revision + 1,
        updatedAt: new Date().toISOString(),
        visualScan: {
          automatic,
          status: 'ready',
          updatedAt: new Date().toISOString(),
        },
      };
      this.emitState();
      return this.state;
    } catch (error) {
      const message = errorMessage(error);
      const captureFailed =
        this.state.status === 'error' && Boolean(this.state.errorDetail);
      this.state = {
        ...this.state,
        error: automatic
          ? this.state.error
          : captureFailed
            ? this.state.error
            : message,
        errorDetail: captureFailed ? this.state.errorDetail : undefined,
        revision: this.state.revision + 1,
        updatedAt: new Date().toISOString(),
        visualScan: {
          automatic,
          error: message,
          status: 'error',
          updatedAt: new Date().toISOString(),
        },
      };
      this.emitState();
      throw error;
    } finally {
      if (this.state.enabled) this.scheduleCapture(this.captureIntervalMs);
    }
  }

  async setVisualElements(
    inputs: AndroidAuditVisualElementInput[],
  ): Promise<AndroidAuditState> {
    if (!this.device || !this.latestSnapshot || !this.latestTreeAudit) {
      throw new Error(
        'Capture an Accessibility tree before adding visual elements',
      );
    }
    if (this.capturePromise) await this.capturePromise;
    this.clearTimer();
    const generation = this.generation;
    const device = this.device;
    try {
      if (generation !== this.generation || device !== this.device) {
        throw new Error('Android device changed while adding visual elements');
      }
      const visualAudit = buildAndroidVisualAudit(
        this.latestSnapshot.root,
        this.latestSnapshot.logicalSize,
        this.latestTreeAudit,
        inputs,
      );
      this.visualInputs = inputs;
      this.visualInputsLayoutFingerprint = inputs.length
        ? pageLayoutFingerprint(this.latestSnapshot)
        : null;
      if (!inputs.length) {
        this.autoVisualScanAttemptedPageFingerprint = null;
      }
      this.state = {
        ...this.state,
        overlays: mergeVisualAndTreeOverlays(
          this.latestTreeAudit,
          inputs.length ? visualAudit : null,
        ),
        revision: this.state.revision + 1,
        updatedAt: new Date().toISOString(),
        visualElements: visualAudit.visualElements,
        visualScan: inputs.length
          ? { status: 'ready', updatedAt: new Date().toISOString() }
          : { status: 'idle' },
      };
      this.emitState();
      return this.state;
    } finally {
      if (
        generation === this.generation &&
        device === this.device &&
        this.state.enabled
      ) {
        this.scheduleCapture(this.captureIntervalMs);
      }
    }
  }

  async exportReport(): Promise<AndroidAuditDownloadBundle> {
    if (!this.device || !this.state.deviceId) {
      throw new Error('No Android device session is connected');
    }
    if (this.capturePromise) await this.capturePromise;
    this.clearTimer();
    const generation = this.generation;
    const device = this.device;
    const deviceId = this.state.deviceId;
    this.state = {
      ...this.state,
      error: undefined,
      errorDetail: undefined,
      status: 'capturing',
    };
    this.emitState();

    try {
      const source = await device.captureAccessibilitySnapshot();
      const screenshotBase64 = await device.screenshotBase64();
      const fresh = await device.captureAccessibilitySnapshot();
      if (generation !== this.generation || device !== this.device) {
        throw new Error('Android device changed while exporting the audit');
      }
      const sourceAudit = buildAndroidLiveTreeAudit(
        source.root,
        source.logicalSize,
      );
      const freshAudit = buildAndroidLiveTreeAudit(
        fresh.root,
        fresh.logicalSize,
        sourceAudit.treeNodes,
      );
      const freshVisualAudit = this.visualInputs.length
        ? buildAndroidVisualAudit(
            fresh.root,
            fresh.logicalSize,
            freshAudit,
            this.visualInputs,
          )
        : null;
      const { download, result } = await writeAndroidAuditExportWithDownload({
        deviceId,
        fresh,
        overlays: mergeVisualAndTreeOverlays(freshAudit, freshVisualAudit),
        replay: freshAudit.replay,
        screenshotBase64,
        source,
        treeNodes: sourceAudit.treeNodes,
        visualElements: freshVisualAudit?.visualElements ?? [],
        ...(this.revisitBaseline &&
        this.revisitSnapshot &&
        this.state.revisit?.replay
          ? {
              revisit: {
                replay: this.state.revisit.replay,
                snapshot: this.revisitSnapshot,
              },
            }
          : {}),
      });
      this.latestSnapshot = fresh;
      this.latestPageFingerprint = pageIdentityFingerprint(fresh);
      this.latestTreeAudit = freshAudit;
      this.previousTreeNodes = freshAudit.treeNodes;
      this.visualInputsLayoutFingerprint = this.visualInputs.length
        ? pageLayoutFingerprint(fresh)
        : null;
      this.state = {
        ...this.state,
        lastExport: result,
        overlays: mergeVisualAndTreeOverlays(freshAudit, freshVisualAudit),
        replay: freshAudit.replay,
        revision: this.state.revision + 1,
        source: snapshotSummary(fresh),
        status: 'ready',
        treeNodes: freshAudit.treeNodes,
        updatedAt: new Date().toISOString(),
        visualElements: freshVisualAudit?.visualElements ?? [],
      };
      this.emitState();
      return download;
    } catch (error) {
      const message = errorMessage(error);
      this.state = {
        ...this.state,
        error: message,
        revision: this.state.revision + 1,
        status: 'error',
        updatedAt: new Date().toISOString(),
      };
      this.emitState();
      throw error;
    } finally {
      if (
        generation === this.generation &&
        device === this.device &&
        this.state.enabled
      ) {
        this.scheduleCapture(this.captureIntervalMs);
      }
    }
  }

  async captureNow(): Promise<AndroidAuditState> {
    if (!this.device) {
      throw new Error('No Android device session is connected');
    }
    if (this.capturePromise) return this.capturePromise;

    const generation = this.generation;
    const device = this.device;
    const captureToken = {};
    this.activeCaptureToken = captureToken;
    this.clearTimer();
    this.state = {
      ...this.state,
      error: undefined,
      errorDetail: undefined,
      status: 'capturing',
    };
    this.emitState();

    const capturePromise = (async () => {
      try {
        const snapshot = await device.captureAccessibilitySnapshot();
        if (generation !== this.generation || device !== this.device) {
          return this.state;
        }
        const previousSnapshot = this.latestSnapshot;
        const nextPageFingerprint = pageIdentityFingerprint(snapshot);
        const nextLayoutFingerprint = pageLayoutFingerprint(snapshot);
        const geometryChanged =
          Boolean(previousSnapshot) &&
          (previousSnapshot?.rotation !== snapshot.rotation ||
            previousSnapshot?.logicalSize.width !==
              snapshot.logicalSize.width ||
            previousSnapshot?.logicalSize.height !==
              snapshot.logicalSize.height);
        const pageChanged =
          Boolean(this.latestPageFingerprint) &&
          this.latestPageFingerprint !== nextPageFingerprint;
        const visualLayoutChanged =
          this.visualInputs.length > 0 &&
          this.visualInputsLayoutFingerprint !== nextLayoutFingerprint;
        if (geometryChanged || pageChanged) {
          this.clearAutoVisualScanTimer();
          this.previousTreeNodes = [];
          this.autoVisualScanAttemptedPageFingerprint = null;
        }
        if (geometryChanged) {
          this.revisitBaseline = null;
          this.revisitSnapshot = null;
        }
        if (geometryChanged || pageChanged || visualLayoutChanged) {
          this.resetVisualInputs(
            geometryChanged
              ? 'device geometry changed'
              : pageChanged
                ? 'page identity changed'
                : 'page layout changed',
          );
        }
        const audit = buildAndroidLiveTreeAudit(
          snapshot.root,
          snapshot.logicalSize,
          this.previousTreeNodes,
        );
        this.previousTreeNodes = audit.treeNodes;
        this.latestTreeAudit = audit;
        this.latestSnapshot = snapshot;
        this.latestPageFingerprint = nextPageFingerprint;
        const visualAudit = this.visualInputs.length
          ? buildAndroidVisualAudit(
              snapshot.root,
              snapshot.logicalSize,
              audit,
              this.visualInputs,
            )
          : null;
        this.state = {
          ...this.state,
          error: undefined,
          overlays: mergeVisualAndTreeOverlays(audit, visualAudit),
          replay: audit.replay,
          revision: this.state.revision + 1,
          source: snapshotSummary(snapshot),
          status: 'ready',
          treeNodes: audit.treeNodes,
          updatedAt: new Date().toISOString(),
          visualElements: visualAudit?.visualElements ?? [],
          visualScan:
            geometryChanged || pageChanged || visualLayoutChanged
              ? { status: 'idle' }
              : this.state.visualScan,
          ...(geometryChanged ? { revisit: undefined } : {}),
        };
        this.emitState();
        return this.state;
      } catch (error) {
        if (generation !== this.generation || device !== this.device) {
          return this.state;
        }
        const message = errorMessage(error);
        warnAudit(`Accessibility audit capture failed: ${message}`);
        this.state = {
          ...this.state,
          enabled: false,
          error: accessibilityCaptureError(message),
          errorDetail: message,
          revision: this.state.revision + 1,
          status: 'error',
          updatedAt: new Date().toISOString(),
        };
        this.emitState();
        return this.state;
      } finally {
        if (this.activeCaptureToken === captureToken) {
          this.activeCaptureToken = null;
          this.capturePromise = null;
        }
        if (
          generation === this.generation &&
          device === this.device &&
          this.state.enabled
        ) {
          this.scheduleCapture(this.captureIntervalMs);
          this.scheduleAutoVisualScanIfNeeded();
        }
      }
    })();

    this.capturePromise = capturePromise;
    return capturePromise;
  }

  registerRoutes(app: Application): void {
    app.use('/android-audit', express.json({ limit: '5mb' }));

    app.get('/android-audit/state', (_req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.json(this.state);
    });

    app.get('/android-audit/events', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Content-Type', 'text/event-stream');
      res.flushHeaders();
      this.subscribers.add(res);
      this.writeEvent(res);
      req.on('close', () => this.subscribers.delete(res));
    });

    app.post('/android-audit/start', async (_req, res) => {
      await this.respond(res, () => this.start());
    });

    app.post('/android-audit/pause', (_req, res) => {
      res.json(this.pause());
    });

    app.post('/android-audit/capture', async (_req, res) => {
      await this.respond(res, () => this.captureNow());
    });

    app.post('/android-audit/revisit-baseline', async (_req, res) => {
      await this.respond(res, () => this.setRevisitBaseline());
    });

    app.post('/android-audit/revisit-verify', async (_req, res) => {
      await this.respond(res, () => this.verifyRevisit());
    });

    app.post('/android-audit/export', async (_req, res) => {
      await this.respond(res, () => this.exportReport());
    });

    app.post('/android-audit/visual-scan', async (_req, res) => {
      await this.respond(res, () => this.scanVisualElements());
    });

    app.post('/android-audit/visual-elements', async (req: Request, res) => {
      const inputs = Array.isArray(req.body?.elements)
        ? (req.body.elements as AndroidAuditVisualElementInput[])
        : [];
      await this.respond(res, () => this.setVisualElements(inputs));
    });
  }

  close(): void {
    this.detachDevice();
    for (const subscriber of this.subscribers) subscriber.end();
    this.subscribers.clear();
  }

  private clearTimer(): void {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
  }

  private clearAutoVisualScanTimer(): void {
    if (!this.autoVisualScanTimer) return;
    clearTimeout(this.autoVisualScanTimer);
    this.autoVisualScanTimer = null;
  }

  private scheduleCapture(delayMs: number): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.captureNow();
    }, delayMs);
  }

  private resetVisualInputs(reason: string): void {
    if (this.visualInputs.length > 0 || this.visualInputsLayoutFingerprint) {
      debugAudit('visual inputs cleared reason=%s', reason);
    }
    this.visualInputs = [];
    this.visualInputsLayoutFingerprint = null;
  }

  private scheduleAutoVisualScanIfNeeded(): void {
    if (
      !this.autoVisualScanEnabled ||
      !this.state.enabled ||
      !this.agent ||
      !this.device ||
      !this.latestTreeAudit ||
      !this.latestPageFingerprint ||
      this.visualInputs.length > 0 ||
      this.visualScanPromise ||
      this.autoVisualScanTimer ||
      this.autoVisualScanAttemptedPageFingerprint ===
        this.latestPageFingerprint ||
      !needsWebViewVisualInventory(this.latestTreeAudit)
    ) {
      return;
    }
    const generation = this.generation;
    const device = this.device;
    const pageFingerprint = this.latestPageFingerprint;
    this.autoVisualScanAttemptedPageFingerprint = pageFingerprint;
    this.autoVisualScanTimer = setTimeout(() => {
      this.autoVisualScanTimer = null;
      if (
        generation !== this.generation ||
        device !== this.device ||
        pageFingerprint !== this.latestPageFingerprint ||
        this.visualInputs.length > 0
      ) {
        return;
      }
      debugAudit('starting automatic WebView visual inventory');
      void this.scanVisualElements({ automatic: true }).catch((error) => {
        warnAudit(
          `Automatic WebView visual inventory failed: ${errorMessage(error)}`,
        );
      });
    }, 0);
  }

  private emitState(): void {
    debugAudit(
      'state revision=%d status=%s enabled=%s nodes=%d overlays=%d',
      this.state.revision,
      this.state.status,
      this.state.enabled,
      this.state.treeNodes.length,
      this.state.overlays.length,
    );
    for (const subscriber of this.subscribers) this.writeEvent(subscriber);
  }

  private writeEvent(response: Response): void {
    response.write(
      `event: state\ndata: ${JSON.stringify({
        revision: this.state.revision,
        status: this.state.status,
      })}\n\n`,
    );
  }

  private async respond<T>(
    response: Response,
    operation: () => Promise<T>,
  ): Promise<void> {
    try {
      response.json(await operation());
    } catch (error) {
      response.status(409).json({ error: errorMessage(error) });
    }
  }
}
