const WEBP_QUALITY = 0.9;
const DATA_URL_PATTERN = /^data:image\/(png|jpe?g|webp);base64,([\s\S]+)$/i;

function decodeScreenshotDataUrl(dataUrl: string): {
  bytes: Uint8Array;
  mimeType: string;
} {
  const match = DATA_URL_PATTERN.exec(dataUrl);
  if (!match) {
    throw new Error(
      'Recorder screenshot must be a PNG, JPEG, or WebP data URL',
    );
  }

  const binary = atob(match[2]);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return {
    bytes,
    mimeType: `image/${match[1].toLowerCase().replace('jpg', 'jpeg')}`,
  };
}

function isWebp(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
  );
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(binary);
}

/** Convert captureVisibleTab's PNG output to the recorder's canonical WebP. */
export async function canonicalizeRecorderScreenshot(
  dataUrl: string,
): Promise<string> {
  const source = decodeScreenshotDataUrl(dataUrl);
  if (source.mimeType === 'image/webp') {
    if (!isWebp(source.bytes)) {
      throw new Error('Recorder screenshot has an invalid WebP signature');
    }
    return dataUrl;
  }

  const bitmap = await createImageBitmap(
    new Blob([source.bytes], { type: source.mimeType }),
  );
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Recorder screenshot WebP encoder is unavailable');
    }
    context.drawImage(bitmap, 0, 0);

    const output = await canvas.convertToBlob({
      type: 'image/webp',
      quality: WEBP_QUALITY,
    });
    const bytes = new Uint8Array(await output.arrayBuffer());
    if (output.type !== 'image/webp' || !isWebp(bytes)) {
      throw new Error('Recorder screenshot encoder returned invalid WebP');
    }
    return `data:image/webp;base64,${encodeBase64(bytes)}`;
  } finally {
    bitmap.close();
  }
}
