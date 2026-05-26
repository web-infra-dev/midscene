import type { ReportDownloadHandler } from '../../types';

export const DEFAULT_REPORT_FILE_NAME = 'midscene_report.html';

interface AnchorLike {
  href: string;
  download: string;
  style: {
    display: string;
  };
  click: () => void;
}

interface DocumentLike {
  body: {
    appendChild: (node: AnchorLike) => void;
    removeChild: (node: AnchorLike) => void;
  };
  createElement: (tagName: string) => AnchorLike;
}

interface UrlLike {
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
}

interface TriggerReportDownloadOptions {
  content: string;
  defaultFileName?: string;
  onDownloadReport?: ReportDownloadHandler;
  documentRef?: DocumentLike;
  urlRef?: UrlLike;
  blobFactory?: (parts: BlobPart[], options: BlobPropertyBag) => Blob;
  scheduleRevoke?: (callback: () => void) => void;
}

export async function triggerReportDownload(
  options: TriggerReportDownloadOptions,
): Promise<void> {
  const {
    content,
    defaultFileName = DEFAULT_REPORT_FILE_NAME,
    onDownloadReport,
    documentRef,
    urlRef,
    blobFactory,
    scheduleRevoke,
  } = options;

  if (onDownloadReport) {
    await onDownloadReport({
      content,
      defaultFileName,
    });
    return;
  }

  const activeDocument = (documentRef ?? (globalThis.document as unknown)) as
    | DocumentLike
    | undefined;
  if (!activeDocument) {
    throw new Error('Report download requires a document context.');
  }

  const activeUrl = (urlRef ?? (globalThis.URL as unknown)) as
    | UrlLike
    | undefined;
  if (!activeUrl?.createObjectURL || !activeUrl?.revokeObjectURL) {
    throw new Error('Report download requires URL.createObjectURL support.');
  }

  const createBlob =
    blobFactory ?? ((parts, blobOptions) => new Blob(parts, blobOptions));
  const blob = createBlob([content], { type: 'text/html' });
  const url = activeUrl.createObjectURL(blob);
  const anchor = activeDocument.createElement('a');

  anchor.href = url;
  anchor.download = defaultFileName;
  anchor.style.display = 'none';
  activeDocument.body.appendChild(anchor);

  try {
    anchor.click();
  } finally {
    activeDocument.body.removeChild(anchor);
    (scheduleRevoke ?? ((callback) => setTimeout(callback, 0)))(() => {
      activeUrl.revokeObjectURL(url);
    });
  }
}
