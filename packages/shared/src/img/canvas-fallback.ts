/**
 * Canvas-based fallback for image processing when Photon WASM fails to load.
 * Provides a compatible API with Photon for browser environments.
 */

import { getDebug } from '../logger';

const debug = getDebug('img:canvas-fallback');

/**
 * Canvas-based image class that mimics PhotonImage API
 */
export class CanvasImage {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private _width: number;
  private _height: number;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2d context');
    }
    this.ctx = ctx;
    this._width = canvas.width;
    this._height = canvas.height;
  }

  get_width(): number {
    return this._width;
  }

  get_height(): number {
    return this._height;
  }

  get_raw_pixels(): Uint8Array {
    const imageData = this.ctx.getImageData(0, 0, this._width, this._height);
    return new Uint8Array(imageData.data.buffer);
  }

  get_bytes_jpeg(quality: number): Uint8Array {
    const dataUrl = this.canvas.toDataURL('image/jpeg', quality / 100);
    const base64 = dataUrl.split(',')[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  free(): void {
    // No-op for Canvas, garbage collector will handle it
  }

  // Internal method to get canvas for composition
  _getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  _getContext(): CanvasRenderingContext2D {
    return this.ctx;
  }

  /**
   * Create a CanvasImage from a base64 string
   */
  static async new_from_base64(base64Body: string): Promise<CanvasImage> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get 2d context'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve(new CanvasImage(canvas));
      };
      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };
      // Handle both with and without data URL prefix
      if (base64Body.startsWith('data:')) {
        img.src = base64Body;
      } else {
        img.src = `data:image/png;base64,${base64Body}`;
      }
    });
  }

  /**
   * Create a CanvasImage from a byte array (async version)
   */
  static async new_from_byteslice(bytes: Uint8Array): Promise<CanvasImage> {
    return new Promise((resolve, reject) => {
      const blob = new Blob([bytes], { type: 'image/png' });
      const url = URL.createObjectURL(blob);
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error('Failed to get 2d context'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        resolve(new CanvasImage(canvas));
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image from bytes'));
      };

      img.src = url;
    });
  }
}

/**
 * Sampling filter enum (compatible with Photon)
 */
export const CanvasSamplingFilter = {
  Nearest: 'nearest',
  Triangle: 'triangle',
  CatmullRom: 'catmullrom',
  Gaussian: 'gaussian',
  Lanczos3: 'lanczos3',
} as const;

/**
 * RGBA color class (compatible with Photon)
 */
export class CanvasRgba {
  r: number;
  g: number;
  b: number;
  a: number;

  constructor(r: number, g: number, b: number, a: number) {
    this.r = r;
    this.g = g;
    this.b = b;
    this.a = a;
  }
}

/**
 * Resize an image
 */
export function canvasResize(
  image: CanvasImage,
  newWidth: number,
  newHeight: number,
  _filter: string,
): CanvasImage {
  const canvas = document.createElement('canvas');
  canvas.width = newWidth;
  canvas.height = newHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2d context');
  }

  // Enable image smoothing for better quality
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(image._getCanvas(), 0, 0, newWidth, newHeight);
  return new CanvasImage(canvas);
}

/**
 * Crop an image
 */
export function canvasCrop(
  image: CanvasImage,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): CanvasImage {
  const width = x2 - x1;
  const height = y2 - y1;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2d context');
  }
  ctx.drawImage(image._getCanvas(), x1, y1, width, height, 0, 0, width, height);
  return new CanvasImage(canvas);
}

/**
 * Add padding to the right of an image
 */
export function canvasPaddingRight(
  image: CanvasImage,
  padding: number,
  color: CanvasRgba,
): CanvasImage {
  const newWidth = image.get_width() + padding;
  const height = image.get_height();
  const canvas = document.createElement('canvas');
  canvas.width = newWidth;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2d context');
  }

  // Fill with color
  ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`;
  ctx.fillRect(0, 0, newWidth, height);

  // Draw original image
  ctx.drawImage(image._getCanvas(), 0, 0);
  return new CanvasImage(canvas);
}

/**
 * Add padding to the bottom of an image
 */
export function canvasPaddingBottom(
  image: CanvasImage,
  padding: number,
  color: CanvasRgba,
): CanvasImage {
  const width = image.get_width();
  const newHeight = image.get_height() + padding;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = newHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2d context');
  }

  // Fill with color
  ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`;
  ctx.fillRect(0, 0, width, newHeight);

  // Draw original image
  ctx.drawImage(image._getCanvas(), 0, 0);
  return new CanvasImage(canvas);
}

/**
 * Add uniform padding to an image
 */
export function canvasPaddingUniform(
  image: CanvasImage,
  padding: number,
  color: CanvasRgba,
): CanvasImage {
  const newWidth = image.get_width() + padding * 2;
  const newHeight = image.get_height() + padding * 2;
  const canvas = document.createElement('canvas');
  canvas.width = newWidth;
  canvas.height = newHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2d context');
  }

  // Fill with color
  ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`;
  ctx.fillRect(0, 0, newWidth, newHeight);

  // Draw original image centered
  ctx.drawImage(image._getCanvas(), padding, padding);
  return new CanvasImage(canvas);
}

/**
 * Add padding to the left of an image
 */
export function canvasPaddingLeft(
  image: CanvasImage,
  padding: number,
  color: CanvasRgba,
): CanvasImage {
  const newWidth = image.get_width() + padding;
  const height = image.get_height();
  const canvas = document.createElement('canvas');
  canvas.width = newWidth;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2d context');
  }

  // Fill with color
  ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`;
  ctx.fillRect(0, 0, newWidth, height);

  // Draw original image offset by padding
  ctx.drawImage(image._getCanvas(), padding, 0);
  return new CanvasImage(canvas);
}

/**
 * Add padding to the top of an image
 */
export function canvasPaddingTop(
  image: CanvasImage,
  padding: number,
  color: CanvasRgba,
): CanvasImage {
  const width = image.get_width();
  const newHeight = image.get_height() + padding;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = newHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2d context');
  }

  // Fill with color
  ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`;
  ctx.fillRect(0, 0, width, newHeight);

  // Draw original image offset by padding
  ctx.drawImage(image._getCanvas(), 0, padding);
  return new CanvasImage(canvas);
}

/**
 * Watermark an image (overlay one image on another)
 */
export function canvasWatermark(
  base: CanvasImage,
  overlay: CanvasImage,
  x: number,
  y: number,
): CanvasImage {
  const canvas = document.createElement('canvas');
  canvas.width = base.get_width();
  canvas.height = base.get_height();
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2d context');
  }

  // Draw base image
  ctx.drawImage(base._getCanvas(), 0, 0);

  // Draw overlay at position
  ctx.drawImage(overlay._getCanvas(), x, y);
  return new CanvasImage(canvas);
}

/**
 * Create and return the canvas fallback module with Photon-compatible API
 */
export function createCanvasFallbackModule() {
  debug('Creating Canvas fallback module');
  console.log(
    '[midscene:img] Using Canvas fallback (Photon WASM not available)',
  );

  return {
    PhotonImage: CanvasImage,
    SamplingFilter: CanvasSamplingFilter,
    resize: canvasResize,
    crop: canvasCrop,
    open_image: () => {
      throw new Error('open_image not supported in Canvas fallback');
    },
    base64_to_image: CanvasImage.new_from_base64,
    padding_uniform: canvasPaddingUniform,
    padding_left: canvasPaddingLeft,
    padding_right: canvasPaddingRight,
    padding_top: canvasPaddingTop,
    padding_bottom: canvasPaddingBottom,
    watermark: canvasWatermark,
    Rgba: CanvasRgba,
  };
}
