import { getDebug } from '@midscene/shared/logger';
import sharp from 'sharp';
import { ARD_SECURITY_TYPE, createArdSecurityType } from './ard-auth';

const debug = getDebug('vnc:client');

/**
 * VNC connection options
 */
export interface VNCConnectionOptions {
  host: string;
  port: number;
  password?: string;
  /**
   * Username for authentication.
   * - macOS Screen Sharing (ARD auth, type 30): required, use macOS account username
   * - NTLM auth (type 4): required, use Windows account username
   * - Standard VNC auth (type 2): not needed, only password is used
   */
  username?: string;
  /** Windows domain for NTLM authentication (default: 'WORKGROUP') */
  domain?: string;
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
      debug: true, // Enable library-level debug logging
      fps: this.options.fps,
      encodings: [
        encodings.copyRect,
        encodings.zrle,
        encodings.hextile,
        encodings.raw,
        encodings.pseudoDesktopSize,
      ],
    });

    // Log the security types supported by the library before injection
    const existingTypes = Object.keys(
      (this.client as any)._securityTypes || {},
    );
    console.log(
      '[VNC] Library built-in security types: [%s]',
      existingTypes.join(', '),
    );

    // Inject ARD (type 30) security handler for macOS Screen Sharing
    // The library only ships None/VNC/NTLM; we monkey-patch to add ARD support
    (this.client as any)._securityTypes[ARD_SECURITY_TYPE] =
      createArdSecurityType();

    console.log(
      '[VNC] After injection, security types: [%s]',
      Object.keys((this.client as any)._securityTypes || {}).join(', '),
    );

    // Monkey-patch _handleVersion to support macOS Screen Sharing (RFB 003.889)
    // The library only recognizes 003.003/006/007/008 and disconnects on 003.889.
    // macOS uses 003.889 to signal support for Apple Remote Desktop (RA2) auth.
    // We must echo "RFB 003.889\n" back so macOS offers security type 30 (ARD).
    //
    // We fully replace _handleVersion (not peek-then-delegate) because the
    // SocketBuffer may not have data yet when this method is called. We must
    // use readNBytesOffset(12) which properly awaits incoming data.
    const MACOS_VER = 'RFB 003.889\n';
    const VERSION_MAP: Record<string, { reply: string; ver: string }> = {
      'RFB 003.003\n': { reply: 'RFB 003.003\n', ver: '3.3' },
      'RFB 003.006\n': { reply: 'RFB 003.006\n', ver: '3.6' },
      'RFB 003.007\n': { reply: 'RFB 003.007\n', ver: '3.7' },
      'RFB 003.008\n': { reply: 'RFB 003.008\n', ver: '3.8' },
      [MACOS_VER]: { reply: MACOS_VER, ver: '3.8' },
    };

    (this.client as any)._handleVersion = async () => {
      const sb = (this.client as any)._socketBuffer;
      // Await until 12 bytes arrive, then consume them
      const verBuf = await sb.readNBytesOffset(12);
      const verStr = Buffer.from(verBuf).toString('ascii');
      console.log(
        '[VNC] Server RFB version: %s (hex: %s)',
        verStr.trim(),
        Buffer.from(verBuf).toString('hex'),
      );

      const match = VERSION_MAP[verStr];
      if (!match) {
        console.error('[VNC] Unknown RFB version: %s — disconnecting', verStr.trim());
        (this.client as any).disconnect();
        return;
      }

      console.log(
        '[VNC] Responding with version %s (internal: %s)',
        match.reply.trim(),
        match.ver,
      );
      (this.client as any)._connection?.write(
        Buffer.from(match.reply, 'ascii'),
      );
      (this.client as any)._version = match.ver;
      (this.client as any)._waitingSecurityTypes = true;
    };

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
          console.error('[VNC] settle() with error:', err.message);
          this.cleanup();
          reject(err);
        } else {
          console.log('[VNC] settle() success');
          resolve();
        }
      };

      this.client.on('connected', () => {
        console.log(
          '[VNC] Event: connected (TCP to %s:%d)',
          this.options.host,
          this.options.port,
        );
      });

      this.client.on('authenticated', () => {
        console.log('[VNC] Event: authenticated');
      });

      this.client.on('authError', () => {
        console.error('[VNC] Event: authError');
        settle(new Error('VNC authentication failed'));
      });

      this.client.on('connectError', (error: Error) => {
        console.error('[VNC] Event: connectError:', error?.message || error);
        settle(
          new Error(`VNC connection error: ${error?.message || error}`),
        );
      });

      this.client.on('connectTimeout', () => {
        console.error('[VNC] Event: connectTimeout');
        settle(
          new Error(
            `VNC server did not respond within ${this.options.connectTimeout}ms`,
          ),
        );
      });

      this.client.on('closed', () => {
        console.log('[VNC] Event: closed (connection closed by server)');
        this._connected = false;
        settle(new Error('VNC connection closed unexpectedly'));
      });

      this.client.on('disconnected', () => {
        console.log('[VNC] Event: disconnected');
        this._connected = false;
      });

      this.client.on('firstFrameUpdate', () => {
        console.log(
          '[VNC] Event: firstFrameUpdate (%dx%d, name: %s)',
          this.client.clientWidth,
          this.client.clientHeight,
          this.client.clientName,
        );
        this.firstFrameReceived = true;
        this._connected = true;
        settle();
      });

      this.client.on('desktopSizeChanged', (size: { width: number; height: number }) => {
        console.log('[VNC] Event: desktopSizeChanged %dx%d', size.width, size.height);
      });

      this.client.on('securityResult', (result: any) => {
        console.log('[VNC] Event: securityResult:', result);
      });

      // Build auth object based on provided credentials
      // - VNC auth (type 2): only needs { password }
      // - NTLM auth (type 4): needs { username, password, domain? }
      // - ARD auth (type 30): needs { username, password }
      // The server decides which auth type to use during handshake
      let auth: Record<string, string> | undefined;
      if (this.options.password || this.options.username) {
        auth = {};
        if (this.options.password) auth.password = this.options.password;
        if (this.options.username) auth.username = this.options.username;
        if (this.options.domain) auth.domain = this.options.domain;
      }

      console.log(
        '[VNC] Calling client.connect() with host=%s, port=%d, auth=%s',
        this.options.host,
        this.options.port,
        auth ? JSON.stringify(Object.keys(auth)) : 'none',
      );

      // Initiate connection
      this.client.connect({
        host: this.options.host,
        port: this.options.port,
        path: null,
        auth,
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
