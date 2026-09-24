import type { Size } from '../types';
import { ifInNode } from '../utils';
import type { ScreenshotImageFormat } from './image-format';
import type { ImageOperation, ImageOutputOptions } from './image-pipeline';

/** Encoded input accepted by the screenshot pipeline. */
export interface BackendImage {
  bytes: Uint8Array;
  format: ScreenshotImageFormat;
}

/** Backend resources never escape. transform always encodes; callers own no-op policy. */
export interface ImageBackend {
  info(bytes: Uint8Array): Promise<Size>;
  transform(
    image: BackendImage,
    operations: readonly ImageOperation[],
    output: ImageOutputOptions,
  ): Promise<Uint8Array>;
}

/** Keep environment selection here, not in geometry, annotations or consumers. */
export async function getImageBackend(): Promise<ImageBackend> {
  return ifInNode
    ? (await import('./backends/sharp')).sharpBackend
    : (await import('./backends/photon')).photonBackend;
}
