import type { Size } from '../types';
import { ifInNode } from '../utils';
import type { ImageOperation, ImageOutputOptions } from './image-pipeline';

/** Encoded input; legacy APIs also accept formats outside screenshot formats. */
export interface BackendImage {
  bytes: Uint8Array;
  format: string;
}

/** Preserve the old Node cover / browser fill resize behavior only in legacy adapters. */
export type BackendOperation =
  | Exclude<ImageOperation, { type: 'resize' }>
  | (Extract<ImageOperation, { type: 'resize' }> & { fit?: 'cover' });

/** Backend resources never escape. transform always encodes; callers own no-op policy. */
export interface ImageBackend {
  info(bytes: Uint8Array): Promise<Size>;
  transform(
    image: BackendImage,
    operations: readonly BackendOperation[],
    output: ImageOutputOptions,
  ): Promise<Uint8Array>;
}

/** Keep environment selection here, not in geometry, annotations or consumers. */
export async function getImageBackend(): Promise<ImageBackend> {
  return ifInNode
    ? (await import('./backends/sharp')).sharpBackend
    : (await import('./backends/photon')).photonBackend;
}
