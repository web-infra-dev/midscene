export type ScreenshotImageFormat = 'png' | 'jpeg' | 'webp';

export type ScreenshotImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp';

const mimeTypeByFormat: Record<ScreenshotImageFormat, ScreenshotImageMimeType> =
  {
    png: 'image/png',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
  };

export function screenshotImageMimeType(
  format: ScreenshotImageFormat,
): ScreenshotImageMimeType {
  return mimeTypeByFormat[format];
}

export function screenshotImageExtension(
  format: ScreenshotImageFormat,
): ScreenshotImageFormat {
  return format;
}

export function screenshotImageFormatFromExtension(
  extension: unknown,
): ScreenshotImageFormat | undefined {
  if (typeof extension !== 'string') {
    return undefined;
  }

  switch (extension.toLowerCase()) {
    case 'png':
      return 'png';
    case 'jpeg':
    case 'jpg':
      return 'jpeg';
    case 'webp':
      return 'webp';
    default:
      return undefined;
  }
}

export function screenshotImageFormatFromMimeType(
  mimeType: unknown,
): ScreenshotImageFormat | undefined {
  if (typeof mimeType !== 'string') {
    return undefined;
  }

  switch (mimeType.toLowerCase()) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpeg';
    case 'image/webp':
      return 'webp';
    default:
      return undefined;
  }
}

export function isScreenshotImageMimeType(
  mimeType: unknown,
): mimeType is ScreenshotImageMimeType {
  return (
    mimeType === 'image/png' ||
    mimeType === 'image/jpeg' ||
    mimeType === 'image/webp'
  );
}

export function inferScreenshotImageFormatFromBase64(
  base64Body: string,
): ScreenshotImageFormat | undefined {
  const normalizedBody = base64Body.replace(/\s/g, '');
  if (normalizedBody.startsWith('iVBORw0KGgo')) {
    return 'png';
  }
  if (normalizedBody.startsWith('/9j/')) {
    return 'jpeg';
  }
  if (normalizedBody.startsWith('UklGR')) {
    return 'webp';
  }
  return undefined;
}

export function detectScreenshotImageFormatFromBuffer(
  buffer: Uint8Array,
): ScreenshotImageFormat | undefined {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'png';
  }

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'jpeg';
  }

  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'webp';
  }

  return undefined;
}
