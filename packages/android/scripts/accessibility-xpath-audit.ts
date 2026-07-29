#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import {
  type UiNode,
  type XpathCacheFeature,
  evaluateXpath,
  generateXpathCacheFeature,
  matchRectByXpathCache,
} from '@midscene/core/internal/device-cache';
import type { ADB } from 'appium-adb';
import sharp from 'sharp';
import { createAndroidAdb } from '../src/adb';
import { runAdbShellStdoutOrThrow } from '../src/adb-shell';
import {
  ANDROID_AUDIT_SCHEMA_VERSION,
  type AndroidAuditEnvironment,
  type AndroidAuditTechnologyConfidence,
  collectAndroidAuditEnvironment,
} from '../src/audit-metadata';
import { ANDROID_CACHE_CANDIDATE_OPTIONS } from '../src/cache-policy';
import { uiautomatorXmlToUiNode } from '../src/uiautomator-tree';
import {
  ANDROID_AUDIT_STATUS_LABELS,
  type AndroidAuditEnumeratedTree,
  type AndroidAuditTreeNode,
  buildAndroidAuditTree,
  enumerateAndroidUiTree,
} from '../src/xpath-audit';

const execFileAsync = promisify(execFile);

const AUDIT_SCHEMA_VERSION = ANDROID_AUDIT_SCHEMA_VERSION;
const DUMP_ATTEMPTS = 3;
// Audit captures favor completeness over the tighter production latency bound.
// Complex, animated pages can need more than five seconds to serialize a tree.
const DUMP_TIMEOUT_MS = 15_000;
const DUMP_RETRY_DELAY_MS = 250;
const DEFAULT_PACKAGE = 'com.ss.android.ugc.aweme';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DEFAULT_OUTPUT_ROOT = join(
  REPO_ROOT,
  'midscene_run',
  'douyin-xpath-audit',
);

type CapturePhase = 'source' | 'fresh' | 'revisit';
type TreeSource = 'yadb' | 'uiautomator';
type TechnologyConfidence = AndroidAuditTechnologyConfidence;
type ReplayOutcome = 'hit' | 'miss' | 'wrong-target' | 'pending' | 'skipped';

export type VisualAuditStatus =
  | 'cache-xpath-hit'
  | 'tree-only-positional'
  | 'exposed-no-safe-xpath'
  | 'not-exposed'
  | 'point-selected-other';

export interface AuditPoint {
  x: number;
  y: number;
}

export interface AuditRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface VisualElementInput {
  id: string;
  name: string;
  description: string;
  point: AuditPoint;
  rect: AuditRect;
  treeNodeId: string | null;
  notes?: string;
}

export interface VisualInventory {
  schemaVersion: typeof AUDIT_SCHEMA_VERSION;
  coordinateSpace: 'screenshot-pixel';
  reviewed: boolean;
  instructions?: string[];
  elements: VisualElementInput[];
}

interface ArtifactMetadata {
  file: string;
  capturedAt: string;
  sha256: string;
  bytes: number;
}

interface XmlSourceMetadata extends ArtifactMetadata {
  source: TreeSource;
  attempts: number;
  durationMs: number;
}

interface XmlSourceFailure {
  source: TreeSource;
  attempts: number;
  durationMs: number;
  errors: string[];
}

interface PhaseCaptureMetadata {
  phase: CapturePhase;
  capturedAt: string;
  treeSource: TreeSource;
  screenshot: ArtifactMetadata;
  usedXml: ArtifactMetadata;
  sources: {
    yadb?: XmlSourceMetadata;
    uiautomator?: XmlSourceMetadata;
  };
  sourceFailures: XmlSourceFailure[];
}

export interface PageMetadata {
  schemaVersion: typeof AUDIT_SCHEMA_VERSION;
  reportKind: 'cli-capture';
  pageId: string;
  createdAt: string;
  updatedAt: string;
  device: AndroidAuditEnvironment['device'];
  app: AndroidAuditEnvironment['app'];
  entryPath: string;
  technology: {
    declaredStack: string;
    confidence: TechnologyConfidence;
    evidence: string[];
  };
  sourceUsed: TreeSource;
  captures: Partial<Record<CapturePhase, PhaseCaptureMetadata>>;
}

interface RunMetadata {
  schemaVersion: typeof AUDIT_SCHEMA_VERSION;
  reportKind: 'cli-capture';
  runId: string;
  createdAt: string;
  updatedAt: string;
  repository: {
    root: string;
    branch: string;
    commit: string;
  };
  pages: string[];
}

export type TreeNodeAuditRecord = AndroidAuditTreeNode;
export type EnumeratedTree = AndroidAuditEnumeratedTree;

export interface ReplayResult {
  phase: 'fresh' | 'revisit';
  outcome: ReplayOutcome;
  xpath?: string;
  xpathSource?: string;
  rect?: AuditRect;
  matchedNodeId?: string;
  failureReason?: string;
}

export interface VisualElementAuditRecord extends VisualElementInput {
  ordinal: number;
  status: VisualAuditStatus;
  logicalPoint: AuditPoint;
  logicalRect: AuditRect;
  structuralXpath?: string;
  mappedNode?: {
    nodeId: string;
    type: string;
    attrs: Record<string, string | undefined>;
    bounds: AuditRect;
  };
  cacheFeatureXpaths: string[];
  cacheFeatureXpathSources: TreeNodeAuditRecord['cacheFeatureXpathSources'];
  candidateDiagnostics: TreeNodeAuditRecord['candidateDiagnostics'];
  cacheFeature?: XpathCacheFeature;
  cacheSelectedNodeId?: string;
  sourceUnique: boolean;
  sourceFailureReason?: string;
  fresh: ReplayResult;
  revisit: ReplayResult;
}

export interface PageElementsFile {
  schemaVersion: typeof AUDIT_SCHEMA_VERSION;
  generatedAt: string;
  treeNodes: TreeNodeAuditRecord[];
  visualElements: VisualElementAuditRecord[];
}

interface ReplayPhaseSummary {
  phase: 'fresh' | 'revisit';
  eligible: number;
  hits: number;
  misses: number;
  wrongMappings: number;
  pending: number;
  hitRate: number | null;
}

export interface ReplayResultsFile {
  schemaVersion: typeof AUDIT_SCHEMA_VERSION;
  generatedAt: string;
  phases: {
    fresh: ReplayPhaseSummary;
    revisit: ReplayPhaseSummary;
  };
  elements: Array<{
    id: string;
    name: string;
    sourceSelectedNodeId?: string;
    expectedSourceNodeId: string | null;
    fresh: ReplayResult;
    revisit: ReplayResult;
  }>;
}

interface PageAuditData {
  elements: PageElementsFile;
  replayResults: ReplayResultsFile;
}

interface PageSummary {
  pageId: string;
  technology: PageMetadata['technology'];
  treeSource: TreeSource;
  treeNodeCount: number;
  visibleTreeNodeCount: number;
  visualElementCount: number;
  exposedVisualElementCount: number;
  safeXpathCount: number;
  statuses: Record<VisualAuditStatus, number>;
  fresh: ReplayPhaseSummary;
  revisit: ReplayPhaseSummary;
  wrongMappings: number;
  completeness: {
    source: boolean;
    fresh: boolean;
    revisit: boolean;
    visualReview: boolean;
    complete: boolean;
  };
  rolloutGate: {
    status: 'pass' | 'fail' | 'incomplete';
    allCacheHitsUniqueInSource: boolean;
    freshStable: boolean;
    revisitStable: boolean;
    wrongMappings: number;
  };
}

interface RunSummary {
  schemaVersion: typeof AUDIT_SCHEMA_VERSION;
  reportKind: 'cli-capture';
  generatedAt: string;
  runId: string;
  pages: PageSummary[];
  totals: {
    pages: number;
    completePages: number;
    treeNodes: number;
    visualElements: number;
    exposedVisualElements: number;
    safeXpaths: number;
    freshHits: number;
    revisitHits: number;
    wrongMappings: number;
  };
}

interface CaptureCliOptions {
  command: 'capture';
  phase: CapturePhase;
  device: string;
  app: string;
  page: string;
  runId?: string;
  outputRoot: string;
  entryPath: string;
  technology: {
    declaredStack: string;
    confidence: TechnologyConfidence;
    evidence: string[];
  };
  visualElementsFile?: string;
}

interface RenderCliOptions {
  command: 'render';
  runId?: string;
  page?: string;
  outputRoot: string;
}

type CliOptions = CaptureCliOptions | RenderCliOptions;

interface XmlCaptureSuccess {
  source: TreeSource;
  xml: string;
  capturedAt: string;
  attempts: number;
  durationMs: number;
}

interface XmlCaptureFailureResult {
  source: TreeSource;
  attempts: number;
  durationMs: number;
  errors: string[];
}

interface TreeCaptureResult {
  selected: XmlCaptureSuccess;
  successes: XmlCaptureSuccess[];
  failures: XmlCaptureFailureResult[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function writeStdout(message: string): void {
  process.stdout.write(`${message}\n`);
}

function writeStderr(message: string): void {
  process.stderr.write(`${message}\n`);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function writeJson(path: string, value: object): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function readJson<T extends object>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

function assertSafeId(value: string, label: string): void {
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) ||
    value === '.' ||
    value === '..'
  ) {
    throw new Error(
      `${label} must use only letters, numbers, dot, underscore, or hyphen`,
    );
  }
}

function assertAndroidPackage(value: string): void {
  if (!/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+$/.test(value)) {
    throw new Error(`Invalid Android package name: ${value}`);
  }
}

function defaultRunId(): string {
  return nowIso().replace(/[-:.]/g, '');
}

function artifactMetadata(
  file: string,
  capturedAt: string,
  value: string | Buffer,
): ArtifactMetadata {
  return {
    file,
    capturedAt,
    sha256: sha256(value),
    bytes: Buffer.byteLength(value),
  };
}

function validateHierarchyXml(xml: string, source: TreeSource): void {
  if (!/<hierarchy(?:\s|>)/.test(xml) || !xml.includes('</hierarchy>')) {
    throw new Error(`${source} did not produce valid hierarchy XML`);
  }
}

async function captureXmlSource(
  adb: ADB,
  source: TreeSource,
): Promise<XmlCaptureSuccess | XmlCaptureFailureResult> {
  const startedAt = Date.now();
  const errors: string[] = [];

  for (let attempt = 1; attempt <= DUMP_ATTEMPTS; attempt++) {
    // A timed-out adb client does not reliably terminate the remote command.
    // Per-attempt paths prevent a late dump/cleanup from racing a later retry.
    const remotePath = `/data/local/tmp/midscene_xpath_audit_${source}_${process.pid}_${Date.now()}_${attempt}.xml`;
    const dumpCommand =
      source === 'yadb'
        ? `app_process -Djava.class.path=/data/local/tmp/yadb /data/local/tmp com.ysbing.yadb.Main -layout ${remotePath}`
        : `uiautomator dump --compressed ${remotePath}`;
    try {
      await runAdbShellStdoutOrThrow(adb, `rm -f ${remotePath}`, {
        timeout: DUMP_TIMEOUT_MS,
      });
      await runAdbShellStdoutOrThrow(adb, dumpCommand, {
        timeout: DUMP_TIMEOUT_MS,
      });
      const xml = await runAdbShellStdoutOrThrow(adb, `cat ${remotePath}`, {
        timeout: DUMP_TIMEOUT_MS,
      });
      validateHierarchyXml(xml, source);
      return {
        source,
        xml,
        capturedAt: nowIso(),
        attempts: attempt,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      errors.push(`attempt ${attempt}/${DUMP_ATTEMPTS}: ${String(error)}`);
      if (attempt < DUMP_ATTEMPTS) await sleep(DUMP_RETRY_DELAY_MS);
    } finally {
      try {
        await runAdbShellStdoutOrThrow(adb, `rm -f ${remotePath}`, {
          timeout: DUMP_TIMEOUT_MS,
        });
      } catch {
        // The local artifact already contains the dump; remote cleanup is best effort.
      }
    }
  }

  return {
    source,
    attempts: DUMP_ATTEMPTS,
    durationMs: Date.now() - startedAt,
    errors,
  };
}

function isXmlCaptureSuccess(
  result: XmlCaptureSuccess | XmlCaptureFailureResult,
): result is XmlCaptureSuccess {
  return 'xml' in result;
}

async function captureTree(adb: ADB): Promise<TreeCaptureResult> {
  const yadb = await captureXmlSource(adb, 'yadb');
  const uiautomator = await captureXmlSource(adb, 'uiautomator');
  const results = [yadb, uiautomator];
  const successes = results.filter(isXmlCaptureSuccess);
  const failures = results.filter(
    (result): result is XmlCaptureFailureResult => !isXmlCaptureSuccess(result),
  );
  const selected =
    successes.find((result) => result.source === 'yadb') ??
    successes.find((result) => result.source === 'uiautomator');

  if (!selected) {
    throw new Error(
      `Unable to capture Android accessibility tree: ${failures
        .map((failure) => `${failure.source}: ${failure.errors.join('; ')}`)
        .join('; ')}`,
    );
  }

  return { selected, successes, failures };
}

async function validatePng(buffer: Buffer, label: string): Promise<void> {
  const metadata = await sharp(buffer).metadata();
  if (!metadata.width || !metadata.height || metadata.format !== 'png') {
    throw new Error(`${label} is not a valid PNG screenshot`);
  }
}

async function captureScreenshot(adb: ADB): Promise<Buffer> {
  const errors: string[] = [];
  try {
    const buffer = await adb.takeScreenshot(Number.NaN);
    await validatePng(buffer, 'adb.takeScreenshot result');
    return buffer;
  } catch (error) {
    errors.push(`adb.takeScreenshot: ${String(error)}`);
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'midscene-xpath-audit-'));
  const localPath = join(tempDir, 'screenshot.png');
  const remotePath = `/data/local/tmp/midscene_xpath_audit_${process.pid}_${Date.now()}.png`;

  try {
    const commands = [
      `screencap -p ${remotePath}`,
      `app_process -Djava.class.path=/data/local/tmp/yadb /data/local/tmp com.ysbing.yadb.Main -screenshot ${remotePath}`,
    ];
    for (const command of commands) {
      try {
        await adb.shell(`rm -f ${remotePath}`);
        await adb.shell(command);
        await adb.pull(remotePath, localPath);
        const buffer = await readFile(localPath);
        await validatePng(buffer, command);
        return buffer;
      } catch (error) {
        errors.push(`${command}: ${String(error)}`);
      }
    }
    throw new Error(`Unable to capture screenshot: ${errors.join('; ')}`);
  } finally {
    const cleanup = await Promise.allSettled([
      adb.shell(`rm -f ${remotePath}`),
      rm(tempDir, { recursive: true, force: true }),
    ]);
    for (const result of cleanup) {
      if (result.status === 'rejected') {
        writeStderr(`Screenshot cleanup warning: ${String(result.reason)}`);
      }
    }
  }
}

export const enumerateUiTree = enumerateAndroidUiTree;

function hasAndroidIdentityFields(node: UiNode): boolean {
  return ['resource-id', 'content-desc', 'text'].some((attr) =>
    Boolean(node.attrs[attr]),
  );
}

function selectedNodeForFeature(
  root: UiNode,
  feature: XpathCacheFeature,
  idByNode: Map<UiNode, string>,
): { nodeId?: string; sourceUnique: boolean; failureReason?: string } {
  try {
    const match = matchRectByXpathCache(root, feature, 'android');
    const matches = evaluateXpath(root, match.xpath);
    return {
      nodeId: matches.length === 1 ? idByNode.get(matches[0]) : undefined,
      sourceUnique: matches.length === 1,
      ...(matches.length === 1
        ? {}
        : { failureReason: `${match.xpath} matched ${matches.length} nodes` }),
    };
  } catch (error) {
    return {
      sourceUnique: false,
      failureReason: String(error),
    };
  }
}

function featureDiagnostics(
  root: UiNode,
  feature: XpathCacheFeature,
  expectedNode: UiNode,
): TreeNodeAuditRecord['candidateDiagnostics'] {
  return feature.xpaths.map((xpath, index) => {
    try {
      const matches = evaluateXpath(root, xpath);
      return {
        xpath,
        source: feature.xpathSources?.[index],
        matchCount: matches.length,
        selectsNode: matches.length === 1 && matches[0] === expectedNode,
      };
    } catch {
      return {
        xpath,
        source: feature.xpathSources?.[index],
        matchCount: 0,
        selectsNode: false,
      };
    }
  });
}

export function buildTreeNodeAuditRecords(
  root: UiNode,
  logicalWidth: number,
  logicalHeight: number,
): { records: TreeNodeAuditRecord[]; enumerated: EnumeratedTree } {
  const enumerated = enumerateUiTree(root);
  return {
    records: buildAndroidAuditTree(root, {
      width: logicalWidth,
      height: logicalHeight,
    }),
    enumerated,
  };
}

function validatePoint(point: AuditPoint, label: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error(`${label} must contain finite x and y values`);
  }
}

function validateRect(rect: AuditRect, label: string): void {
  if (
    !Number.isFinite(rect.left) ||
    !Number.isFinite(rect.top) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height) ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    throw new Error(`${label} must be a positive finite rectangle`);
  }
}

export function validateVisualInventory(
  inventory: VisualInventory,
): VisualInventory {
  if (
    inventory.schemaVersion !== AUDIT_SCHEMA_VERSION ||
    inventory.coordinateSpace !== 'screenshot-pixel' ||
    typeof inventory.reviewed !== 'boolean' ||
    !Array.isArray(inventory.elements)
  ) {
    throw new Error('visual-elements.json has an unsupported schema');
  }

  const ids = new Set<string>();
  for (const element of inventory.elements) {
    assertSafeId(element.id, 'Visual element id');
    if (ids.has(element.id)) {
      throw new Error(`Duplicate visual element id: ${element.id}`);
    }
    ids.add(element.id);
    if (!element.name.trim() || !element.description.trim()) {
      throw new Error(
        `Visual element ${element.id} requires name and description`,
      );
    }
    validatePoint(element.point, `Visual element ${element.id} point`);
    validateRect(element.rect, `Visual element ${element.id} rect`);
    if (
      element.treeNodeId !== null &&
      (typeof element.treeNodeId !== 'string' || !element.treeNodeId)
    ) {
      throw new Error(
        `Visual element ${element.id} treeNodeId must be a node id or null`,
      );
    }
  }
  return inventory;
}

function toLogicalPoint(
  point: AuditPoint,
  screenshotWidth: number,
  screenshotHeight: number,
  logicalWidth: number,
  logicalHeight: number,
): AuditPoint {
  return {
    x: point.x / (screenshotWidth / logicalWidth),
    y: point.y / (screenshotHeight / logicalHeight),
  };
}

function toLogicalRect(
  rect: AuditRect,
  screenshotWidth: number,
  screenshotHeight: number,
  logicalWidth: number,
  logicalHeight: number,
): AuditRect {
  const scaleX = screenshotWidth / logicalWidth;
  const scaleY = screenshotHeight / logicalHeight;
  return {
    left: rect.left / scaleX,
    top: rect.top / scaleY,
    width: rect.width / scaleX,
    height: rect.height / scaleY,
  };
}

function pendingReplay(phase: 'fresh' | 'revisit'): ReplayResult {
  return { phase, outcome: 'pending', failureReason: `${phase} not captured` };
}

function skippedReplay(
  phase: 'fresh' | 'revisit',
  reason: string,
): ReplayResult {
  return { phase, outcome: 'skipped', failureReason: reason };
}

function replayFeature(
  phase: 'fresh' | 'revisit',
  root: UiNode | undefined,
  feature: XpathCacheFeature | undefined,
): ReplayResult {
  if (!root) return pendingReplay(phase);
  if (!feature) return skippedReplay(phase, 'No safe source cache feature');
  const enumerated = enumerateUiTree(root);
  try {
    const match = matchRectByXpathCache(root, feature, 'android');
    const matches = evaluateXpath(root, match.xpath);
    if (matches.length !== 1) {
      return {
        phase,
        outcome: 'miss',
        failureReason: `${match.xpath} matched ${matches.length} node(s)`,
      };
    }
    return {
      phase,
      outcome: 'hit',
      xpath: match.xpath,
      ...(match.source ? { xpathSource: match.source } : {}),
      rect: match.rect,
      matchedNodeId: enumerated.idByNode.get(matches[0]),
    };
  } catch (error) {
    const message = String(error);
    return {
      phase,
      outcome: message.includes('different target') ? 'wrong-target' : 'miss',
      failureReason: message,
    };
  }
}

function visualStatus(
  mappedNode: UiNode | undefined,
  mappedNodeId: string | null,
  feature: XpathCacheFeature | undefined,
  selectedNodeId: string | undefined,
  sourceUnique: boolean,
  fresh: ReplayResult,
): { status: VisualAuditStatus; failureReason?: string } {
  if (mappedNodeId === null) {
    return feature && selectedNodeId
      ? {
          status: 'point-selected-other',
          failureReason: `The visual target is not exposed, but production point selection chose ${selectedNodeId}`,
        }
      : { status: 'not-exposed' };
  }
  if (!mappedNode) {
    throw new Error(`Visual inventory references unknown node ${mappedNodeId}`);
  }
  if (feature && selectedNodeId && selectedNodeId !== mappedNodeId) {
    return {
      status: 'point-selected-other',
      failureReason: `Production point selection chose ${selectedNodeId} instead of ${mappedNodeId}`,
    };
  }
  if (feature && sourceUnique && fresh.outcome === 'hit') {
    return { status: 'cache-xpath-hit' };
  }
  if (!feature && !hasAndroidIdentityFields(mappedNode)) {
    return {
      status: 'tree-only-positional',
      failureReason:
        'The node has no Android identity fields; only its structural XPath exists',
    };
  }
  return {
    status: 'exposed-no-safe-xpath',
    failureReason:
      fresh.failureReason ??
      'Production generation rejected duplicate, ungrounded, or structural identity',
  };
}

function buildVisualAuditRecords(
  inventory: VisualInventory,
  sourceRoot: UiNode,
  freshRoot: UiNode | undefined,
  revisitRoot: UiNode | undefined,
  sourceTree: ReturnType<typeof buildTreeNodeAuditRecords>,
  dimensions: {
    screenshotWidth: number;
    screenshotHeight: number;
    logicalWidth: number;
    logicalHeight: number;
  },
): VisualElementAuditRecord[] {
  const treeRecordById = new Map(
    sourceTree.records.map((record) => [record.nodeId, record]),
  );

  return inventory.elements.map((element, index) => {
    const logicalPoint = toLogicalPoint(
      element.point,
      dimensions.screenshotWidth,
      dimensions.screenshotHeight,
      dimensions.logicalWidth,
      dimensions.logicalHeight,
    );
    const logicalRect = toLogicalRect(
      element.rect,
      dimensions.screenshotWidth,
      dimensions.screenshotHeight,
      dimensions.logicalWidth,
      dimensions.logicalHeight,
    );
    const mappedNode =
      element.treeNodeId === null
        ? undefined
        : sourceTree.enumerated.nodeById.get(element.treeNodeId);
    if (element.treeNodeId !== null && !mappedNode) {
      throw new Error(
        `Visual element ${element.id} references unknown source node ${element.treeNodeId}`,
      );
    }
    const feature = generateXpathCacheFeature(
      sourceRoot,
      logicalPoint,
      'android',
      {
        ...ANDROID_CACHE_CANDIDATE_OPTIONS,
        targetDescription: element.description,
        expectedRect: logicalRect,
      },
    );
    const selected = feature
      ? selectedNodeForFeature(
          sourceRoot,
          feature,
          sourceTree.enumerated.idByNode,
        )
      : { sourceUnique: false };
    const candidateDiagnostics =
      feature && mappedNode
        ? featureDiagnostics(sourceRoot, feature, mappedNode)
        : [];
    const allCandidatesUnique =
      candidateDiagnostics.length > 0 &&
      candidateDiagnostics.every(
        (candidate) => candidate.matchCount === 1 && candidate.selectsNode,
      );
    const fresh = replayFeature('fresh', freshRoot, feature);
    const revisit = replayFeature('revisit', revisitRoot, feature);
    const status = visualStatus(
      mappedNode,
      element.treeNodeId,
      feature,
      selected.nodeId,
      selected.sourceUnique &&
        selected.nodeId === element.treeNodeId &&
        allCandidatesUnique,
      fresh,
    );
    const mappedRecord = element.treeNodeId
      ? treeRecordById.get(element.treeNodeId)
      : undefined;

    return {
      ...element,
      ordinal: index + 1,
      status: status.status,
      logicalPoint,
      logicalRect,
      ...(mappedRecord
        ? {
            structuralXpath: mappedRecord.structuralXpath,
            mappedNode: {
              nodeId: mappedRecord.nodeId,
              type: mappedRecord.type,
              attrs: mappedRecord.attrs,
              bounds: mappedRecord.bounds,
            },
          }
        : {}),
      cacheFeatureXpaths: feature?.xpaths ?? [],
      cacheFeatureXpathSources: feature?.xpathSources ?? [],
      candidateDiagnostics,
      ...(feature ? { cacheFeature: feature } : {}),
      ...(selected.nodeId ? { cacheSelectedNodeId: selected.nodeId } : {}),
      sourceUnique:
        selected.sourceUnique &&
        selected.nodeId === element.treeNodeId &&
        allCandidatesUnique,
      ...(status.failureReason
        ? { sourceFailureReason: status.failureReason }
        : {}),
      fresh,
      revisit,
    };
  });
}

function summarizeReplayPhase(
  phase: 'fresh' | 'revisit',
  records: VisualElementAuditRecord[],
): ReplayPhaseSummary {
  const phaseResults = records.map((record) => record[phase]);
  const eligible = phaseResults.filter(
    (result) => result.outcome !== 'skipped',
  ).length;
  const hits = phaseResults.filter((result) => result.outcome === 'hit').length;
  const misses = phaseResults.filter(
    (result) => result.outcome === 'miss',
  ).length;
  const wrongMappings = phaseResults.filter(
    (result) => result.outcome === 'wrong-target',
  ).length;
  const pending = phaseResults.filter(
    (result) => result.outcome === 'pending',
  ).length;
  const completedEligible = hits + misses + wrongMappings;
  return {
    phase,
    eligible,
    hits,
    misses,
    wrongMappings,
    pending,
    hitRate: completedEligible > 0 ? hits / completedEligible : null,
  };
}

export function buildPageAuditData(
  inventory: VisualInventory,
  sourceRoot: UiNode,
  freshRoot: UiNode | undefined,
  revisitRoot: UiNode | undefined,
  dimensions: {
    screenshotWidth: number;
    screenshotHeight: number;
    logicalWidth: number;
    logicalHeight: number;
  },
): PageAuditData {
  validateVisualInventory(inventory);
  const sourceTree = buildTreeNodeAuditRecords(
    sourceRoot,
    dimensions.logicalWidth,
    dimensions.logicalHeight,
  );
  const visualElements = buildVisualAuditRecords(
    inventory,
    sourceRoot,
    freshRoot,
    revisitRoot,
    sourceTree,
    dimensions,
  );
  const generatedAt = nowIso();
  return {
    elements: {
      schemaVersion: AUDIT_SCHEMA_VERSION,
      generatedAt,
      treeNodes: sourceTree.records,
      visualElements,
    },
    replayResults: {
      schemaVersion: AUDIT_SCHEMA_VERSION,
      generatedAt,
      phases: {
        fresh: summarizeReplayPhase('fresh', visualElements),
        revisit: summarizeReplayPhase('revisit', visualElements),
      },
      elements: visualElements.map((element) => ({
        id: element.id,
        name: element.name,
        sourceSelectedNodeId: element.cacheSelectedNodeId,
        expectedSourceNodeId: element.treeNodeId,
        fresh: element.fresh,
        revisit: element.revisit,
      })),
    },
  };
}

function emptyVisualInventory(): VisualInventory {
  return {
    schemaVersion: AUDIT_SCHEMA_VERSION,
    coordinateSpace: 'screenshot-pixel',
    reviewed: false,
    instructions: [
      'Add every visible interactive control from screenshot.png.',
      'Use screenshot pixel coordinates for point and rect.',
      'Set treeNodeId to a node id from elements.json, or null when the control is not exposed.',
      'Set reviewed to true only after a human has checked the complete screenshot.',
    ],
    elements: [],
  };
}

function statusCounts(
  elements: VisualElementAuditRecord[],
): Record<VisualAuditStatus, number> {
  const counts: Record<VisualAuditStatus, number> = {
    'cache-xpath-hit': 0,
    'tree-only-positional': 0,
    'exposed-no-safe-xpath': 0,
    'not-exposed': 0,
    'point-selected-other': 0,
  };
  for (const element of elements) counts[element.status]++;
  return counts;
}

function buildPageSummary(
  metadata: PageMetadata,
  inventory: VisualInventory,
  data: PageAuditData,
): PageSummary {
  const visualElements = data.elements.visualElements;
  const statuses = statusCounts(visualElements);
  const sourceWrongSelections = statuses['point-selected-other'];
  const wrongMappings =
    sourceWrongSelections +
    data.replayResults.phases.fresh.wrongMappings +
    data.replayResults.phases.revisit.wrongMappings;
  const allCacheHitsUniqueInSource = visualElements
    .filter((element) => element.status === 'cache-xpath-hit')
    .every((element) => element.sourceUnique);
  const freshStable =
    data.replayResults.phases.fresh.misses === 0 &&
    data.replayResults.phases.fresh.wrongMappings === 0 &&
    data.replayResults.phases.fresh.pending === 0;
  const revisitStable =
    data.replayResults.phases.revisit.misses === 0 &&
    data.replayResults.phases.revisit.wrongMappings === 0 &&
    data.replayResults.phases.revisit.pending === 0;
  const completeness = {
    source: Boolean(metadata.captures.source),
    fresh: Boolean(metadata.captures.fresh),
    revisit: Boolean(metadata.captures.revisit),
    visualReview: inventory.reviewed && inventory.elements.length > 0,
    complete: false,
  };
  completeness.complete =
    completeness.source &&
    completeness.fresh &&
    completeness.revisit &&
    completeness.visualReview;
  const gateStatus = !completeness.complete
    ? 'incomplete'
    : wrongMappings === 0 &&
        allCacheHitsUniqueInSource &&
        freshStable &&
        revisitStable
      ? 'pass'
      : 'fail';

  return {
    pageId: metadata.pageId,
    technology: metadata.technology,
    treeSource: metadata.sourceUsed,
    treeNodeCount: data.elements.treeNodes.length,
    visibleTreeNodeCount: data.elements.treeNodes.filter((node) => node.visible)
      .length,
    visualElementCount: visualElements.length,
    exposedVisualElementCount: visualElements.filter(
      (element) => element.treeNodeId !== null,
    ).length,
    safeXpathCount: visualElements.filter(
      (element) =>
        element.cacheFeatureXpaths.length > 0 &&
        element.cacheSelectedNodeId === element.treeNodeId &&
        element.sourceUnique,
    ).length,
    statuses,
    fresh: data.replayResults.phases.fresh,
    revisit: data.replayResults.phases.revisit,
    wrongMappings,
    completeness,
    rolloutGate: {
      status: gateStatus,
      allCacheHitsUniqueInSource,
      freshStable,
      revisitStable,
      wrongMappings,
    },
  };
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatPercent(value: number): string {
  return `${Math.max(0, Math.min(100, value)).toFixed(4)}%`;
}

function formatRate(value: number | null): string {
  return value === null ? 'N/A' : `${(value * 100).toFixed(1)}%`;
}

interface StatusPresentation {
  label: string;
  description: string;
}

const STATUS_PRESENTATION: Record<VisualAuditStatus, StatusPresentation> = {
  'cache-xpath-hit': {
    label: ANDROID_AUDIT_STATUS_LABELS['cache-xpath-hit'],
    description:
      'Green: A safe cache XPath was generated, was unique in the source tree, and matched the same element in the fresh tree.',
  },
  'tree-only-positional': {
    label: ANDROID_AUDIT_STATUS_LABELS['tree-only-positional'],
    description:
      'Yellow: The node is present in the tree but has no verifiable identity fields, so only an order-sensitive structural XPath is available.',
  },
  'exposed-no-safe-xpath': {
    label: ANDROID_AUDIT_STATUS_LABELS['exposed-no-safe-xpath'],
    description:
      'Red: The node is present in the tree, but its identity is duplicated, its semantics are merged, or production generation rejected a safe cache XPath.',
  },
  'not-exposed': {
    label: ANDROID_AUDIT_STATUS_LABELS['not-exposed'],
    description:
      'Red: The element is visible in the screenshot but has no corresponding Accessibility tree node.',
  },
  'point-selected-other': {
    label: ANDROID_AUDIT_STATUS_LABELS['point-selected-other'],
    description:
      'Purple: The point intersects overlapping nodes and production point selection chose a node different from the manual mapping.',
  },
};

const PAGE_LABELS: Record<string, string> = {
  'douyin-home': 'Douyin Home',
  'douyin-search': 'Douyin Search',
  'douyin-search-results': 'Douyin Search Results',
  'douyin-comments': 'Douyin Comments',
  'douyin-login': 'Douyin Login',
  'douyin-wallet': 'Douyin Wallet',
  'douyin-monthly-pay': 'Douyin Monthly Pay',
  'samsung-browser-midscenejs': 'Samsung Internet Web Page',
};

function pageLabel(pageId: string): string {
  return PAGE_LABELS[pageId] ?? pageId;
}

function phaseLabel(phase: CapturePhase): string {
  return {
    source: 'Source',
    fresh: 'Fresh',
    revisit: 'Revisit',
  }[phase];
}

function replayOutcomeLabel(outcome: ReplayOutcome): string {
  return {
    hit: 'Hit',
    miss: 'Miss',
    'wrong-target': 'Wrong Target',
    pending: 'Pending',
    skipped: 'Skipped',
  }[outcome];
}

function xpathSourceLabel(source: string): string {
  return (
    {
      'stable-attribute': 'Stable Attribute',
      'semantic-attribute': 'Semantic Attribute',
      'compound-attributes': 'Compound Attributes',
      'ancestor-scoped': 'Stable Ancestor Scope',
      'positional-fallback': 'Positional Fallback',
      unknown: 'Unknown Source',
    }[source] ?? source
  );
}

function confidenceLabel(confidence: TechnologyConfidence): string {
  return {
    confirmed: 'Confirmed',
    strong: 'Strong',
    suspected: 'Suspected',
    unknown: 'Unknown',
  }[confidence];
}

function gatePresentation(status: PageSummary['rolloutGate']['status']): {
  label: string;
  description: string;
} {
  return {
    pass: {
      label: 'Pass',
      description:
        'Capture is complete, safe XPaths are stable in both fresh and revisit captures, and there are no wrong mappings.',
    },
    fail: {
      label: 'Fail',
      description:
        'Capture is complete, but at least one XPath uniqueness, stable replay, or wrong-mapping check failed.',
    },
    incomplete: {
      label: 'Incomplete',
      description:
        'The manual visual inventory, fresh capture, or revisit capture is incomplete.',
    },
  }[status];
}

function formatDiagnosticMessage(message: string): string {
  return message;
}

function technologyEvidenceLabel(evidence: string): string {
  return evidence;
}

function renderStatusBadge(status: VisualAuditStatus): string {
  const presentation = STATUS_PRESENTATION[status];
  return `<span class="status tooltip ${escapeHtml(status)}" tabindex="0" data-tooltip="${escapeHtml(presentation.description)}" aria-label="${escapeHtml(`${presentation.label}: ${presentation.description}`)}">${escapeHtml(presentation.label)}</span>`;
}

function renderStatusLegend(): string {
  return `<div class="status-legend"><strong>Frame colors:</strong>${(
    Object.keys(STATUS_PRESENTATION) as VisualAuditStatus[]
  )
    .map((status) => renderStatusBadge(status))
    .join('')}</div>`;
}

function renderReplay(result: ReplayResult): string {
  return `<div class="replay ${escapeHtml(result.outcome)}">
    <strong>${escapeHtml(phaseLabel(result.phase))}: ${escapeHtml(replayOutcomeLabel(result.outcome))}</strong>
    ${result.xpath ? `<code>${escapeHtml(result.xpath)}</code>` : ''}
    ${result.xpathSource ? `<span>Candidate source: ${escapeHtml(xpathSourceLabel(result.xpathSource))}</span>` : ''}
    ${result.failureReason ? `<p>Reason: ${escapeHtml(formatDiagnosticMessage(result.failureReason))}</p>` : ''}
  </div>`;
}

function renderCacheXpathCandidates(
  record: Pick<
    TreeNodeAuditRecord,
    'cacheFeatureXpaths' | 'cacheFeatureXpathSources' | 'candidateDiagnostics'
  >,
): string {
  if (record.cacheFeatureXpaths.length === 0) {
    return '<li>No production cache XPath</li>';
  }
  return record.cacheFeatureXpaths
    .map((xpath, index) => {
      const diagnostic = record.candidateDiagnostics[index];
      const source = record.cacheFeatureXpathSources[index] ?? 'unknown';
      const uniqueness = diagnostic
        ? ` · matched ${diagnostic.matchCount} node(s) · expected node: ${diagnostic.selectsNode ? 'yes' : 'no'}`
        : '';
      return `<li><span>${escapeHtml(`${xpathSourceLabel(source)}${uniqueness}`)}</span><code>${escapeHtml(xpath)}</code></li>`;
    })
    .join('');
}

function renderVisualDetail(element: VisualElementAuditRecord): string {
  const attrs = element.mappedNode
    ? JSON.stringify(element.mappedNode.attrs, null, 2)
    : 'No Accessibility tree node';
  const candidates = renderCacheXpathCandidates(element);
  return `<article class="element-card" data-detail-id="${escapeHtml(element.id)}">
    <header>
      <span class="number">${element.ordinal}</span>
      <div><h3>${escapeHtml(element.name)}</h3><p>${escapeHtml(element.description)}</p></div>
      ${renderStatusBadge(element.status)}
    </header>
    <dl>
      <div><dt>Visual Rectangle</dt><dd><code>${escapeHtml(JSON.stringify(element.rect))}</code></dd></div>
      <div><dt>Mapped Node</dt><dd>${escapeHtml(element.treeNodeId ?? 'Not exposed')}</dd></div>
      <div><dt>Production Point Selection</dt><dd>${escapeHtml(element.cacheSelectedNodeId ?? 'None')}</dd></div>
      <div><dt>Unique in Source</dt><dd>${element.sourceUnique ? 'Yes' : 'No'}</dd></div>
      <div><dt>Structural XPath</dt><dd><code>${escapeHtml(element.structuralXpath ?? 'None')}</code></dd></div>
    </dl>
    ${element.sourceFailureReason ? `<p class="failure">Reason: ${escapeHtml(formatDiagnosticMessage(element.sourceFailureReason))}</p>` : ''}
    <h4>Midscene Cache XPath Candidates</h4>
    <ol class="candidates">${candidates}</ol>
    <div class="replay-grid">${renderReplay(element.fresh)}${renderReplay(element.revisit)}</div>
    <details><summary>Accessibility Attributes</summary><pre>${escapeHtml(attrs)}</pre></details>
    <details><summary>Complete Cache Feature</summary><pre>${escapeHtml(JSON.stringify(element.cacheFeature ?? null, null, 2))}</pre></details>
    ${element.notes ? `<p class="notes">Manual Review Notes: ${escapeHtml(element.notes)}</p>` : ''}
  </article>`;
}

function renderTreeRow(node: TreeNodeAuditRecord): string {
  const identity = treeNodeIdentity(node);
  return `<tr>
    <td>${escapeHtml(node.nodeId)}</td>
    <td>${node.depth}</td>
    <td><code>${escapeHtml(node.type)}</code></td>
    <td>${escapeHtml(identity)}</td>
    <td>${node.visible ? 'Yes' : 'No'}</td>
    <td>${node.interactive ? 'Yes' : 'No'}</td>
    <td><code>${escapeHtml(node.structuralXpath)}</code></td>
    <td>${node.cacheFeatureXpaths.length}</td>
    <td>${node.cacheSelectedOther ? escapeHtml(node.cacheSelectedNodeId ?? 'Another node') : ''}</td>
  </tr>`;
}

function treeNodeIdentity(node: TreeNodeAuditRecord): string {
  return (
    node.attrs['resource-id'] ||
    node.attrs['content-desc'] ||
    node.attrs.text ||
    ''
  );
}

function renderTreeHierarchy(nodes: TreeNodeAuditRecord[]): string {
  const childrenByParent = new Map<string | null, TreeNodeAuditRecord[]>();
  for (const node of nodes) {
    const siblings = childrenByParent.get(node.parentNodeId) ?? [];
    siblings.push(node);
    childrenByParent.set(node.parentNodeId, siblings);
  }

  const renderNode = (node: TreeNodeAuditRecord): string => {
    const identity = treeNodeIdentity(node);
    const children = childrenByParent.get(node.nodeId) ?? [];
    const cacheCandidates = renderCacheXpathCandidates(node);
    const parentNodeId = node.parentNodeId ?? '';
    const open = node.depth <= 1 ? ' open' : '';
    return `<details class="ui-tree-node" data-tree-node-id="${escapeHtml(node.nodeId)}" data-parent-node-id="${escapeHtml(parentNodeId)}"${open}>
      <summary><span class="tree-node-id">${escapeHtml(node.nodeId)}</span><code class="tree-node-type">${escapeHtml(node.type)}</code>${identity ? `<span class="tree-node-identity">${escapeHtml(identity)}</span>` : ''}<span class="tree-node-badge ${node.visible ? 'visible' : 'hidden'}">${node.visible ? 'Visible' : 'Hidden'}</span>${node.interactive ? '<span class="tree-node-badge interactive">Interactive</span>' : ''}<span class="tree-node-badge">Cache XPath ${node.cacheFeatureXpaths.length}</span></summary>
      <div class="tree-node-diagnostics">
        <dl>
          <div><dt>Parent Node</dt><dd>${escapeHtml(node.parentNodeId ?? 'Root node')}</dd></div>
          <div><dt>Depth / Child Index</dt><dd>${node.depth} / ${node.childIndex}</dd></div>
          <div><dt>Bounds</dt><dd><code>${escapeHtml(JSON.stringify(node.bounds))}</code></dd></div>
          <div><dt>Production Point Selection</dt><dd>${escapeHtml(node.cacheSelectedNodeId ?? 'None')}</dd></div>
          <div class="tree-node-xpath"><dt>Structural XPath</dt><dd><code>${escapeHtml(node.structuralXpath)}</code></dd></div>
        </dl>
        ${node.failureReason ? `<p class="failure">Reason: ${escapeHtml(formatDiagnosticMessage(node.failureReason))}</p>` : ''}
        <details class="tree-node-cache"><summary>Midscene Cache XPath Candidates</summary><ol class="candidates">${cacheCandidates}</ol></details>
        <details class="tree-node-attrs"><summary>Accessibility Attributes</summary><pre>${escapeHtml(JSON.stringify(node.attrs, null, 2))}</pre></details>
      </div>
      ${children.length ? `<div class="tree-children">${children.map(renderNode).join('')}</div>` : ''}
    </details>`;
  };

  const roots = childrenByParent.get(null) ?? [];
  return roots.length
    ? roots.map(renderNode).join('')
    : '<div class="empty">No normalized UiNode tree nodes.</div>';
}

export function renderPageHtml(
  metadata: PageMetadata,
  inventory: VisualInventory,
  elements: PageElementsFile,
  replayResults: ReplayResultsFile,
): string {
  const screenshot = metadata.device.resolution.screenshot;
  const markers = elements.visualElements
    .map((element) => {
      const left = (element.rect.left / screenshot.width) * 100;
      const top = (element.rect.top / screenshot.height) * 100;
      const width = (element.rect.width / screenshot.width) * 100;
      const height = (element.rect.height / screenshot.height) * 100;
      const presentation = STATUS_PRESENTATION[element.status];
      return `<button class="marker tooltip ${escapeHtml(element.status)}" data-element-id="${escapeHtml(element.id)}" data-tooltip="${escapeHtml(`${presentation.label}: ${presentation.description}`)}" aria-label="${escapeHtml(`${element.ordinal}. ${element.name}: ${presentation.label}. ${presentation.description}`)}" style="left:${formatPercent(left)};top:${formatPercent(top)};width:${formatPercent(width)};height:${formatPercent(height)}"><span>${element.ordinal}</span></button>`;
    })
    .join('');
  const visualDetails = elements.visualElements
    .map(renderVisualDetail)
    .join('');
  const treeHierarchy = renderTreeHierarchy(elements.treeNodes);
  const treeRows = elements.treeNodes.map(renderTreeRow).join('');
  const treePanel = `<section class="tree"><h2>Complete Normalized UiNode Tree (${elements.treeNodes.length} nodes)</h2><p class="muted">The hierarchy follows the captured Accessibility parent-child relationships. Structural XPaths are diagnostic only; cache candidates come from the current production generator.</p><div class="tree-controls"><button type="button" data-tree-action="expand">Expand All</button><button type="button" data-tree-action="collapse">Collapse All</button></div><div class="ui-tree-hierarchy">${treeHierarchy}</div><details class="flat-tree"><summary>Flat Diagnostic Table (${elements.treeNodes.length} nodes)</summary><div class="table-wrap"><table><thead><tr><th>Node</th><th>Depth</th><th>Type</th><th>Identity Fields</th><th>Visible</th><th>Interactive</th><th>Structural XPath</th><th>Cache XPath</th><th>Selected Another Node</th></tr></thead><tbody>${treeRows}</tbody></table></div></details></section>`;
  const reviewBanner = inventory.reviewed
    ? `<div class="banner ok">The manual visual element inventory has been reviewed (${inventory.elements.length} elements).</div>`
    : '<div class="banner warning">Incomplete: edit visual-elements.json, enumerate every visible interactive element, map treeNodeId to a node or set it to null, inspect the complete screenshot manually, set reviewed to true, and render again.</div>';
  const techEvidence = metadata.technology.evidence.length
    ? metadata.technology.evidence
        .map((item) => `<li>${escapeHtml(technologyEvidenceLabel(item))}</li>`)
        .join('')
    : '<li>No technology-stack evidence was recorded.</li>';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(pageLabel(metadata.pageId))} · Android XPath Audit</title>
  <style>
    :root{color-scheme:dark;--bg:#0b1020;--panel:#131a2c;--line:#29334d;--text:#e7ecf7;--muted:#9aa7c2;--green:#2dd4a8;--yellow:#fbbf24;--red:#fb7185;--blue:#60a5fa;--purple:#c084fc}
    *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 ui-sans-serif,system-ui,sans-serif}button{font:inherit}a{color:#93c5fd}code,pre{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}code{overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere}.page{max-width:1600px;margin:auto;padding:28px}.top{display:flex;justify-content:space-between;gap:20px;align-items:start}.top h1{margin:0 0 6px;font-size:30px}.muted{color:var(--muted)}.banner{margin:20px 0;padding:12px 15px;border:1px solid;border-radius:10px}.banner.ok{border-color:#166534;background:#052e26}.banner.warning{border-color:#92400e;background:#2d1d05}.status-legend{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 20px;padding:12px 15px;border:1px solid var(--line);border-radius:10px;background:var(--panel)}.tooltip{position:relative}.tooltip::after{position:absolute;z-index:1000;left:50%;bottom:calc(100% + 8px);width:max-content;max-width:360px;padding:8px 10px;border:1px solid #52617f;border-radius:8px;background:#07101f;color:var(--text);box-shadow:0 8px 24px #0009;content:attr(data-tooltip);font-size:13px;font-weight:400;line-height:1.5;text-align:left;white-space:normal;opacity:0;visibility:hidden;transform:translateX(-50%);transition:opacity .12s ease;pointer-events:none}.tooltip:hover::after,.tooltip:focus-visible::after{opacity:1;visibility:visible}.layout{display:grid;grid-template-columns:minmax(360px,0.9fr) minmax(480px,1.1fr);gap:22px;align-items:start}.right-column{min-width:0}.right-column>.tree{margin-top:0}.right-column>.details-panel{margin-top:22px}.shot-panel,.details-panel,.metadata,.tree{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px}.shot{position:relative;line-height:0}.shot img{display:block;width:100%;height:auto;border-radius:9px}.marker{position:absolute;padding:0;border:2px solid var(--blue);background:#60a5fa22;cursor:pointer;min-width:16px;min-height:16px}.marker.tooltip::after{left:0;top:calc(100% + 8px);bottom:auto;min-width:260px;transform:none}.marker span{position:absolute;left:-2px;top:-24px;min-width:22px;height:22px;padding:1px 5px;border-radius:99px;background:var(--blue);color:#07111f;font-weight:800;line-height:20px}.marker.cache-xpath-hit{border-color:var(--green);background:#2dd4a822}.marker.cache-xpath-hit span{background:var(--green)}.marker.not-exposed,.marker.exposed-no-safe-xpath{border-color:var(--red);background:#fb718522}.marker.not-exposed span,.marker.exposed-no-safe-xpath span{background:var(--red)}.marker.tree-only-positional{border-color:var(--yellow);background:#fbbf2422}.marker.tree-only-positional span{background:var(--yellow)}.marker.point-selected-other{border-color:var(--purple);background:#c084fc22}.marker.point-selected-other span{background:var(--purple)}.element-card{border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:14px}.element-card.selected{outline:2px solid var(--blue)}.element-card header{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:start}.element-card h3,.element-card p{margin:0}.number{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--blue);color:#08101f;font-weight:800}.status{padding:3px 8px;border-radius:99px;background:#26314b;font-size:12px;cursor:help}.status.cache-xpath-hit{color:var(--green)}.status.not-exposed,.status.exposed-no-safe-xpath{color:var(--red)}.status.tree-only-positional{color:var(--yellow)}.status.point-selected-other{color:var(--purple)}dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:14px 0}dl div{border-top:1px solid var(--line);padding-top:7px}dt{color:var(--muted);font-size:12px}dd{margin:2px 0}.failure{color:#fecdd3}.candidates{padding-left:20px}.candidates li{margin:8px 0}.candidates span{display:block;color:var(--muted);font-size:12px}.replay-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.replay{border:1px solid var(--line);border-radius:8px;padding:10px}.replay strong,.replay code,.replay span{display:block}.replay.hit strong{color:var(--green)}.replay.miss strong,.replay.wrong-target strong{color:var(--red)}.replay.pending strong{color:var(--yellow)}details{margin-top:10px}summary{cursor:pointer}.metadata,.tree{margin-top:22px}.metadata-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:15px}.metadata-grid section{border-left:2px solid var(--line);padding-left:12px}.metadata h2,.tree h2{margin-top:0}.tree-controls{display:flex;gap:8px;margin:14px 0}.tree-controls button{padding:6px 10px;border:1px solid var(--line);border-radius:7px;background:#172039;color:var(--text);cursor:pointer}.tree-controls button:hover{border-color:var(--blue)}.ui-tree-hierarchy{max-height:760px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:10px;background:#0e1528}.ui-tree-node{margin:0 0 0 18px;border-left:1px solid #31405f}.ui-tree-hierarchy>.ui-tree-node{margin-left:0;border-left:0}.ui-tree-node>summary{padding:5px 8px;border-radius:6px;white-space:nowrap}.ui-tree-node>summary:hover{background:#172039}.tree-node-id{display:inline-block;min-width:86px;color:var(--blue);font-weight:700}.tree-node-type{margin-right:8px}.tree-node-identity{display:inline-block;max-width:580px;margin-right:8px;color:#dbeafe;overflow:hidden;text-overflow:ellipsis;vertical-align:bottom}.tree-node-badge{display:inline-block;margin-left:5px;padding:1px 6px;border-radius:99px;background:#26314b;color:var(--muted);font-size:11px}.tree-node-badge.visible{color:var(--green)}.tree-node-badge.hidden{color:var(--yellow)}.tree-node-badge.interactive{color:var(--purple)}.tree-node-diagnostics{margin:2px 8px 8px 27px;padding:8px 12px;border-left:2px solid var(--line);background:#111a2f}.tree-node-diagnostics dl{grid-template-columns:repeat(4,minmax(0,1fr));margin:0}.tree-node-diagnostics .tree-node-xpath{grid-column:1/-1}.tree-node-diagnostics .tree-node-cache,.tree-node-diagnostics .tree-node-attrs{margin-top:8px}.tree-children{margin-left:8px}.flat-tree{margin-top:18px}.flat-tree>summary{font-weight:700}.table-wrap{overflow:auto;max-height:680px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:7px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{position:sticky;top:0;background:#172039;z-index:1}.empty{padding:30px;text-align:center;color:var(--muted)}
    @media(max-width:1000px){.layout{grid-template-columns:1fr}.metadata-grid{grid-template-columns:1fr}.page{padding:16px}}
  </style>
</head>
<body><main class="page">
  <div class="top"><div><a href="../../index.html">← Back to Run Summary</a><h1>${escapeHtml(pageLabel(metadata.pageId))}</h1><div class="muted">${escapeHtml(metadata.pageId)} · ${escapeHtml(metadata.app.package)} · ${escapeHtml(metadata.app.activity)} · tree source: ${escapeHtml(metadata.sourceUsed)}</div></div><div>Updated: ${escapeHtml(metadata.updatedAt)}</div></div>
  ${reviewBanner}
  ${renderStatusLegend()}
  <div class="layout">
    <section class="shot-panel"><div class="shot"><img src="screenshot.png" alt="${escapeHtml(pageLabel(metadata.pageId))} screenshot">${markers}</div></section>
    <div class="right-column">
      ${treePanel}
      <section class="details-panel">${visualDetails || '<div class="empty">No visual elements have been reviewed.</div>'}</section>
    </div>
  </div>
  <section class="metadata"><h2>Evidence and Replay Summary</h2><div class="metadata-grid">
    <section><h3>Device</h3><p>${escapeHtml(metadata.device.manufacturer)} ${escapeHtml(metadata.device.model)} · Android ${escapeHtml(metadata.device.androidVersion)} (API ${escapeHtml(metadata.device.apiLevel)})</p><p>${metadata.device.resolution.screenshot.width}×${metadata.device.resolution.screenshot.height} screenshot · density ${metadata.device.density} · DPR ${metadata.device.dpr} · rotation ${metadata.device.rotation}</p></section>
    <section><h3>Technology Assessment</h3><p>${escapeHtml(metadata.technology.declaredStack === 'unknown' ? 'Unknown' : metadata.technology.declaredStack)} · ${escapeHtml(confidenceLabel(metadata.technology.confidence))}</p><ul>${techEvidence}</ul></section>
    <section><h3>Replay</h3><p>Fresh: ${replayResults.phases.fresh.hits}/${replayResults.phases.fresh.eligible} (${formatRate(replayResults.phases.fresh.hitRate)})</p><p>Revisit: ${replayResults.phases.revisit.hits}/${replayResults.phases.revisit.eligible} (${formatRate(replayResults.phases.revisit.hitRate)})</p><p>Wrong mappings: ${replayResults.phases.fresh.wrongMappings + replayResults.phases.revisit.wrongMappings}</p></section>
  </div><details><summary>Complete Metadata (Raw JSON)</summary><pre>${escapeHtml(JSON.stringify(metadata, null, 2))}</pre></details></section>
</main>
<script>
for(const marker of document.querySelectorAll('[data-element-id]')){marker.addEventListener('click',()=>{const id=marker.getAttribute('data-element-id');for(const card of document.querySelectorAll('[data-detail-id]'))card.classList.toggle('selected',card.getAttribute('data-detail-id')===id);const target=document.querySelector('[data-detail-id="'+CSS.escape(id)+'"]');target?.scrollIntoView({behavior:'smooth',block:'center'});});}
for(const control of document.querySelectorAll('[data-tree-action]')){control.addEventListener('click',()=>{const open=control.getAttribute('data-tree-action')==='expand';for(const node of document.querySelectorAll('.ui-tree-hierarchy details.ui-tree-node'))node.open=open;});}
</script></body></html>`;
}

function renderRunIndex(run: RunMetadata, summary: RunSummary): string {
  const rows = summary.pages
    .map((page) => {
      const gate = gatePresentation(page.rolloutGate.status);
      const stack =
        page.technology.declaredStack === 'unknown'
          ? 'Unknown'
          : page.technology.declaredStack;
      return `<tr>
        <td><a href="pages/${escapeHtml(page.pageId)}/annotated.html">${escapeHtml(pageLabel(page.pageId))}</a><br><span class="muted">${escapeHtml(page.pageId)}</span></td>
        <td>${escapeHtml(stack)} <span class="muted">(${escapeHtml(confidenceLabel(page.technology.confidence))})</span></td>
        <td>${page.treeNodeCount}</td><td>${page.visualElementCount}</td><td>${page.exposedVisualElementCount}</td><td>${page.safeXpathCount}</td>
        <td>${page.fresh.hits}/${page.fresh.eligible} (${formatRate(page.fresh.hitRate)})</td>
        <td>${page.revisit.hits}/${page.revisit.eligible} (${formatRate(page.revisit.hitRate)})</td>
        <td>${page.wrongMappings}</td><td><span class="gate tooltip ${page.rolloutGate.status}" tabindex="0" data-tooltip="${escapeHtml(gate.description)}" aria-label="${escapeHtml(`${gate.label}: ${gate.description}`)}">${escapeHtml(gate.label)}</span></td>
      </tr>`;
    })
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Android XPath Audit ${escapeHtml(run.runId)}</title><style>
  :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0b1020;color:#e7ecf7;font:14px/1.5 ui-sans-serif,system-ui,sans-serif}.page{max-width:1500px;margin:auto;padding:30px}h1{margin-bottom:4px}.muted{color:#9aa7c2}a{color:#93c5fd}section{margin-top:24px;background:#131a2c;border:1px solid #29334d;border-radius:14px;padding:18px}.cards{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}.card{background:#172039;border-radius:10px;padding:12px}.card strong{display:block;font-size:24px}.table{overflow:auto}table{width:100%;border-collapse:collapse}th,td{padding:10px;border-bottom:1px solid #29334d;text-align:left;white-space:nowrap}.tooltip{position:relative}.tooltip::after{position:absolute;z-index:1000;left:50%;bottom:calc(100% + 8px);width:300px;padding:8px 10px;border:1px solid #52617f;border-radius:8px;background:#07101f;color:#e7ecf7;box-shadow:0 8px 24px #0009;content:attr(data-tooltip);font-size:13px;font-weight:400;line-height:1.5;text-align:left;white-space:normal;opacity:0;visibility:hidden;transform:translateX(-50%);transition:opacity .12s ease;pointer-events:none}.tooltip:hover::after,.tooltip:focus-visible::after{opacity:1;visibility:visible}.gate{padding:3px 8px;border-radius:99px;background:#26314b;cursor:help}.gate.pass{color:#2dd4a8}.gate.fail{color:#fb7185}.gate.incomplete{color:#fbbf24}@media(max-width:900px){.cards{grid-template-columns:1fr 1fr}.page{padding:15px}}</style></head><body><main class="page"><h1>Android Accessibility XPath Audit</h1><p class="muted">Run ${escapeHtml(run.runId)} · ${escapeHtml(run.repository.branch)} @ ${escapeHtml(run.repository.commit)}</p><section class="cards"><div class="card"><span>Pages</span><strong>${summary.totals.pages}</strong></div><div class="card"><span>Tree Nodes</span><strong>${summary.totals.treeNodes}</strong></div><div class="card"><span>Visual Interactive Elements</span><strong>${summary.totals.visualElements}</strong></div><div class="card"><span>Safe XPaths</span><strong>${summary.totals.safeXpaths}</strong></div><div class="card"><span>Wrong Mappings</span><strong>${summary.totals.wrongMappings}</strong></div></section><section><h2>Tree → XPath → Stable Replay</h2><div class="table"><table><thead><tr><th>Page</th><th>Technology Evidence</th><th>Tree Nodes</th><th>Visual Elements</th><th>Exposed</th><th>Safe XPaths</th><th>Fresh Replay</th><th>Revisit Replay</th><th>Wrong Mappings</th><th>Acceptance Gate</th></tr></thead><tbody>${rows}</tbody></table></div></section></main></body></html>`;
}

function phaseFileNames(phase: CapturePhase): {
  screenshot: string;
  yadb: string;
  uiautomator: string;
  used: string;
} {
  if (phase === 'source') {
    return {
      screenshot: 'screenshot.png',
      yadb: 'yadb.xml',
      uiautomator: 'uiautomator.xml',
      used: 'source-used.xml',
    };
  }
  return {
    screenshot: `${phase}-screenshot.png`,
    yadb: `${phase}-yadb.xml`,
    uiautomator: `${phase}-uiautomator.xml`,
    used: `${phase}-replay.xml`,
  };
}

async function capturePhaseArtifacts(
  adb: ADB,
  pageDir: string,
  phase: CapturePhase,
): Promise<{
  metadata: PhaseCaptureMetadata;
  screenshot: Buffer;
}> {
  const phaseStartedAt = nowIso();
  const screenshot = await captureScreenshot(adb);
  const screenshotCapturedAt = nowIso();
  const tree = await captureTree(adb);
  const names = phaseFileNames(phase);
  await writeFile(join(pageDir, names.screenshot), screenshot);

  const sourceMetadata: PhaseCaptureMetadata['sources'] = {};
  for (const result of tree.successes) {
    const file = result.source === 'yadb' ? names.yadb : names.uiautomator;
    await writeFile(join(pageDir, file), result.xml, 'utf8');
    sourceMetadata[result.source] = {
      ...artifactMetadata(file, result.capturedAt, result.xml),
      source: result.source,
      attempts: result.attempts,
      durationMs: result.durationMs,
    };
  }
  await writeFile(join(pageDir, names.used), tree.selected.xml, 'utf8');

  return {
    screenshot,
    metadata: {
      phase,
      capturedAt: phaseStartedAt,
      treeSource: tree.selected.source,
      screenshot: artifactMetadata(
        names.screenshot,
        screenshotCapturedAt,
        screenshot,
      ),
      usedXml: artifactMetadata(
        names.used,
        tree.selected.capturedAt,
        tree.selected.xml,
      ),
      sources: sourceMetadata,
      sourceFailures: tree.failures,
    },
  };
}

async function collectPageMetadata(
  adb: ADB,
  options: CaptureCliOptions,
  capture: PhaseCaptureMetadata,
  screenshot: Buffer,
): Promise<PageMetadata> {
  const screenshotMetadata = await sharp(screenshot).metadata();
  if (!screenshotMetadata.width || !screenshotMetadata.height) {
    throw new Error('Unable to determine screenshot dimensions');
  }
  const environment = await collectAndroidAuditEnvironment(adb, {
    deviceId: options.device,
    expectedPackage: options.app,
    screenshotSize: {
      width: screenshotMetadata.width,
      height: screenshotMetadata.height,
    },
  });
  const createdAt = nowIso();

  return {
    schemaVersion: AUDIT_SCHEMA_VERSION,
    reportKind: 'cli-capture',
    pageId: options.page,
    createdAt,
    updatedAt: createdAt,
    ...environment,
    entryPath: options.entryPath,
    technology: options.technology,
    sourceUsed: capture.treeSource,
    captures: { source: capture },
  };
}

async function repositoryMetadata(): Promise<RunMetadata['repository']> {
  try {
    const [{ stdout: branch }, { stdout: commit }] = await Promise.all([
      execFileAsync('git', ['branch', '--show-current'], { cwd: REPO_ROOT }),
      execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT }),
    ]);
    return {
      root: REPO_ROOT,
      branch: branch.trim(),
      commit: commit.trim(),
    };
  } catch (error) {
    throw new Error(`Unable to read repository metadata: ${String(error)}`);
  }
}

async function createRunMetadata(runId: string): Promise<RunMetadata> {
  const createdAt = nowIso();
  return {
    schemaVersion: AUDIT_SCHEMA_VERSION,
    reportKind: 'cli-capture',
    runId,
    createdAt,
    updatedAt: createdAt,
    repository: await repositoryMetadata(),
    pages: [],
  };
}

async function initializeVisualInventory(
  pageDir: string,
  externalFile: string | undefined,
): Promise<void> {
  const destination = join(pageDir, 'visual-elements.json');
  if (externalFile) {
    const inventory = validateVisualInventory(
      await readJson<VisualInventory>(resolve(externalFile)),
    );
    await writeJson(destination, inventory);
    return;
  }
  if (!(await pathExists(destination))) {
    await writeJson(destination, emptyVisualInventory());
  }
}

async function rebuildPageArtifacts(pageDir: string): Promise<PageSummary> {
  const metadata = await readJson<PageMetadata>(join(pageDir, 'metadata.json'));
  const inventory = validateVisualInventory(
    await readJson<VisualInventory>(join(pageDir, 'visual-elements.json')),
  );
  const sourceRoot = uiautomatorXmlToUiNode(
    await readFile(join(pageDir, 'source-used.xml'), 'utf8'),
    metadata.device.dpr,
  );
  const freshPath = join(pageDir, 'fresh-replay.xml');
  const revisitPath = join(pageDir, 'revisit-replay.xml');
  const freshRoot = (await pathExists(freshPath))
    ? uiautomatorXmlToUiNode(
        await readFile(freshPath, 'utf8'),
        metadata.device.dpr,
      )
    : undefined;
  const revisitRoot = (await pathExists(revisitPath))
    ? uiautomatorXmlToUiNode(
        await readFile(revisitPath, 'utf8'),
        metadata.device.dpr,
      )
    : undefined;
  const screenshot = metadata.device.resolution.screenshot;
  const logical = metadata.device.resolution.logical;
  const data = buildPageAuditData(
    inventory,
    sourceRoot,
    freshRoot,
    revisitRoot,
    {
      screenshotWidth: screenshot.width,
      screenshotHeight: screenshot.height,
      logicalWidth: logical.width,
      logicalHeight: logical.height,
    },
  );
  await Promise.all([
    writeJson(join(pageDir, 'ui-tree.json'), sourceRoot),
    writeJson(join(pageDir, 'elements.json'), data.elements),
    writeJson(join(pageDir, 'replay-results.json'), data.replayResults),
    writeFile(
      join(pageDir, 'annotated.html'),
      renderPageHtml(metadata, inventory, data.elements, data.replayResults),
      'utf8',
    ),
  ]);
  return buildPageSummary(metadata, inventory, data);
}

function buildRunSummary(run: RunMetadata, pages: PageSummary[]): RunSummary {
  return {
    schemaVersion: AUDIT_SCHEMA_VERSION,
    reportKind: 'cli-capture',
    generatedAt: nowIso(),
    runId: run.runId,
    pages,
    totals: {
      pages: pages.length,
      completePages: pages.filter((page) => page.completeness.complete).length,
      treeNodes: pages.reduce((sum, page) => sum + page.treeNodeCount, 0),
      visualElements: pages.reduce(
        (sum, page) => sum + page.visualElementCount,
        0,
      ),
      exposedVisualElements: pages.reduce(
        (sum, page) => sum + page.exposedVisualElementCount,
        0,
      ),
      safeXpaths: pages.reduce((sum, page) => sum + page.safeXpathCount, 0),
      freshHits: pages.reduce((sum, page) => sum + page.fresh.hits, 0),
      revisitHits: pages.reduce((sum, page) => sum + page.revisit.hits, 0),
      wrongMappings: pages.reduce((sum, page) => sum + page.wrongMappings, 0),
    },
  };
}

export async function rebuildRunReport(runDir: string): Promise<RunSummary> {
  const runPath = join(runDir, 'run.json');
  const run = await readJson<RunMetadata>(runPath);
  const pages: PageSummary[] = [];
  for (const pageId of run.pages) {
    pages.push(await rebuildPageArtifacts(join(runDir, 'pages', pageId)));
  }
  run.updatedAt = nowIso();
  const summary = buildRunSummary(run, pages);
  await Promise.all([
    writeJson(runPath, run),
    writeJson(join(runDir, 'summary.json'), summary),
    writeFile(join(runDir, 'index.html'), renderRunIndex(run, summary), 'utf8'),
  ]);
  return summary;
}

async function prepareYadb(adb: ADB): Promise<void> {
  const yadbPath = join(REPO_ROOT, 'packages', 'android', 'bin', 'yadb');
  if (!(await pathExists(yadbPath))) {
    writeStderr(
      `YADB binary is missing at ${yadbPath}; UIAutomator fallback will still be attempted.`,
    );
    return;
  }
  try {
    await adb.push(yadbPath, '/data/local/tmp');
  } catch (error) {
    writeStderr(
      `Unable to push YADB; UIAutomator fallback will still be attempted: ${String(error)}`,
    );
  }
}

async function connectAdb(device: string): Promise<ADB> {
  const adb = await createAndroidAdb({
    adbExecTimeout: 60_000,
    deviceId: device,
  });
  adb.setDeviceId(device);
  const devices = await adb.getConnectedDevices();
  if (!devices.some((candidate) => candidate.udid === device)) {
    throw new Error(`Android device ${device} is not connected`);
  }
  await prepareYadb(adb);
  return adb;
}

async function assertFocusedPackage(
  adb: ADB,
  expectedPackage: string,
): Promise<void> {
  const { appPackage } = await adb.getFocusedPackageAndActivity();
  if (!appPackage) {
    throw new Error('Unable to determine the focused Android package');
  }
  if (appPackage !== expectedPackage) {
    throw new Error(
      `Focused package ${appPackage} does not match requested app ${expectedPackage}`,
    );
  }
}

async function resolveRunDir(
  outputRoot: string,
  runId: string | undefined,
  pageId?: string,
): Promise<string> {
  if (runId) {
    assertSafeId(runId, 'Run id');
    const runDir = join(outputRoot, runId);
    if (!(await pathExists(join(runDir, 'run.json')))) {
      throw new Error(`Run ${runId} does not exist under ${outputRoot}`);
    }
    return runDir;
  }

  if (!(await pathExists(outputRoot))) {
    throw new Error(`No audit runs exist under ${outputRoot}`);
  }
  const candidates: Array<{ path: string; modified: number }> = [];
  for (const entry of await readdir(outputRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(outputRoot, entry.name);
    if (!(await pathExists(join(path, 'run.json')))) continue;
    if (
      pageId &&
      !(await pathExists(join(path, 'pages', pageId, 'metadata.json')))
    ) {
      continue;
    }
    candidates.push({ path, modified: (await stat(path)).mtimeMs });
  }
  candidates.sort((a, b) => b.modified - a.modified);
  if (!candidates[0]) {
    throw new Error(
      pageId
        ? `No audit run contains page ${pageId}`
        : `No audit runs exist under ${outputRoot}`,
    );
  }
  return candidates[0].path;
}

async function captureSource(options: CaptureCliOptions): Promise<string> {
  const runId = options.runId ?? defaultRunId();
  assertSafeId(runId, 'Run id');
  assertSafeId(options.page, 'Page id');
  const adb = await connectAdb(options.device);
  await assertFocusedPackage(adb, options.app);
  const runDir = join(options.outputRoot, runId);
  const runPath = join(runDir, 'run.json');
  let run: RunMetadata;
  if (await pathExists(runPath)) {
    run = await readJson<RunMetadata>(runPath);
  } else {
    await mkdir(join(runDir, 'pages'), { recursive: true });
    run = await createRunMetadata(runId);
    await writeJson(runPath, run);
  }
  const pageDir = join(runDir, 'pages', options.page);
  if (await pathExists(join(pageDir, 'metadata.json'))) {
    throw new Error(
      `Source data already exists for ${options.page} in run ${runId}; use a new run id instead of overwriting evidence`,
    );
  }
  await mkdir(pageDir, { recursive: true });
  const source = await capturePhaseArtifacts(adb, pageDir, 'source');
  const metadata = await collectPageMetadata(
    adb,
    options,
    source.metadata,
    source.screenshot,
  );
  await initializeVisualInventory(pageDir, options.visualElementsFile);
  if (!run.pages.includes(options.page)) run.pages.push(options.page);
  run.updatedAt = nowIso();
  await Promise.all([
    writeJson(join(pageDir, 'metadata.json'), metadata),
    writeJson(runPath, run),
  ]);
  await rebuildRunReport(runDir);

  const fresh = await capturePhaseArtifacts(adb, pageDir, 'fresh');
  metadata.captures.fresh = fresh.metadata;
  metadata.updatedAt = nowIso();
  await writeJson(join(pageDir, 'metadata.json'), metadata);
  await rebuildRunReport(runDir);
  writeStdout(`Captured source and fresh evidence: ${pageDir}`);
  writeStdout(`Run id: ${runId}`);
  writeStdout(
    `Next: review ${join(pageDir, 'visual-elements.json')}, leave and revisit the page, then capture --phase revisit --run-id ${runId}.`,
  );
  return runDir;
}

async function captureExistingPhase(
  options: CaptureCliOptions,
): Promise<string> {
  const runDir = await resolveRunDir(
    options.outputRoot,
    options.runId,
    options.page,
  );
  const pageDir = join(runDir, 'pages', options.page);
  const metadataPath = join(pageDir, 'metadata.json');
  const metadata = await readJson<PageMetadata>(metadataPath);
  if (metadata.device.serial !== options.device) {
    throw new Error(
      `Run page was captured on ${metadata.device.serial}, not ${options.device}`,
    );
  }
  if (metadata.app.expectedPackage !== options.app) {
    throw new Error(
      `Run page expects ${metadata.app.expectedPackage}, not ${options.app}`,
    );
  }
  if (metadata.captures[options.phase]) {
    throw new Error(
      `${options.phase} evidence already exists; start a new run instead of overwriting immutable capture data`,
    );
  }
  const adb = await connectAdb(options.device);
  await assertFocusedPackage(adb, options.app);
  const capture = await capturePhaseArtifacts(adb, pageDir, options.phase);
  metadata.captures[options.phase] = capture.metadata;
  metadata.updatedAt = nowIso();
  await writeJson(metadataPath, metadata);
  await rebuildRunReport(runDir);
  writeStdout(`Captured ${options.phase} evidence: ${pageDir}`);
  return runDir;
}

async function runCapture(options: CaptureCliOptions): Promise<void> {
  if (options.phase === 'source') await captureSource(options);
  else await captureExistingPhase(options);
}

async function runRender(options: RenderCliOptions): Promise<void> {
  const runDir = await resolveRunDir(
    options.outputRoot,
    options.runId,
    options.page,
  );
  if (options.page) {
    assertSafeId(options.page, 'Page id');
    if (
      !(await pathExists(join(runDir, 'pages', options.page, 'metadata.json')))
    ) {
      throw new Error(`Run does not contain page ${options.page}`);
    }
  }
  const summary = await rebuildRunReport(runDir);
  writeStdout(
    `Rendered ${summary.pages.length} page(s): ${join(runDir, 'index.html')}`,
  );
}

function optionValues(args: string[]): Map<string, string[]> {
  const values = new Map<string, string[]>();
  for (let index = 0; index < args.length; index++) {
    const option = args[index];
    if (!option.startsWith('--')) {
      throw new Error(`Unexpected argument: ${option}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Option ${option} requires a value`);
    }
    const existing = values.get(option) ?? [];
    existing.push(value);
    values.set(option, existing);
    index++;
  }
  return values;
}

function oneOption(
  values: Map<string, string[]>,
  option: string,
): string | undefined {
  const entries = values.get(option);
  if (!entries) return undefined;
  if (entries.length !== 1) {
    throw new Error(`Option ${option} may only be specified once`);
  }
  return entries[0];
}

function rejectUnknownOptions(
  values: Map<string, string[]>,
  allowed: readonly string[],
): void {
  const allowedSet = new Set(allowed);
  for (const option of values.keys()) {
    if (!allowedSet.has(option)) throw new Error(`Unknown option: ${option}`);
  }
}

function parsePhase(value: string | undefined): CapturePhase {
  const phase = value ?? 'source';
  if (phase !== 'source' && phase !== 'fresh' && phase !== 'revisit') {
    throw new Error('--phase must be source, fresh, or revisit');
  }
  return phase;
}

function parseTechnologyConfidence(
  value: string | undefined,
): TechnologyConfidence {
  const confidence = value ?? 'unknown';
  if (
    confidence !== 'confirmed' &&
    confidence !== 'strong' &&
    confidence !== 'suspected' &&
    confidence !== 'unknown'
  ) {
    throw new Error(
      '--tech-confidence must be confirmed, strong, suspected, or unknown',
    );
  }
  return confidence;
}

export function parseCliOptions(args: string[]): CliOptions {
  const command = args[0];
  if (command !== 'capture' && command !== 'render') {
    throw new Error('First argument must be capture or render');
  }
  const values = optionValues(args.slice(1));
  const outputRoot = resolve(
    oneOption(values, '--output-root') ?? DEFAULT_OUTPUT_ROOT,
  );
  const runId = oneOption(values, '--run-id') ?? oneOption(values, '--run');
  if (values.has('--run-id') && values.has('--run')) {
    throw new Error('Use either --run-id or --run, not both');
  }
  if (runId) assertSafeId(runId, 'Run id');

  if (command === 'render') {
    rejectUnknownOptions(values, [
      '--output-root',
      '--run-id',
      '--run',
      '--page',
    ]);
    const page = oneOption(values, '--page');
    if (page) assertSafeId(page, 'Page id');
    return { command, outputRoot, runId, page };
  }

  rejectUnknownOptions(values, [
    '--phase',
    '--device',
    '--app',
    '--page',
    '--run-id',
    '--run',
    '--output-root',
    '--entry-path',
    '--tech-stack',
    '--tech-confidence',
    '--tech-evidence',
    '--visual-elements',
  ]);
  const device = oneOption(values, '--device');
  const page = oneOption(values, '--page');
  if (!device) throw new Error('capture requires --device <adb-serial>');
  if (!page) throw new Error('capture requires --page <page-id>');
  assertSafeId(page, 'Page id');
  const phase = parsePhase(oneOption(values, '--phase'));
  const visualElementsFile = oneOption(values, '--visual-elements');
  if (phase !== 'source' && visualElementsFile) {
    throw new Error('--visual-elements is only accepted for source capture');
  }
  const evidence = values.get('--tech-evidence') ?? [];
  const confidence = parseTechnologyConfidence(
    oneOption(values, '--tech-confidence'),
  );
  const declaredStack = oneOption(values, '--tech-stack') ?? 'unknown';
  if (confidence !== 'unknown' && evidence.length === 0) {
    throw new Error(
      `Technology confidence ${confidence} requires at least one --tech-evidence value`,
    );
  }
  const app = oneOption(values, '--app') ?? DEFAULT_PACKAGE;
  assertAndroidPackage(app);

  return {
    command,
    phase,
    device,
    app,
    page,
    runId,
    outputRoot,
    entryPath:
      oneOption(values, '--entry-path') ?? 'manual navigation; not supplied',
    technology: { declaredStack, confidence, evidence },
    ...(visualElementsFile
      ? { visualElementsFile: resolve(visualElementsFile) }
      : {}),
  };
}

export function helpText(): string {
  return `Android Accessibility XPath Audit

Usage:
  pnpm exec tsx packages/android/scripts/accessibility-xpath-audit.ts capture \\
    --device <adb-serial> --app ${DEFAULT_PACKAGE} --page <page-id> [options]

  pnpm exec tsx packages/android/scripts/accessibility-xpath-audit.ts capture \\
    --phase revisit --run-id <run-id> --device <adb-serial> --app ${DEFAULT_PACKAGE} --page <page-id>

  pnpm exec tsx packages/android/scripts/accessibility-xpath-audit.ts render --run-id <run-id>

Capture options:
  --phase <source|fresh|revisit>    Default: source. Source automatically captures an immediate fresh tree.
  --run-id <id>                    Reuse a run for additional pages or replay phases.
  --output-root <path>             Default: midscene_run/douyin-xpath-audit.
  --entry-path <description>       Manual navigation path used to reach the page.
  --tech-stack <name>              Declared framework/stack. Default: unknown.
  --tech-confidence <level>        confirmed, strong, suspected, or unknown.
  --tech-evidence <text>           Repeat for each independent framework clue.
  --visual-elements <json>         Seed the human-reviewed visual inventory for source capture.

Workflow:
  1. Run source capture; source and fresh evidence are saved without overwriting prior data.
  2. Edit pages/<page-id>/visual-elements.json and map each visible control to treeNodeId or null.
  3. Leave and re-enter the page, then run --phase revisit with the same run id.
  4. Run render after any manual inventory edits.
`;
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    writeStdout(helpText());
    return;
  }
  const options = parseCliOptions(args);
  if (options.command === 'capture') await runCapture(options);
  else await runRender(options);
}

const invokedAsScript = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : '';
if (import.meta.url === invokedAsScript) {
  main().catch((error) => {
    writeStderr(`Android XPath audit failed: ${String(error)}`);
    process.exitCode = 1;
  });
}
