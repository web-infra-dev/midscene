import type { MarkdownAttachment } from '@midscene/core';

const defaultScreenshotBaseDir = './screenshots';
const dataUrlBase64Pattern = /^data:image\/(?:png|jpeg|jpg|webp);base64,/i;
const rawBase64Pattern = /^[a-zA-Z0-9+/=\s]+$/;

type MarkdownExport = {
  markdown: string;
  attachments: MarkdownAttachment[];
};

export type MarkdownAttachmentDisplayItem = {
  key: string;
  fileName: string;
  markdownPath: string;
  previewSrc?: string;
  executionIndex: number;
  taskIndex: number;
};

export const markdownZipDownloadTooltip =
  'Downloads report.md and referenced screenshots as a ZIP that can be shared with an agent for analysis.';

export interface MarkdownArchiveBuildResult {
  files: Record<string, Uint8Array>;
  packagedAttachmentCount: number;
  missingAttachmentCount: number;
}

export type MarkdownView =
  | ({ status: 'ready' } & MarkdownExport)
  | { status: 'empty' }
  | { status: 'error'; errorMessage: string };

export function getMarkdownView<T>(
  source: T | null | undefined,
  toMarkdown: (source: T) => MarkdownExport,
  warningMessage: string,
): MarkdownView {
  if (!source) {
    return { status: 'empty' };
  }

  try {
    return {
      status: 'ready',
      ...toMarkdown(source),
    };
  } catch (error) {
    console.warn(warningMessage, error);

    return {
      status: 'error',
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

export function getExecutionMarkdownView(
  activeExecution: unknown,
  toMarkdown: (activeExecution: unknown) => MarkdownExport,
): MarkdownView {
  return getMarkdownView(
    activeExecution,
    toMarkdown,
    'Failed to render markdown view',
  );
}

export function getReportMarkdownView<T>(
  report: T | null | undefined,
  toMarkdown: (report: T) => MarkdownExport,
): MarkdownView {
  return getMarkdownView(
    report,
    toMarkdown,
    'Failed to render report markdown view',
  );
}

export function markdownArchiveBaseName(
  report: { groupName?: string } | null | undefined,
): string {
  const safeName = (report?.groupName || 'midscene-report')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-_]/g, '');

  return safeName || 'midscene-report';
}

function normalizeBaseDir(baseDir: string): string {
  const trimmed = baseDir.trim().replace(/\/+$/, '');
  return trimmed || defaultScreenshotBaseDir;
}

export function markdownAttachmentPath(
  attachment: Pick<MarkdownAttachment, 'suggestedFileName'>,
  screenshotBaseDir = defaultScreenshotBaseDir,
): string {
  return `${normalizeBaseDir(screenshotBaseDir)}/${attachment.suggestedFileName}`;
}

function isPackageableBase64Data(
  base64Data: string | undefined,
): base64Data is string {
  if (!base64Data) return false;
  const raw = base64Data.replace(dataUrlBase64Pattern, '').replace(/\s/g, '');
  return Boolean(raw) && rawBase64Pattern.test(raw);
}

function previewSourceForAttachment(
  attachment: MarkdownAttachment,
): string | undefined {
  const base64Data = attachment.base64Data?.trim();
  if (base64Data) {
    if (dataUrlBase64Pattern.test(base64Data)) {
      return base64Data;
    }
    if (rawBase64Pattern.test(base64Data)) {
      return `data:${attachment.mimeType || 'image/png'};base64,${base64Data.replace(/\s/g, '')}`;
    }
    return base64Data;
  }

  return attachment.sourceRef?.path;
}

export function getMarkdownAttachmentDisplayItems(
  attachments: MarkdownAttachment[],
  screenshotBaseDir = defaultScreenshotBaseDir,
): MarkdownAttachmentDisplayItem[] {
  return attachments.map((attachment, index) => ({
    key: `${attachment.executionIndex}-${attachment.taskIndex}-${attachment.id}-${attachment.suggestedFileName}-${index}`,
    fileName: attachment.suggestedFileName,
    markdownPath: markdownAttachmentPath(attachment, screenshotBaseDir),
    previewSrc: previewSourceForAttachment(attachment),
    executionIndex: attachment.executionIndex,
    taskIndex: attachment.taskIndex,
  }));
}

function base64ToUint8Array(base64Data: string): Uint8Array {
  const raw = base64Data.replace(/^data:[^;]+;base64,/, '');
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function attachmentPathSource(
  attachment: MarkdownAttachment,
): string | undefined {
  const base64Data = attachment.base64Data?.trim();
  if (base64Data && !isPackageableBase64Data(base64Data)) {
    return base64Data;
  }

  return attachment.sourceRef?.path;
}

async function fetchAttachmentBytes(
  attachment: MarkdownAttachment,
): Promise<Uint8Array | undefined> {
  const base64Data = attachment.base64Data;
  if (isPackageableBase64Data(base64Data)) {
    return base64ToUint8Array(base64Data);
  }

  const source = attachmentPathSource(attachment);
  if (!source) {
    return undefined;
  }

  try {
    const response = await fetch(source);
    if (!response.ok) {
      return undefined;
    }
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return undefined;
  }
}

export function countPackageableMarkdownAttachments(
  attachments: MarkdownAttachment[],
): number {
  return attachments.filter((attachment) =>
    isPackageableBase64Data(attachment.base64Data),
  ).length;
}

export function buildMarkdownArchiveFiles(
  markdown: string,
  attachments: MarkdownAttachment[],
): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {
    'report.md': new TextEncoder().encode(markdown),
  };

  for (const attachment of attachments) {
    const base64Data = attachment.base64Data;
    if (!isPackageableBase64Data(base64Data)) {
      continue;
    }
    files[`screenshots/${attachment.suggestedFileName}`] =
      base64ToUint8Array(base64Data);
  }

  return files;
}

export async function buildMarkdownArchiveFilesForDownload(
  markdown: string,
  attachments: MarkdownAttachment[],
): Promise<MarkdownArchiveBuildResult> {
  const files: Record<string, Uint8Array> = {
    'report.md': new TextEncoder().encode(markdown),
  };
  let packagedAttachmentCount = 0;

  for (const attachment of attachments) {
    const bytes = await fetchAttachmentBytes(attachment);
    if (!bytes) {
      continue;
    }
    files[`screenshots/${attachment.suggestedFileName}`] = bytes;
    packagedAttachmentCount += 1;
  }

  return {
    files,
    packagedAttachmentCount,
    missingAttachmentCount: attachments.length - packagedAttachmentCount,
  };
}

export async function downloadMarkdownZip(
  markdown: string,
  attachments: MarkdownAttachment[],
  fileName: string,
): Promise<MarkdownArchiveBuildResult> {
  const { zipSync } = await import('fflate');
  const result = await buildMarkdownArchiveFilesForDownload(
    markdown,
    attachments,
  );
  const zipped = zipSync(result.files);
  const blob = new Blob([zipped], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${fileName}.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
  return result;
}
