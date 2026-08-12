import { getDebug } from '@midscene/shared/logger';
import {
  DEFAULT_MIDSCENE_RECORDER_MARKDOWN_MAX_SCREENSHOTS,
  createMidsceneRecorderMarkdownScreenshotAssets,
  getMidsceneRecorderEventDescription,
  getMidsceneRecorderSemantic,
  sanitizeMidsceneRecorderFileName,
  selectMidsceneRecorderScreenshotEvents,
} from '@midscene/shared/recorder';
import type {
  ElectronShellApi,
  RecorderArchiveAssetEntry,
  RecorderArchiveProgress,
  RecorderArchiveTextEntry,
  SaveFileFilter,
} from '@shared/electron-contract';
import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from 'fflate';
import JSZip from 'jszip';
import { createSecureRecorderId } from './secure-id';
import type { StudioRecordedEvent, StudioRecordingSession } from './types';

const debugRecorderExport = getDebug('studio:recorder-export', {
  console: true,
});

export async function materializeStudioRecorderSessionScreenshots(
  session: StudioRecordingSession,
  loadScreenshot: (assetId: string) => Promise<string | null>,
  maxScreenshots = DEFAULT_MIDSCENE_RECORDER_MARKDOWN_MAX_SCREENSHOTS,
): Promise<StudioRecordingSession> {
  const selectedIndexes = new Set(
    selectMidsceneRecorderScreenshotEvents(
      session.events,
      Math.max(0, maxScreenshots),
    ).map((selection) => selection.eventIndex),
  );
  const events: StudioRecordedEvent[] = [];
  for (const [eventIndex, event] of session.events.entries()) {
    if (!selectedIndexes.has(eventIndex)) {
      const {
        screenshotAsset: _screenshotAsset,
        screenshotBefore: _screenshotBefore,
        screenshotAfter: _screenshotAfter,
        screenshotWithBox: _screenshotWithBox,
        ...eventWithoutScreenshot
      } = event;
      events.push(eventWithoutScreenshot as StudioRecordedEvent);
      continue;
    }
    if (!event.screenshotAsset) {
      events.push(event);
      continue;
    }
    const screenshot = await loadScreenshot(event.screenshotAsset.id);
    if (!screenshot) {
      throw new Error(
        `Recorder screenshot asset is unavailable: ${event.screenshotAsset.id}`,
      );
    }
    events.push({
      ...event,
      screenshotAsset: undefined,
      screenshotWithBox: screenshot,
    });
  }
  return { ...session, events };
}

function getElectronShell(): Pick<
  ElectronShellApi,
  'chooseFileSavePath' | 'writeFile'
> {
  const shell = (globalThis.window as Window | undefined)?.electronShell;
  if (!shell?.chooseFileSavePath || !shell?.writeFile) {
    throw new Error('Studio file export bridge is unavailable.');
  }
  return shell;
}

function getRecorderArchiveShell(): ElectronShellApi | undefined {
  return (globalThis.window as Window | undefined)?.electronShell;
}

function isMissingGenericFileBridgeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('No handler registered') &&
    (message.includes('choose-file-save-path') ||
      message.includes('write-file'))
  );
}

function getExportMimeType(filters: SaveFileFilter[]) {
  const extension = filters[0]?.extensions[0];
  switch (extension) {
    case 'json':
      return 'application/json';
    case 'yaml':
    case 'yml':
      return 'application/x-yaml';
    case 'zip':
      return 'application/zip';
    case 'md':
    case 'markdown':
      return 'text/markdown';
    default:
      return 'text/plain';
  }
}

function base64ToBytes(value: string) {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function decodedBase64ByteLength(value: string) {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((value.length * 3) / 4) - padding);
}

function recorderArchiveAbortError() {
  const error = new Error('Recorder archive export was cancelled.');
  error.name = 'AbortError';
  return error;
}

function throwIfRecorderArchiveAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw recorderArchiveAbortError();
  }
}

interface BrowserFileSystemWritable {
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort?(reason?: unknown): Promise<void>;
}

export interface BrowserRecorderArchiveFileHandle {
  createWritable(): Promise<BrowserFileSystemWritable>;
}

type BrowserFilePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: Array<{
      description: string;
      accept: Record<string, string[]>;
    }>;
  }) => Promise<BrowserRecorderArchiveFileHandle>;
};

function browserRecorderArchivePickerOptions(defaultFileName: string) {
  return {
    suggestedName: defaultFileName,
    types: [
      {
        description: 'ZIP Archive',
        accept: { 'application/zip': ['.zip'] },
      },
    ],
  };
}

/**
 * Opens the browser picker while the caller still owns transient user
 * activation. Electron owns its destination picker, so the browser picker
 * must not reserve a second, empty file when both APIs are exposed.
 * `undefined` means unsupported or delegated to Electron; `null` means
 * user-cancelled.
 */
export async function chooseBrowserRecorderArchiveFile(
  defaultFileName: string,
): Promise<BrowserRecorderArchiveFileHandle | null | undefined> {
  if (getRecorderArchiveShell()?.chooseFileSavePath) {
    return undefined;
  }
  const picker = (window as BrowserFilePickerWindow).showSaveFilePicker;
  if (!picker) {
    return undefined;
  }
  try {
    return await picker(browserRecorderArchivePickerOptions(defaultFileName));
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return null;
    }
    if (
      error instanceof Error &&
      (error.name === 'SecurityError' || error.name === 'NotAllowedError')
    ) {
      debugRecorderExport(
        'browser recorder archive picker is unavailable; using download fallback %o',
        { error: error.message },
      );
      return undefined;
    }
    throw error;
  }
}

async function saveBrowserRecorderArchiveStream(options: {
  defaultFileName: string;
  plan: StudioRecorderArchivePlan;
  fileHandle?: BrowserRecorderArchiveFileHandle | null;
  getAssetUrl?: (assetId: string) => string | null;
  loadAsset?: (assetId: string) => Promise<string | null>;
  onProgress?: (progress: RecorderArchiveProgress) => void;
  signal?: AbortSignal;
}) {
  const hasPreselectedHandle = Object.prototype.hasOwnProperty.call(
    options,
    'fileHandle',
  );
  const selectedHandle = hasPreselectedHandle
    ? options.fileHandle
    : await chooseBrowserRecorderArchiveFile(options.defaultFileName);
  if (selectedHandle === undefined) {
    return false;
  }
  if (selectedHandle === null) {
    return true;
  }
  throwIfRecorderArchiveAborted(options.signal);
  const writable = await selectedHandle.createWritable();
  const jobId = createSecureRecorderId('browser-recorder-archive');
  const startedAt = performance.now();
  const totalBytes =
    options.plan.textEntries.reduce(
      (total, entry) => total + strToU8(entry.content).byteLength,
      0,
    ) +
    options.plan.assetEntries.reduce((total, entry) => total + entry.bytes, 0);
  let processedBytes = 0;
  let outputBytes = 0;
  let writeChain = Promise.resolve();
  let resolveCompleted!: () => void;
  let rejectCompleted!: (error: unknown) => void;
  const completed = new Promise<void>((resolve, reject) => {
    resolveCompleted = resolve;
    rejectCompleted = reject;
  });
  const zip = new Zip((error, data, final) => {
    if (error) {
      rejectCompleted(error);
      return;
    }
    outputBytes += data.byteLength;
    writeChain = writeChain.then(() => writable.write(data));
    if (final) {
      writeChain.then(resolveCompleted, rejectCompleted);
    }
  });
  const reportProgress = (phase: RecorderArchiveProgress['phase']) => {
    options.onProgress?.({
      jobId,
      processedBytes: Math.min(processedBytes, totalBytes),
      totalBytes,
      phase,
      elapsedMs: performance.now() - startedAt,
    });
  };

  try {
    debugRecorderExport('browser recorder archive write started %o', {
      jobId,
      textEntryCount: options.plan.textEntries.length,
      assetEntryCount: options.plan.assetEntries.length,
      inputBytes: totalBytes,
    });
    reportProgress('write');
    for (const entry of options.plan.textEntries) {
      throwIfRecorderArchiveAborted(options.signal);
      const data = strToU8(entry.content);
      const file = new ZipDeflate(entry.archivePath, { level: 6 });
      zip.add(file);
      file.push(data, true);
      processedBytes += data.byteLength;
      await writeChain;
      reportProgress('write');
    }
    for (const entry of options.plan.assetEntries) {
      throwIfRecorderArchiveAborted(options.signal);
      const file = new ZipPassThrough(entry.archivePath);
      zip.add(file);
      const assetUrl = options.getAssetUrl?.(entry.assetId);
      if (assetUrl) {
        const response = await fetch(assetUrl, { signal: options.signal });
        if (!response.ok) {
          throw new Error(
            `Recorder screenshot asset request failed (${response.status}): ${entry.assetId}`,
          );
        }
        if (response.body) {
          const reader = response.body.getReader();
          while (true) {
            const result = await reader.read();
            if (result.done) {
              break;
            }
            throwIfRecorderArchiveAborted(options.signal);
            file.push(result.value);
            processedBytes += result.value.byteLength;
            await writeChain;
            reportProgress('write');
          }
          file.push(new Uint8Array(), true);
        } else {
          const bytes = new Uint8Array(await response.arrayBuffer());
          file.push(bytes, true);
          processedBytes += bytes.byteLength;
        }
      } else {
        const asset = await options.loadAsset?.(entry.assetId);
        if (!asset) {
          throw new Error(
            `Recorder screenshot asset is unavailable: ${entry.assetId}`,
          );
        }
        const base64 = asset.split(';base64,')[1];
        if (!base64) {
          throw new Error(
            `Recorder screenshot asset is not a data URL: ${entry.assetId}`,
          );
        }
        const bytes = base64ToBytes(base64);
        file.push(bytes, true);
        processedBytes += bytes.byteLength;
      }
      await writeChain;
      reportProgress('write');
    }
    zip.end();
    await completed;
    throwIfRecorderArchiveAborted(options.signal);
    reportProgress('commit');
    await writable.close();
    processedBytes = totalBytes;
    reportProgress('completed');
    debugRecorderExport('browser recorder archive write completed %o', {
      jobId,
      inputBytes: totalBytes,
      outputBytes,
      textEntryCount: options.plan.textEntries.length,
      assetEntryCount: options.plan.assetEntries.length,
      totalDurationMs: performance.now() - startedAt,
    });
    return true;
  } catch (error) {
    zip.terminate();
    await writable.abort?.(error).catch(() => undefined);
    debugRecorderExport('browser recorder archive write failed %o', {
      jobId,
      elapsedMs: performance.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function triggerBrowserDownload(options: {
  defaultFileName: string;
  content: string;
  encoding?: 'utf-8' | 'base64';
  filters: SaveFileFilter[];
}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Studio file export bridge is unavailable.');
  }

  const data =
    options.encoding === 'base64'
      ? base64ToBytes(options.content)
      : options.content;
  const blob = new Blob([data], { type: getExportMimeType(options.filters) });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = options.defaultFileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
}

function sanitizeFileName(value: string) {
  return sanitizeMidsceneRecorderFileName(value);
}

function scalarToYaml(value: string | number | boolean) {
  return JSON.stringify(value);
}

function eventDescription(event: StudioRecordedEvent) {
  return getMidsceneRecorderEventDescription(event);
}

function markdownTableCell(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>');
}

export interface StudioRecorderSessionFacts {
  totalEvents: number;
  actionCount: number;
  eventTypeCounts: Record<string, number>;
  actionSequence?: {
    first: number;
    last: number;
    uniqueCount: number;
    missing: number[];
    duplicates: number[];
  };
}

export function createStudioRecorderSessionFacts(
  session: Pick<StudioRecordingSession, 'events'>,
): StudioRecorderSessionFacts {
  const eventTypeCounts = session.events.reduce<Record<string, number>>(
    (counts, event) => {
      counts[event.type] = (counts[event.type] || 0) + 1;
      return counts;
    },
    {},
  );
  const actionSequences = session.events
    .filter(
      (event) =>
        !event.parentEventId &&
        typeof event.sequence === 'number' &&
        Number.isFinite(event.sequence) &&
        event.sequence > 0,
    )
    .map((event) => event.sequence as number);
  const sequenceCounts = new Map<number, number>();
  for (const sequence of actionSequences) {
    sequenceCounts.set(sequence, (sequenceCounts.get(sequence) || 0) + 1);
  }
  const uniqueSequences = Array.from(sequenceCounts.keys()).sort(
    (left, right) => left - right,
  );
  const first = uniqueSequences[0];
  const last = uniqueSequences.at(-1);
  const missing =
    first === undefined || last === undefined
      ? []
      : Array.from(
          { length: last - first + 1 },
          (_, index) => first + index,
        ).filter((sequence) => !sequenceCounts.has(sequence));
  const duplicates = Array.from(sequenceCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([sequence]) => sequence);
  const fallbackActionCount = session.events.filter(
    (event) =>
      !event.parentEventId &&
      event.type !== 'navigation' &&
      event.type !== 'setViewport',
  ).length;
  return {
    totalEvents: session.events.length,
    actionCount:
      actionSequences.length > 0 ? uniqueSequences.length : fallbackActionCount,
    eventTypeCounts: Object.fromEntries(
      Object.entries(eventTypeCounts).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
    ...(first !== undefined && last !== undefined
      ? {
          actionSequence: {
            first,
            last,
            uniqueCount: uniqueSequences.length,
            missing,
            duplicates,
          },
        }
      : {}),
  };
}

export function createStudioRecorderDeterministicDescription(
  session: Pick<StudioRecordingSession, 'events'>,
) {
  const facts = createStudioRecorderSessionFacts(session);
  const typeSummary = Object.entries(facts.eventTypeCounts)
    .map(([type, count]) => `${type}: ${count}`)
    .join(', ');
  const sequenceSummary = facts.actionSequence
    ? ` Action sequence ${facts.actionSequence.first}-${facts.actionSequence.last}` +
      ` (${facts.actionSequence.uniqueCount} unique` +
      `${facts.actionSequence.missing.length ? `, missing ${facts.actionSequence.missing.join(', ')}` : ''}` +
      `${facts.actionSequence.duplicates.length ? `, duplicates ${facts.actionSequence.duplicates.join(', ')}` : ''}).`
    : '';
  return `Recorded ${facts.totalEvents} events and ${facts.actionCount} user actions${
    typeSummary ? ` (${typeSummary})` : ''
  }.${sequenceSummary}`;
}

interface RecorderManifestScreenshotEvidence {
  eventIndex: number;
  relativePath: string;
  assetId?: string;
  mimeType: string;
  bytes?: number;
  sha256?: string;
}

function createMarkdownReplayManifest(
  session: StudioRecordingSession,
  source: 'ai' | 'local-fallback',
  screenshotEvidence: RecorderManifestScreenshotEvidence[] = [],
  screenshotSelectionLimit = DEFAULT_MIDSCENE_RECORDER_MARKDOWN_MAX_SCREENSHOTS,
) {
  type ManifestSemantic = {
    source: string;
    status: string;
    confidence?: string;
    error?: string;
    aiDescribe?: {
      verifyPassed?: boolean;
      deepLocate?: boolean;
      centerDistance?: number;
      annotatedScreenshotPath?: string;
    };
    fallbackFrom?: ManifestSemantic;
  };
  const serializeSemantic = (
    semantic: ReturnType<typeof getMidsceneRecorderSemantic>,
  ): ManifestSemantic | undefined => {
    if (!semantic) {
      return undefined;
    }
    return {
      source: semantic.source,
      status: semantic.status,
      confidence: semantic.confidence,
      ...(semantic.error ? { error: semantic.error } : {}),
      ...(semantic.aiDescribe
        ? {
            aiDescribe: {
              verifyPassed: semantic.aiDescribe.verifyPassed,
              deepLocate: semantic.aiDescribe.deepLocate,
              centerDistance: semantic.aiDescribe.centerDistance,
              annotatedScreenshotPath:
                semantic.aiDescribe.annotatedScreenshotPath,
            },
          }
        : {}),
      ...(semantic.fallbackFrom
        ? { fallbackFrom: serializeSemantic(semantic.fallbackFrom) }
        : {}),
    };
  };
  const screenshotEvidenceByEventIndex = new Map(
    screenshotEvidence.map((evidence) => [evidence.eventIndex, evidence]),
  );
  const screenshotCandidateIndexes = session.events
    .map((event, eventIndex) =>
      event.screenshotAsset ||
      event.screenshotBefore ||
      event.screenshotAfter ||
      event.screenshotWithBox
        ? eventIndex
        : -1,
    )
    .filter((eventIndex) => eventIndex >= 0);
  const screenshotCandidateIndexSet = new Set(screenshotCandidateIndexes);
  const selectedScreenshotIndexes = Array.from(
    screenshotEvidenceByEventIndex.keys(),
  ).sort((left, right) => left - right);
  const eligibleScreenshotIndexes = new Set(
    selectMidsceneRecorderScreenshotEvents(
      session.events,
      session.events.length,
    ).map((selection) => selection.eventIndex),
  );
  const intendedScreenshotIndexes = new Set(
    selectMidsceneRecorderScreenshotEvents(
      session.events,
      Math.max(0, screenshotSelectionLimit),
    ).map((selection) => selection.eventIndex),
  );
  const omittedScreenshotIndexes = screenshotCandidateIndexes.filter(
    (eventIndex) => !screenshotEvidenceByEventIndex.has(eventIndex),
  );
  const unavailableScreenshotIndexes = session.events
    .map((_event, eventIndex) => eventIndex)
    .filter((eventIndex) => !screenshotCandidateIndexSet.has(eventIndex));
  const events = session.events.map((event, eventIndex) => {
    const semantic = getMidsceneRecorderSemantic(event);
    const evidence = screenshotEvidenceByEventIndex.get(eventIndex);
    return {
      index: eventIndex + 1,
      hashId: event.hashId,
      eventId: event.eventId,
      sequence: event.sequence,
      parentEventId: event.parentEventId,
      type: event.type,
      actionType: event.actionType,
      capture: {
        status: event.captureStatus,
        error: event.captureError,
      },
      frame: event.frame,
      ...(evidence
        ? {
            screenshot: {
              path: evidence.relativePath,
              assetId: evidence.assetId,
              mimeType: evidence.mimeType,
              bytes: evidence.bytes,
              sha256: evidence.sha256,
            },
          }
        : {}),
      screenshotSelection: evidence
        ? { status: 'selected' as const }
        : screenshotCandidateIndexSet.has(eventIndex)
          ? {
              status: 'omitted' as const,
              reason: intendedScreenshotIndexes.has(eventIndex)
                ? ('asset-unavailable' as const)
                : eligibleScreenshotIndexes.has(eventIndex)
                  ? ('selection-limit' as const)
                  : ('selection-policy' as const),
            }
          : { status: 'unavailable' as const },
      semantic: serializeSemantic(semantic) || {
        source: 'heuristic',
        status: 'ready',
        confidence: 'low',
      },
    };
  });
  const descriptionSourceCounts = events.reduce<Record<string, number>>(
    (counts, event) => {
      counts[event.semantic.source] = (counts[event.semantic.source] || 0) + 1;
      return counts;
    },
    {},
  );
  const screenshotOmissionReasonCounts = events.reduce<Record<string, number>>(
    (counts, event) => {
      if (event.screenshotSelection.status === 'omitted') {
        const reason = event.screenshotSelection.reason;
        counts[reason] = (counts[reason] || 0) + 1;
      }
      return counts;
    },
    {},
  );

  return JSON.stringify(
    {
      artifact: 'markdown-replay',
      markdownSource: source,
      aiGenerated: source === 'ai',
      sessionId: session.id,
      sessionName: session.name,
      exportedAt: new Date().toISOString(),
      facts: createStudioRecorderSessionFacts(session),
      deterministicDescription:
        createStudioRecorderDeterministicDescription(session),
      aiNarrative: session.metadataDescription,
      finalization: session.finalization,
      enrichment: {
        session: session.enrichment,
        exportedDescriptionSourceCounts: descriptionSourceCounts,
        unresolvedEventIndexes: events
          .filter((event) => event.semantic.status !== 'ready')
          .map((event) => event.index),
      },
      descriptionSourceCounts,
      visualEvidence: {
        selectionLimit: Math.max(0, screenshotSelectionLimit),
        candidateCount: screenshotCandidateIndexes.length,
        selectedCount: selectedScreenshotIndexes.length,
        omittedCount: omittedScreenshotIndexes.length,
        unavailableCount: unavailableScreenshotIndexes.length,
        omissionReasonCounts: screenshotOmissionReasonCounts,
        selectedEventIndexes: selectedScreenshotIndexes.map(
          (eventIndex) => eventIndex + 1,
        ),
        omittedEventIndexes: omittedScreenshotIndexes.map(
          (eventIndex) => eventIndex + 1,
        ),
        unavailableEventIndexes: unavailableScreenshotIndexes.map(
          (eventIndex) => eventIndex + 1,
        ),
      },
      events,
    },
    null,
    2,
  );
}

function targetText(session: StudioRecordingSession) {
  return (
    session.url ||
    session.target.values.url ||
    session.target.label ||
    session.target.deviceId ||
    'Recorded target'
  );
}

function stepText(event: StudioRecordedEvent) {
  const description = eventDescription(event);
  switch (event.type) {
    case 'navigation':
      return event.url ? `Open ${event.url}` : description;
    case 'click': {
      const semantic = getMidsceneRecorderSemantic(event);
      return semantic?.elementDescription
        ? `Tap "${description}"`
        : `Tap the recorded target. Recorded hint: ${description}`;
    }
    case 'input':
      return `Input ${JSON.stringify(event.value || '')} into "${description}"`;
    case 'keydown':
      return `Press ${event.value || description}`;
    case 'scroll':
      return `Scroll as recorded: ${description}`;
    default:
      return description;
  }
}

function eventToYamlFlow(event: StudioRecordedEvent) {
  const description = eventDescription(event);
  switch (event.type) {
    case 'click':
      return [`      - aiTap: ${scalarToYaml(description)}`];
    case 'input':
      return [
        `      - aiInput: ${scalarToYaml(description)}`,
        `        value: ${scalarToYaml(event.value || '')}`,
      ];
    case 'keydown':
      return [`      - aiKeyboardPress: ${scalarToYaml(event.value || '')}`];
    case 'scroll':
      return [`      - aiAction: ${scalarToYaml(description)}`];
    case 'navigation':
      return [`      - aiAction: ${scalarToYaml(description)}`];
    default:
      return [`      - aiAction: ${scalarToYaml(description)}`];
  }
}

export function generateStudioRecorderJson(session: StudioRecordingSession) {
  return JSON.stringify(session, null, 2);
}

export function generateStudioRecorderMarkdown(
  sessions: StudioRecordingSession[],
) {
  const lines = ['# Midscene Studio Recordings', ''];
  for (const session of sessions) {
    lines.push(
      `## ${session.name}`,
      '',
      `- Platform: ${session.target.platformId}`,
      `- Target: ${
        session.url ||
        session.target.label ||
        session.target.deviceId ||
        'Unknown'
      }`,
      session.description ? `- Description: ${session.description}` : '',
      `- Events: ${session.events.length}`,
      `- Updated: ${new Date(session.updatedAt).toISOString()}`,
      '',
      '| # | Type | Description |',
      '| --- | --- | --- |',
    );
    if (session.events.length === 0) {
      lines.push('| - | - | No events recorded |');
    } else {
      session.events.forEach((event, index) => {
        lines.push(
          `| ${index + 1} | ${event.type} | ${markdownTableCell(eventDescription(event))} |`,
        );
      });
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

export function generateStudioRecorderYaml(session: StudioRecordingSession) {
  const lines = [
    '# Generated locally from recorded events, not AI-generated.',
    '# Generate YAML in Studio before replaying for higher fidelity.',
    `# Generated from Midscene Studio Recorder: ${session.name}`,
    `${session.target.platformId}:`,
  ];

  const targetValues = Object.entries(session.target.values);
  if (targetValues.length > 0) {
    for (const [key, value] of targetValues) {
      lines.push(`  ${key}: ${scalarToYaml(value)}`);
    }
  } else {
    lines.push('  # No target metadata recorded');
  }

  lines.push(
    '',
    'tasks:',
    `  - name: ${scalarToYaml(session.name)}`,
    '    flow:',
  );
  if (session.events.length === 0) {
    lines.push('      - aiAssert: "Recording has no events yet"');
  } else {
    for (const event of session.events) {
      lines.push(...eventToYamlFlow(event));
    }
  }

  return `${lines.join('\n')}\n`;
}

export function generateStudioRecorderMarkdownReplay(
  session: StudioRecordingSession,
) {
  const lines = [
    `# ${session.name}`,
    '',
    '> Generated locally from recorded events, not AI-generated. Generate Markdown in Studio before replaying for higher fidelity.',
    '',
    '## Goal',
    'Reproduce the recorded user workflow exactly.',
    '',
    '## Target',
    `- Platform: ${session.target.platformId}`,
    `- Start target: ${targetText(session)}`,
    '',
    '## Replay rules',
    '- Follow the steps in order.',
    '- Do not invent alternative navigation paths.',
    '- If a referenced target cannot be found, stop and report the missing step.',
    '',
    '## Steps',
  ];

  if (session.events.length === 0) {
    lines.push('1. Stop. This recording has no events to replay.');
  } else {
    session.events.forEach((event, index) => {
      lines.push(`${index + 1}. ${stepText(event)}`);
    });
  }

  return `${lines.join('\n')}\n`;
}

export function generateStudioRecorderPlaywright(
  session: StudioRecordingSession,
) {
  if (session.target.platformId !== 'web') {
    return null;
  }

  const url = String(session.target.values.url || '');
  const lines = [
    "import { test, expect } from '@playwright/test';",
    '',
    `test(${JSON.stringify(session.name)}, async ({ page }) => {`,
  ];

  if (url) {
    lines.push(`  await page.goto(${JSON.stringify(url)});`);
  }

  for (const event of session.events) {
    const description = eventDescription(event);
    switch (event.type) {
      case 'click':
        lines.push(`  // ${description}`);
        lines.push(
          `  await page.mouse.click(${event.elementRect?.x ?? 0}, ${
            event.elementRect?.y ?? 0
          });`,
        );
        break;
      case 'input':
        lines.push(`  // ${description}`);
        lines.push(
          `  await page.keyboard.type(${JSON.stringify(event.value || '')});`,
        );
        break;
      case 'keydown':
        lines.push(
          `  await page.keyboard.press(${JSON.stringify(event.value || '')});`,
        );
        break;
      case 'navigation':
        if (event.actionType === 'GoBack') {
          lines.push('  await page.goBack();');
        } else if (event.actionType === 'GoForward') {
          lines.push('  await page.goForward();');
        } else if (event.actionType === 'Reload') {
          lines.push('  await page.reload();');
        } else if (event.url) {
          lines.push(`  await page.goto(${JSON.stringify(event.url)});`);
        } else {
          lines.push(`  // ${description}`);
        }
        break;
      default:
        lines.push(`  // ${description}`);
    }
  }

  lines.push('  await expect(page).toBeDefined();', '});', '');
  return lines.join('\n');
}

export async function createStudioRecorderZipBase64(
  sessions: StudioRecordingSession[],
) {
  const zip = new JSZip();
  zip.file('recordings.md', generateStudioRecorderMarkdown(sessions));
  for (const session of sessions) {
    const baseName = `${sanitizeFileName(session.name)}-${session.id}`;
    const markdownSource = session.generatedCode?.markdown
      ? 'ai'
      : 'local-fallback';
    const markdown =
      session.generatedCode?.markdown ||
      generateStudioRecorderMarkdownReplay(session);
    const screenshots = createMidsceneRecorderMarkdownScreenshotAssets(
      session.events,
    );
    zip.file(`markdown/${baseName}/recording.md`, markdown);
    zip.file(
      `markdown/${baseName}/recording.manifest.json`,
      createMarkdownReplayManifest(
        session,
        markdownSource,
        screenshots.map((screenshot) => ({
          eventIndex: screenshot.eventIndex,
          relativePath: screenshot.relativePath.replace(/^\.\//, ''),
          mimeType: screenshot.mimeType,
          bytes: decodedBase64ByteLength(screenshot.base64Data),
        })),
      ),
    );
    for (const screenshot of screenshots) {
      zip.file(
        `markdown/${baseName}/${screenshot.relativePath.replace(/^\.\//, '')}`,
        screenshot.base64Data,
        { base64: true },
      );
    }
    zip.file(
      `${baseName}.yaml`,
      session.generatedCode?.yaml || generateStudioRecorderYaml(session),
    );
    const playwright =
      session.generatedCode?.playwright ||
      generateStudioRecorderPlaywright(session);
    if (playwright) {
      zip.file(`${baseName}.spec.ts`, playwright);
    }
  }
  return zip.generateAsync({ type: 'base64' });
}

export async function createStudioRecorderMarkdownZipBase64(
  session: StudioRecordingSession,
) {
  const zip = new JSZip();
  const markdownSource = session.generatedCode?.markdown
    ? 'ai'
    : 'local-fallback';
  const markdown =
    session.generatedCode?.markdown ||
    generateStudioRecorderMarkdownReplay(session);
  const screenshots = createMidsceneRecorderMarkdownScreenshotAssets(
    session.events,
  );
  zip.file('recording.md', markdown);
  zip.file(
    'recording.manifest.json',
    createMarkdownReplayManifest(
      session,
      markdownSource,
      screenshots.map((screenshot) => ({
        eventIndex: screenshot.eventIndex,
        relativePath: screenshot.relativePath.replace(/^\.\//, ''),
        mimeType: screenshot.mimeType,
        bytes: decodedBase64ByteLength(screenshot.base64Data),
      })),
    ),
  );
  for (const screenshot of screenshots) {
    zip.file(
      screenshot.relativePath.replace(/^\.\//, ''),
      screenshot.base64Data,
      {
        base64: true,
      },
    );
  }
  return zip.generateAsync({ type: 'base64' });
}

export interface StudioRecorderArchivePlan {
  textEntries: RecorderArchiveTextEntry[];
  assetEntries: RecorderArchiveAssetEntry[];
}

function createRecorderArchiveAssetEntries(
  session: StudioRecordingSession,
  archiveBaseDir: string,
  maxScreenshots: number,
) {
  const entries: RecorderArchiveAssetEntry[] = [];
  const evidence: RecorderManifestScreenshotEvidence[] = [];
  const selections = selectMidsceneRecorderScreenshotEvents(
    session.events,
    maxScreenshots,
  );
  for (const { eventIndex } of selections) {
    const event = session.events[eventIndex];
    const asset = event.screenshotAsset;
    if (!asset) {
      continue;
    }
    const safeType = event.type.replace(/[^a-zA-Z0-9-]/g, '-');
    const extension = asset.mimeType.includes('jpeg') ? 'jpg' : 'png';
    const fileName = `event-${String(eventIndex + 1).padStart(3, '0')}-${safeType}.${extension}`;
    entries.push({
      archivePath: `${archiveBaseDir}/${fileName}`,
      assetId: asset.id,
      mimeType: asset.mimeType,
      bytes: asset.bytes,
      sha256: asset.sha256,
    });
    evidence.push({
      eventIndex,
      relativePath: `screenshots/${fileName}`,
      assetId: asset.id,
      mimeType: asset.mimeType,
      bytes: asset.bytes,
      sha256: asset.sha256,
    });
  }
  return { entries, evidence };
}

export function createStudioRecorderArchivePlan(
  sessions: StudioRecordingSession[],
): StudioRecorderArchivePlan {
  const textEntries: RecorderArchiveTextEntry[] = [
    {
      archivePath: 'recordings.md',
      content: generateStudioRecorderMarkdown(sessions),
    },
  ];
  const assetEntries: RecorderArchiveAssetEntry[] = [];
  let remainingScreenshots = DEFAULT_MIDSCENE_RECORDER_MARKDOWN_MAX_SCREENSHOTS;
  for (const session of sessions) {
    const baseName = `${sanitizeFileName(session.name)}-${session.id}`;
    const markdownSource = session.generatedCode?.markdown
      ? 'ai'
      : 'local-fallback';
    const markdown =
      session.generatedCode?.markdown ||
      generateStudioRecorderMarkdownReplay(session);
    const sessionAssets = createRecorderArchiveAssetEntries(
      session,
      `markdown/${baseName}/screenshots`,
      remainingScreenshots,
    );
    textEntries.push(
      {
        archivePath: `markdown/${baseName}/recording.md`,
        content: markdown,
      },
      {
        archivePath: `markdown/${baseName}/recording.manifest.json`,
        content: createMarkdownReplayManifest(
          session,
          markdownSource,
          sessionAssets.evidence,
          remainingScreenshots,
        ),
      },
      {
        archivePath: `${baseName}.yaml`,
        content:
          session.generatedCode?.yaml || generateStudioRecorderYaml(session),
      },
    );
    const playwright =
      session.generatedCode?.playwright ||
      generateStudioRecorderPlaywright(session);
    if (playwright) {
      textEntries.push({
        archivePath: `${baseName}.spec.ts`,
        content: playwright,
      });
    }
    assetEntries.push(...sessionAssets.entries);
    remainingScreenshots -= sessionAssets.entries.length;
  }
  return { textEntries, assetEntries };
}

export function createStudioRecorderMarkdownArchivePlan(
  session: StudioRecordingSession,
): StudioRecorderArchivePlan {
  const markdownSource = session.generatedCode?.markdown
    ? 'ai'
    : 'local-fallback';
  const assets = createRecorderArchiveAssetEntries(
    session,
    'screenshots',
    DEFAULT_MIDSCENE_RECORDER_MARKDOWN_MAX_SCREENSHOTS,
  );
  return {
    textEntries: [
      {
        archivePath: 'recording.md',
        content:
          session.generatedCode?.markdown ||
          generateStudioRecorderMarkdownReplay(session),
      },
      {
        archivePath: 'recording.manifest.json',
        content: createMarkdownReplayManifest(
          session,
          markdownSource,
          assets.evidence,
        ),
      },
    ],
    assetEntries: assets.entries,
  };
}

export async function saveStudioRecorderArchive(options: {
  title: string;
  defaultFileName: string;
  plan: StudioRecorderArchivePlan;
  createFallbackContent: () => Promise<string>;
  onProgress?: (progress: RecorderArchiveProgress) => void;
  signal?: AbortSignal;
  browserFileHandle?: BrowserRecorderArchiveFileHandle | null;
  getAssetUrl?: (assetId: string) => string | null;
  loadAsset?: (assetId: string) => Promise<string | null>;
}) {
  throwIfRecorderArchiveAborted(options.signal);
  const shell = getRecorderArchiveShell();
  if (!shell?.chooseFileSavePath) {
    if (
      await saveBrowserRecorderArchiveStream({
        defaultFileName: options.defaultFileName,
        plan: options.plan,
        ...(Object.prototype.hasOwnProperty.call(options, 'browserFileHandle')
          ? { fileHandle: options.browserFileHandle }
          : {}),
        getAssetUrl: options.getAssetUrl,
        loadAsset: options.loadAsset,
        onProgress: options.onProgress,
        signal: options.signal,
      })
    ) {
      return;
    }
    triggerBrowserDownload({
      defaultFileName: options.defaultFileName,
      content: await options.createFallbackContent(),
      encoding: 'base64',
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
    });
    return;
  }

  const chooseStartedAt = performance.now();
  const targetPath = await shell.chooseFileSavePath({
    title: options.title,
    defaultFileName: options.defaultFileName,
    filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
  });
  if (!targetPath) {
    return;
  }
  debugRecorderExport('recorder archive destination selected %o', {
    targetPath,
    chooseDurationMs: performance.now() - chooseStartedAt,
    textEntryCount: options.plan.textEntries.length,
    assetEntryCount: options.plan.assetEntries.length,
  });
  throwIfRecorderArchiveAborted(options.signal);

  if (!shell.streamRecorderArchive) {
    await shell.writeFile({
      path: targetPath,
      content: await options.createFallbackContent(),
      encoding: 'base64',
    });
    return;
  }

  const jobId = createSecureRecorderId('recorder-archive');
  const unsubscribe = options.onProgress
    ? shell.onRecorderArchiveProgress((progress) => {
        if (progress.jobId === jobId) {
          options.onProgress?.(progress);
        }
      })
    : undefined;
  const cancelArchive = () => {
    if (shell.cancelRecorderArchive) {
      void shell.cancelRecorderArchive(jobId);
    }
  };
  options.signal?.addEventListener('abort', cancelArchive, { once: true });
  try {
    let result: Awaited<ReturnType<ElectronShellApi['streamRecorderArchive']>>;
    try {
      result = await shell.streamRecorderArchive({
        jobId,
        path: targetPath,
        ...options.plan,
      });
    } catch (error) {
      // Electron serializes main-process errors and may not preserve `name`.
      // The renderer owns the cancellation signal, so use it as the canonical
      // source when normalizing the result for callers.
      if (options.signal?.aborted) {
        throw recorderArchiveAbortError();
      }
      throw error;
    }
    debugRecorderExport('recorder archive stream completed %o', {
      jobId,
      targetPath,
      bytesWritten: result.bytesWritten,
      metrics: result.metrics,
    });
    return result;
  } finally {
    options.signal?.removeEventListener('abort', cancelArchive);
    unsubscribe?.();
  }
}

export async function saveStudioRecorderFile(options: {
  defaultFileName: string;
  content: string;
  filters: SaveFileFilter[];
  title: string;
  encoding?: 'utf-8' | 'base64';
}) {
  let shell: Pick<ElectronShellApi, 'chooseFileSavePath' | 'writeFile'>;
  try {
    shell = getElectronShell();
  } catch {
    triggerBrowserDownload(options);
    return;
  }

  try {
    const path = await shell.chooseFileSavePath({
      title: options.title,
      defaultFileName: options.defaultFileName,
      filters: options.filters,
    });
    if (!path) {
      return;
    }
    await shell.writeFile({
      path,
      content: options.content,
      encoding: options.encoding || 'utf-8',
    });
  } catch (error) {
    if (isMissingGenericFileBridgeError(error)) {
      triggerBrowserDownload(options);
      return;
    }
    throw error;
  }
}

export function getStudioRecorderExportVariantFileName(
  session: StudioRecordingSession,
  variant: string,
  extension: string,
) {
  return `${sanitizeFileName(session.name)}-${sanitizeFileName(variant)}.${extension}`;
}
