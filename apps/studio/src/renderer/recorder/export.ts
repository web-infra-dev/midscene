import {
  DEFAULT_MIDSCENE_RECORDER_MARKDOWN_MAX_SCREENSHOTS,
  createMidsceneRecorderMarkdownScreenshotAssets,
  getMidsceneRecorderEventDescription,
  getMidsceneRecorderSemantic,
  sanitizeMidsceneRecorderFileName,
} from '@midscene/shared/recorder';
import type {
  ElectronShellApi,
  SaveFileFilter,
  WriteZipArchiveEntry,
} from '@shared/electron-contract';
import JSZip from 'jszip';
import type {
  StudioRecordedEvent,
  StudioRecorderExportProgress,
  StudioRecordingSession,
} from './types';

export async function materializeStudioRecorderSessionScreenshots(
  session: StudioRecordingSession,
  loadScreenshot: (assetId: string) => Promise<string | null>,
  maxScreenshots = DEFAULT_MIDSCENE_RECORDER_MARKDOWN_MAX_SCREENSHOTS,
): Promise<StudioRecordingSession> {
  const events: StudioRecordedEvent[] = [];
  let remainingScreenshots = Math.max(0, maxScreenshots);
  for (const event of session.events) {
    if (!event.screenshotAsset || remainingScreenshots === 0) {
      events.push(event);
      continue;
    }
    const screenshot = await loadScreenshot(event.screenshotAsset.id);
    if (!screenshot) {
      throw new Error(
        `Recorder screenshot asset is unavailable: ${event.screenshotAsset.id}`,
      );
    }
    remainingScreenshots -= 1;
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

function isMissingGenericFileBridgeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('No handler registered') &&
    (message.includes('choose-file-save-path') ||
      message.includes('write-file') ||
      message.includes('write-zip-archive'))
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

function createMarkdownReplayManifest(
  session: StudioRecordingSession,
  source: 'ai' | 'local-fallback',
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
  const events = session.events.map((event) => {
    const semantic = getMidsceneRecorderSemantic(event);
    return {
      hashId: event.hashId,
      type: event.type,
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

  return JSON.stringify(
    {
      artifact: 'markdown-replay',
      markdownSource: source,
      aiGenerated: source === 'ai',
      sessionId: session.id,
      sessionName: session.name,
      exportedAt: new Date().toISOString(),
      descriptionSourceCounts,
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
  maxScreenshots = DEFAULT_MIDSCENE_RECORDER_MARKDOWN_MAX_SCREENSHOTS,
) {
  const zip = new JSZip();
  zip.file('recordings.md', generateStudioRecorderMarkdown(sessions));
  let remainingScreenshots = Math.max(0, maxScreenshots);
  for (const session of sessions) {
    const baseName = `${sanitizeFileName(session.name)}-${session.id}`;
    const markdownSource = session.generatedCode?.markdown
      ? 'ai'
      : 'local-fallback';
    const markdown =
      session.generatedCode?.markdown ||
      generateStudioRecorderMarkdownReplay(session);
    zip.file(`markdown/${baseName}/recording.md`, markdown);
    zip.file(
      `markdown/${baseName}/recording.manifest.json`,
      createMarkdownReplayManifest(session, markdownSource),
    );
    const screenshots = createMidsceneRecorderMarkdownScreenshotAssets(
      session.events,
      {
        baseDir: `./${baseName}/screenshots`,
        maxScreenshots: remainingScreenshots,
      },
    );
    remainingScreenshots = Math.max(
      0,
      remainingScreenshots - screenshots.length,
    );
    for (const screenshot of screenshots) {
      zip.file(
        `markdown/${screenshot.relativePath.replace(/^\.\//, '')}`,
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
  maxScreenshots = DEFAULT_MIDSCENE_RECORDER_MARKDOWN_MAX_SCREENSHOTS,
) {
  const zip = new JSZip();
  const markdownSource = session.generatedCode?.markdown
    ? 'ai'
    : 'local-fallback';
  const markdown =
    session.generatedCode?.markdown ||
    generateStudioRecorderMarkdownReplay(session);
  zip.file('recording.md', markdown);
  zip.file(
    'recording.manifest.json',
    createMarkdownReplayManifest(session, markdownSource),
  );
  for (const screenshot of createMidsceneRecorderMarkdownScreenshotAssets(
    session.events,
    { maxScreenshots },
  )) {
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

export interface StudioRecorderArchiveSaveResult {
  browserScreenshotLimitApplied: boolean;
  canceled: boolean;
}

function screenshotExtension(mimeType?: string) {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    default:
      return 'png';
  }
}

function screenshotArchivePath(
  event: StudioRecordedEvent,
  eventIndex: number,
  baseDir: string,
) {
  const safeType = event.type.replace(/[^a-zA-Z0-9-]/g, '-');
  const fileName = `event-${String(eventIndex + 1).padStart(3, '0')}-${safeType}.${screenshotExtension(event.screenshotAsset?.mimeType)}`;
  return `${baseDir ? `${baseDir}/` : ''}screenshots/${fileName}`;
}

function createScreenshotArchiveEntries(
  session: StudioRecordingSession,
  baseDir: string,
  getScreenshotAssetUrl: (assetId: string) => string | null,
) {
  const entries = new Map<string, WriteZipArchiveEntry>();
  session.events.forEach((event, eventIndex) => {
    if (!event.screenshotAsset) {
      return;
    }
    const sourceUrl = getScreenshotAssetUrl(event.screenshotAsset.id);
    if (!sourceUrl) {
      throw new Error(
        `Recorder screenshot asset is unavailable: ${event.screenshotAsset.id}`,
      );
    }
    const entryPath = screenshotArchivePath(event, eventIndex, baseDir);
    entries.set(entryPath, { path: entryPath, sourceUrl });
  });

  for (const screenshot of createMidsceneRecorderMarkdownScreenshotAssets(
    session.events,
    { maxScreenshots: session.events.length },
  )) {
    const entryPath = `${baseDir ? `${baseDir}/` : ''}${screenshot.relativePath.replace(/^\.\//, '')}`;
    if (!entries.has(entryPath)) {
      entries.set(entryPath, {
        path: entryPath,
        content: screenshot.base64Data,
        encoding: 'base64',
      });
    }
  }
  return Array.from(entries.values());
}

export function createStudioRecorderMarkdownArchiveEntries(
  session: StudioRecordingSession,
  getScreenshotAssetUrl: (assetId: string) => string | null,
  baseDir = '',
): WriteZipArchiveEntry[] {
  const markdownSource = session.generatedCode?.markdown
    ? 'ai'
    : 'local-fallback';
  const markdown =
    session.generatedCode?.markdown ||
    generateStudioRecorderMarkdownReplay(session);
  const prefix = baseDir ? `${baseDir}/` : '';
  return [
    { path: `${prefix}recording.md`, content: markdown },
    {
      path: `${prefix}recording.manifest.json`,
      content: createMarkdownReplayManifest(session, markdownSource),
    },
    ...createScreenshotArchiveEntries(session, baseDir, getScreenshotAssetUrl),
  ];
}

export function createStudioRecorderArchiveEntries(
  sessions: StudioRecordingSession[],
  getScreenshotAssetUrl: (assetId: string) => string | null,
): WriteZipArchiveEntry[] {
  const entries: WriteZipArchiveEntry[] = [
    {
      path: 'recordings.md',
      content: generateStudioRecorderMarkdown(sessions),
    },
  ];
  for (const session of sessions) {
    const baseName = `${sanitizeFileName(session.name)}-${session.id}`;
    entries.push(
      ...createStudioRecorderMarkdownArchiveEntries(
        session,
        getScreenshotAssetUrl,
        `markdown/${baseName}`,
      ),
      {
        path: `${baseName}.yaml`,
        content:
          session.generatedCode?.yaml || generateStudioRecorderYaml(session),
      },
    );
    const playwright =
      session.generatedCode?.playwright ||
      generateStudioRecorderPlaywright(session);
    if (playwright) {
      entries.push({ path: `${baseName}.spec.ts`, content: playwright });
    }
  }
  return entries;
}

function createExportId() {
  return `recorder-export-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function saveStudioRecorderZipArchive(options: {
  createFallbackBase64: () => Promise<{
    content: string;
    limited: boolean;
  }>;
  defaultFileName: string;
  entries: WriteZipArchiveEntry[];
  onProgress?: (progress: StudioRecorderExportProgress) => void;
  title: string;
}): Promise<StudioRecorderArchiveSaveResult> {
  const shell = (globalThis.window as Window | undefined)?.electronShell;
  const totalEntries = options.entries.length;
  const preparingProgress: StudioRecorderExportProgress = {
    bytesWritten: 0,
    completedEntries: 0,
    phase: 'preparing',
    totalEntries,
  };
  options.onProgress?.(preparingProgress);

  const filters = [{ name: 'ZIP Archive', extensions: ['zip'] }];
  let targetPath: string | null = null;
  if (shell?.chooseFileSavePath) {
    targetPath = await shell.chooseFileSavePath({
      title: options.title,
      defaultFileName: options.defaultFileName,
      filters,
    });
    if (!targetPath) {
      return { browserScreenshotLimitApplied: false, canceled: true };
    }
  }

  if (targetPath && shell?.writeZipArchive && shell.onZipArchiveProgress) {
    const exportId = createExportId();
    const stopProgress = shell.onZipArchiveProgress((progress) => {
      if (progress.exportId === exportId) {
        const { exportId: _exportId, ...visibleProgress } = progress;
        options.onProgress?.(visibleProgress);
      }
    });
    try {
      await shell.writeZipArchive({
        entries: options.entries,
        exportId,
        path: targetPath,
      });
      return { browserScreenshotLimitApplied: false, canceled: false };
    } catch (error) {
      if (!isMissingGenericFileBridgeError(error)) {
        throw error;
      }
    } finally {
      stopProgress();
    }
  }

  const fallback = await options.createFallbackBase64();
  options.onProgress?.({
    bytesWritten: 0,
    completedEntries: 0,
    phase: 'writing',
    totalEntries: 1,
  });
  if (targetPath && shell?.writeFile) {
    await shell.writeFile({
      path: targetPath,
      content: fallback.content,
      encoding: 'base64',
    });
  } else {
    triggerBrowserDownload({
      defaultFileName: options.defaultFileName,
      content: fallback.content,
      encoding: 'base64',
      filters,
    });
  }
  options.onProgress?.({
    bytesWritten: 0,
    completedEntries: 1,
    phase: 'completed',
    totalEntries: 1,
  });
  return {
    browserScreenshotLimitApplied: fallback.limited,
    canceled: false,
  };
}

function countSessionScreenshotAssets(session: StudioRecordingSession) {
  return session.events.filter((event) => event.screenshotAsset).length;
}

export async function saveStudioRecorderMarkdownArchive(options: {
  getScreenshotAssetUrl: (assetId: string) => string | null;
  loadScreenshot: (assetId: string) => Promise<string | null>;
  onProgress?: (progress: StudioRecorderExportProgress) => void;
  session: StudioRecordingSession;
}) {
  const screenshotCount = countSessionScreenshotAssets(options.session);
  return saveStudioRecorderZipArchive({
    title: 'Export Recorder Markdown Replay',
    defaultFileName: getStudioRecorderExportVariantFileName(
      options.session,
      'markdown',
      'zip',
    ),
    entries: createStudioRecorderMarkdownArchiveEntries(
      options.session,
      options.getScreenshotAssetUrl,
    ),
    onProgress: options.onProgress,
    createFallbackBase64: async () => ({
      content: await createStudioRecorderMarkdownZipBase64(
        await materializeStudioRecorderSessionScreenshots(
          options.session,
          options.loadScreenshot,
          DEFAULT_MIDSCENE_RECORDER_MARKDOWN_MAX_SCREENSHOTS,
        ),
      ),
      limited:
        screenshotCount > DEFAULT_MIDSCENE_RECORDER_MARKDOWN_MAX_SCREENSHOTS,
    }),
  });
}

export async function saveStudioRecorderArchive(options: {
  getScreenshotAssetUrl: (assetId: string) => string | null;
  loadScreenshot: (assetId: string) => Promise<string | null>;
  onProgress?: (progress: StudioRecorderExportProgress) => void;
  sessions: StudioRecordingSession[];
}) {
  const screenshotCount = options.sessions.reduce(
    (count, session) => count + countSessionScreenshotAssets(session),
    0,
  );
  return saveStudioRecorderZipArchive({
    title: 'Export Recorder Archive',
    defaultFileName: 'midscene-studio-recordings.zip',
    entries: createStudioRecorderArchiveEntries(
      options.sessions,
      options.getScreenshotAssetUrl,
    ),
    onProgress: options.onProgress,
    createFallbackBase64: async () => {
      let remainingScreenshots =
        DEFAULT_MIDSCENE_RECORDER_MARKDOWN_MAX_SCREENSHOTS;
      const sessions: StudioRecordingSession[] = [];
      for (const session of options.sessions) {
        const materialized = await materializeStudioRecorderSessionScreenshots(
          session,
          options.loadScreenshot,
          remainingScreenshots,
        );
        remainingScreenshots = Math.max(
          0,
          remainingScreenshots - countSessionScreenshotAssets(session),
        );
        sessions.push(materialized);
      }
      return {
        content: await createStudioRecorderZipBase64(
          sessions,
          DEFAULT_MIDSCENE_RECORDER_MARKDOWN_MAX_SCREENSHOTS,
        ),
        limited:
          screenshotCount > DEFAULT_MIDSCENE_RECORDER_MARKDOWN_MAX_SCREENSHOTS,
      };
    },
  });
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
