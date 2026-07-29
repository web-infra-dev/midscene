import type { AndroidAuditDownloadBundle } from '@midscene/android-playground';

interface WritableFileStream {
  close(): Promise<void>;
  write(data: Blob): Promise<void>;
}

interface DownloadFileHandle {
  createWritable(): Promise<WritableFileStream>;
}

export interface DownloadDirectoryHandle {
  getDirectoryHandle(
    name: string,
    options: { create: true },
  ): Promise<DownloadDirectoryHandle>;
  getFileHandle(
    name: string,
    options: { create: true },
  ): Promise<DownloadFileHandle>;
  name: string;
}

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: (options: {
    mode: 'readwrite';
  }) => Promise<DownloadDirectoryHandle>;
}

function safePathSegments(relativePath: string): string[] {
  const segments = relativePath.split('/');
  if (
    segments.length === 0 ||
    segments.some(
      (segment) =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        segment.includes('\\'),
    )
  ) {
    throw new Error(`Invalid Android audit download path: ${relativePath}`);
  }
  return segments;
}

function base64Blob(contentBase64: string): Blob {
  const binary = window.atob(contentBase64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([buffer]);
}

function isPickerCancellation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'AbortError'
  );
}

export async function chooseAndroidAuditDownloadDirectory(): Promise<
  DownloadDirectoryHandle | undefined
> {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
  if (!picker) {
    throw new Error(
      'Downloading a report folder requires a Chromium-based browser with directory access support.',
    );
  }
  try {
    return await picker.call(window, { mode: 'readwrite' });
  } catch (error) {
    if (isPickerCancellation(error)) return undefined;
    throw error;
  }
}

export async function writeAndroidAuditDownloadBundle(
  parentDirectory: DownloadDirectoryHandle,
  bundle: AndroidAuditDownloadBundle,
): Promise<string> {
  const [directoryName] = safePathSegments(bundle.directoryName);
  if (directoryName !== bundle.directoryName) {
    throw new Error(
      `Invalid Android audit download directory: ${bundle.directoryName}`,
    );
  }
  const reportDirectory = await parentDirectory.getDirectoryHandle(
    directoryName,
    { create: true },
  );

  for (const file of bundle.files) {
    const segments = safePathSegments(file.relativePath);
    const fileName = segments.pop();
    if (!fileName) {
      throw new Error(
        `Android audit download path has no file name: ${file.relativePath}`,
      );
    }
    let directory = reportDirectory;
    for (const segment of segments) {
      directory = await directory.getDirectoryHandle(segment, {
        create: true,
      });
    }
    const fileHandle = await directory.getFileHandle(fileName, {
      create: true,
    });
    const writable = await fileHandle.createWritable();
    await writable.write(base64Blob(file.contentBase64));
    await writable.close();
  }

  return `${parentDirectory.name}/${directoryName}`;
}
