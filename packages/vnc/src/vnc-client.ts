import { getDebug } from '@midscene/shared/logger';
import sharp from 'sharp';

const debug = getDebug('vnc:client');

/**
 * VNC connection options
 */
export interface VNCConnectionOptions {
  host: string;
  port: number;
  password?: string;
  /** Connection timeout in milliseconds (default: 10000) */
  connectTimeout?: number;
  /** Target FPS for framebuffer updates (0 = as fast as possible, default: 0) */
  fps?: number;
}

/**
 * VNC mouse button masks (standard RFB button mask bits)
 */
export const VNC_BUTTON = {
  LEFT: 1,
  MIDDLE: 2,
  RIGHT: 4,
  SCROLL_UP: 8,
  SCROLL_DOWN: 16,
  SCROLL_LEFT: 32,
  SCROLL_RIGHT: 64,
} as const;

/**
 * Async wrapper around @computernewb/nodejs-rfb VncClient
 *
 * Provides a promise-based API for VNC operations:
 * - connect/disconnect lifecycle
 * - screenshot capture (framebuffer -> PNG)
 * - pointer (mouse) events
 * - key (keyboard) events
 * - clipboard
 */
export class VNCClient {
  private client: any = null;
  private options: VNCConnectionOptions;
  private _connected = false;
  private firstFrameReceived = false;

  constructor(options: VNCConnectionOptions) {
    this.options = {
      connectTimeout: 10000,
      fps: 0,
      ...options,
    };
  }

  /**
   * Connect to the VNC server
   * Resolves when authenticated and first framebuffer is received
   */
  async connect(): Promise<void> {
    // Dynamic import for ESM-only package
    const { VncClient } = await import('@computernewb/nodejs-rfb');

    const encodings = VncClient.consts.encodings;
    this.client = new VncClient({
      debug: false,
      fps: this.options.fps,
      encodings: [
        encodings.copyRect,
        encodings.zrle,
        encodings.hextile,
        encodings.raw,
        encodings.pseudoDesktopSize,
      ],
    });

    return new Promise<void>((resolve, reject) => {
      let settled = false;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          this.cleanup();
          reject(
            new Error(
              `VNC connection timeout after ${this.options.connectTimeout}ms`,
            ),
          );
        }
      }, this.options.connectTimeout!);

      const settle = (err?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (err) {
          this.cleanup();
          reject(err);
        } else {
          resolve();
        }
      };

      this.client.on('connected', () => {
        debug(
          'TCP connected to %s:%d',
          this.options.host,
          this.options.port,
        );
      });

      this.client.on('authenticated', () => {
        debug('Authenticated');
      });

      this.client.on('authError', () => {
        settle(new Error('VNC authentication failed'));
      });

      this.client.on('connectError', (error: Error) => {
        settle(
          new Error(`VNC connection error: ${error?.message || error}`),
        );
      });

      this.client.on('connectTimeout', () => {
        settle(
          new Error(
            `VNC server did not respond within ${this.options.connectTimeout}ms`,
          ),
        );
      });

      this.client.on('closed', () => {
        debug('Connection closed by server');
        this._connected = false;
        settle(new Error('VNC connection closed unexpectedly'));
      });

      this.client.on('disconnected', () => {
        debug('Disconnected');
        this._connected = false;
      });

      this.client.on('firstFrameUpdate', () => {
        debug(
          'First frame received: %dx%d, name: %s',
          this.client.clientWidth,
          this.client.clientHeight,
          this.client.clientName,
        );
        this.firstFrameReceived = true;
        this._connected = true;
        settle();
      });

      this.client.on('desktopSizeChanged', (size: { width: number; height: number }) => {
        debug('Desktop resized: %dx%d', size.width, size.height);
      });

      // Initiate connection
      this.client.connect({
        host: this.options.host,
        port: this.options.port,
        path: null,
        auth: this.options.password
          ? { password: this.options.password }
          : undefined,
        set8BitColor: false,
      });
    });
  }

  /**
   * Capture the current framebuffer as a PNG buffer
   */
  async screenshot(): Promise<Buffer> {
    if (!this._connected || !this.client?.fb) {
      throw new Error('VNC not connected or framebuffer not initialized');
    }

    // Request a full (non-incremental) framebuffer update and wait for it
    await this.requestAndWaitForFrame();

    const width = this.client.clientWidth;
    const height = this.client.clientHeight;
    const fb: Buffer = this.client.fb;
    const bpp = this.client.pixelFormat?.bitsPerPixel || 32;
    const bytesPerPixel = bpp / 8;
    const pixelFormat = this.client.pixelFormat;

    // Convert framebuffer to RGBA for sharp
    const rgba = Buffer.alloc(width * height * 4);

    if (pixelFormat && bytesPerPixel === 4) {
      const redShift = pixelFormat.redShift;
      const greenShift = pixelFormat.greenShift;
      const blueShift = pixelFormat.blueShift;

      for (let i = 0; i < width * height; i++) {
        const srcOff = i * bytesPerPixel;
        const dstOff = i * 4;

        // Read the 32-bit pixel as little-endian (most VNC servers use LE)
        const pixel =
          fb[srcOff] |
          (fb[srcOff + 1] << 8) |
          (fb[srcOff + 2] << 16) |
          ((fb[srcOff + 3] << 24) >>> 0);

        rgba[dstOff] = (pixel >> redShift) & 0xff; // R
        rgba[dstOff + 1] = (pixel >> greenShift) & 0xff; // G
        rgba[dstOff + 2] = (pixel >> blueShift) & 0xff; // B
        rgba[dstOff + 3] = 255; // A
      }
    } else {
      // Fallback: just copy as-is assuming RGBA
      fb.copy(rgba, 0, 0, Math.min(fb.length, rgba.length));
    }

    return sharp(rgba, {
      raw: { width, height, channels: 4 },
    })
      .png()
      .toBuffer();
  }

  /**
   * Request a full framebuffer update and wait for it to arrive
   */
  private requestAndWaitForFrame(timeout = 5000): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.client.removeListener('frameUpdated', onFrame);
        reject(new Error(`Framebuffer update timeout after ${timeout}ms`));
      }, timeout);

      const onFrame = () => {
        clearTimeout(timer);
        resolve();
      };

      this.client.once('frameUpdated', onFrame);

      // Request a full (non-incremental) framebuffer update
      this.client.requestFrameUpdate(
        true, // full
        0, // incremental = 0 (non-incremental)
        0,
        0,
        this.client.clientWidth,
        this.client.clientHeight,
      );
    });
  }

  /**
   * Send a pointer (mouse) event
   */
  sendPointerEvent(x: number, y: number, buttonMask: number): void {
    if (!this._connected) throw new Error('VNC not connected');
    this.client.sendPointerEvent(
      Math.max(0, Math.min(x, this.client.clientWidth - 1)),
      Math.max(0, Math.min(y, this.client.clientHeight - 1)),
      buttonMask,
    );
  }

  /**
   * Send a key event
   */
  sendKeyEvent(keysym: number, down: boolean): void {
    if (!this._connected) throw new Error('VNC not connected');
    this.client.sendKeyEvent(keysym, down);
  }

  /**
   * Send clipboard text to the server
   */
  clientCutText(text: string): void {
    if (!this._connected) throw new Error('VNC not connected');
    this.client.clientCutText(text);
  }

  /**
   * Get the screen dimensions
   */
  getScreenSize(): { width: number; height: number } {
    if (!this.client) return { width: 0, height: 0 };
    return {
      width: this.client.clientWidth || 0,
      height: this.client.clientHeight || 0,
    };
  }

  /**
   * Get the VNC server name
   */
  getServerName(): string {
    return this.client?.clientName || '';
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this._connected;
  }

  /**
   * Disconnect from the VNC server
   */
  disconnect(): void {
    debug('Disconnecting from VNC server');
    this.cleanup();
  }

  private cleanup(): void {
    this._connected = false;
    if (this.client) {
      try {
        this.client.disconnect();
      } catch {
        // Ignore disconnect errors during cleanup
      }
      this.client = null;
    }
  }
}
