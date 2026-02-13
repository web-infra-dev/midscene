import net from 'node:net';
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
}

/**
 * VNC RFB protocol constants
 */
const RFB = {
  // Client -> Server message types
  SET_PIXEL_FORMAT: 0,
  SET_ENCODINGS: 2,
  FRAMEBUFFER_UPDATE_REQUEST: 3,
  KEY_EVENT: 4,
  POINTER_EVENT: 5,
  CLIENT_CUT_TEXT: 6,

  // Server -> Client message types
  FRAMEBUFFER_UPDATE: 0,
  SET_COLOUR_MAP_ENTRIES: 1,
  BELL: 2,
  SERVER_CUT_TEXT: 3,

  // Encoding types
  RAW: 0,
  COPY_RECT: 1,
  RRE: 2,
  HEXTILE: 5,
  ZRLE: 16,
  CURSOR: -239,
  DESKTOP_SIZE: -223,

  // Security types
  NONE: 1,
  VNC_AUTH: 2,
} as const;

/**
 * VNC mouse button masks
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

interface PixelFormat {
  bitsPerPixel: number;
  depth: number;
  bigEndian: boolean;
  trueColor: boolean;
  redMax: number;
  greenMax: number;
  blueMax: number;
  redShift: number;
  greenShift: number;
  blueShift: number;
}

// DES encryption for VNC authentication
function vncEncryptChallenge(
  password: string,
  challenge: Buffer,
): Buffer {
  // VNC uses a modified DES where each byte is bit-reversed
  const key = Buffer.alloc(8);
  const passwordBytes = Buffer.from(password, 'latin1');
  for (let i = 0; i < 8; i++) {
    if (i < passwordBytes.length) {
      // Reverse bits in each byte (VNC-specific DES key transformation)
      let byte = passwordBytes[i];
      let reversed = 0;
      for (let bit = 0; bit < 8; bit++) {
        reversed = (reversed << 1) | (byte & 1);
        byte >>= 1;
      }
      key[i] = reversed;
    } else {
      key[i] = 0;
    }
  }

  // Use Node.js crypto for DES-ECB encryption
  const crypto = require('node:crypto');
  const result = Buffer.alloc(16);

  // Encrypt first 8 bytes
  const cipher1 = crypto.createCipheriv('des-ecb', key, null);
  cipher1.setAutoPadding(false);
  const enc1 = cipher1.update(challenge.subarray(0, 8));
  enc1.copy(result, 0);

  // Encrypt second 8 bytes
  const cipher2 = crypto.createCipheriv('des-ecb', key, null);
  cipher2.setAutoPadding(false);
  const enc2 = cipher2.update(challenge.subarray(8, 16));
  enc2.copy(result, 8);

  return result;
}

/**
 * Low-level VNC RFB protocol client
 *
 * Implements the RFB (Remote Framebuffer) protocol for connecting to VNC servers.
 * Handles connection, authentication, framebuffer updates, and input events.
 */
export class VNCClient {
  private socket: net.Socket | null = null;
  private connected = false;
  private width = 0;
  private height = 0;
  private pixelFormat: PixelFormat | null = null;
  private framebuffer: Buffer | null = null;
  private serverName = '';
  private options: VNCConnectionOptions;
  private receiveBuffer: Buffer = Buffer.alloc(0);
  private connectPromise: {
    resolve: () => void;
    reject: (err: Error) => void;
  } | null = null;
  private updatePromise: {
    resolve: () => void;
    reject: (err: Error) => void;
  } | null = null;
  private handshakeState:
    | 'version'
    | 'security'
    | 'vnc-auth'
    | 'security-result'
    | 'server-init'
    | 'normal' = 'version';

  constructor(options: VNCConnectionOptions) {
    this.options = {
      connectTimeout: 10000,
      ...options,
    };
  }

  /**
   * Connect to the VNC server
   */
  async connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.connectPromise = { resolve, reject };

      const timeout = setTimeout(() => {
        this.cleanup();
        reject(new Error(`VNC connection timeout after ${this.options.connectTimeout}ms`));
      }, this.options.connectTimeout!);

      const socket = net.createConnection(
        { host: this.options.host, port: this.options.port },
        () => {
          debug('TCP connection established to %s:%d', this.options.host, this.options.port);
        },
      );

      this.socket = socket;

      socket.on('data', (data: Buffer) => {
        this.receiveBuffer = Buffer.concat([this.receiveBuffer, data]);
        try {
          this.processData();
        } catch (err) {
          this.cleanup();
          if (this.connectPromise) {
            clearTimeout(timeout);
            this.connectPromise.reject(err as Error);
            this.connectPromise = null;
          }
        }
      });

      socket.on('error', (err: Error) => {
        debug('Socket error: %s', err.message);
        this.cleanup();
        if (this.connectPromise) {
          clearTimeout(timeout);
          this.connectPromise.reject(
            new Error(`VNC connection error: ${err.message}`),
          );
          this.connectPromise = null;
        }
        if (this.updatePromise) {
          this.updatePromise.reject(err);
          this.updatePromise = null;
        }
      });

      socket.on('close', () => {
        debug('Socket closed');
        this.connected = false;
        if (this.connectPromise) {
          clearTimeout(timeout);
          this.connectPromise.reject(new Error('VNC connection closed unexpectedly'));
          this.connectPromise = null;
        }
        if (this.updatePromise) {
          this.updatePromise.reject(new Error('VNC connection closed'));
          this.updatePromise = null;
        }
      });

      // When connection is established via handshake
      const origResolve = resolve;
      this.connectPromise = {
        resolve: () => {
          clearTimeout(timeout);
          origResolve();
        },
        reject: (err: Error) => {
          clearTimeout(timeout);
          reject(err);
        },
      };
    });
  }

  /**
   * Process received data according to current handshake/protocol state
   */
  private processData(): void {
    while (this.receiveBuffer.length > 0) {
      let consumed = 0;

      switch (this.handshakeState) {
        case 'version':
          consumed = this.handleVersion();
          break;
        case 'security':
          consumed = this.handleSecurity();
          break;
        case 'vnc-auth':
          consumed = this.handleVNCAuth();
          break;
        case 'security-result':
          consumed = this.handleSecurityResult();
          break;
        case 'server-init':
          consumed = this.handleServerInit();
          break;
        case 'normal':
          consumed = this.handleNormalMessage();
          break;
      }

      if (consumed === 0) break; // Need more data
      this.receiveBuffer = this.receiveBuffer.subarray(consumed);
    }
  }

  private handleVersion(): number {
    if (this.receiveBuffer.length < 12) return 0;

    const serverVersion = this.receiveBuffer.subarray(0, 12).toString('ascii');
    debug('Server version: %s', serverVersion.trim());

    // Respond with RFB 003.008 (latest widely supported version)
    this.send(Buffer.from('RFB 003.008\n', 'ascii'));
    this.handshakeState = 'security';
    return 12;
  }

  private handleSecurity(): number {
    if (this.receiveBuffer.length < 1) return 0;

    const numSecurityTypes = this.receiveBuffer[0];

    if (numSecurityTypes === 0) {
      // Error - read the reason
      if (this.receiveBuffer.length < 5) return 0;
      const reasonLen = this.receiveBuffer.readUInt32BE(1);
      if (this.receiveBuffer.length < 5 + reasonLen) return 0;
      const reason = this.receiveBuffer.subarray(5, 5 + reasonLen).toString('utf-8');
      throw new Error(`VNC security error: ${reason}`);
    }

    if (this.receiveBuffer.length < 1 + numSecurityTypes) return 0;

    const securityTypes: number[] = [];
    for (let i = 0; i < numSecurityTypes; i++) {
      securityTypes.push(this.receiveBuffer[1 + i]);
    }

    debug('Available security types: %o', securityTypes);

    // Choose security type
    if (this.options.password && securityTypes.includes(RFB.VNC_AUTH)) {
      // VNC Authentication
      this.send(Buffer.from([RFB.VNC_AUTH]));
      this.handshakeState = 'vnc-auth';
    } else if (securityTypes.includes(RFB.NONE)) {
      // No authentication
      this.send(Buffer.from([RFB.NONE]));
      this.handshakeState = 'security-result';
    } else if (securityTypes.includes(RFB.VNC_AUTH)) {
      throw new Error(
        'VNC server requires authentication but no password was provided',
      );
    } else {
      throw new Error(
        `Unsupported VNC security types: ${securityTypes.join(', ')}`,
      );
    }

    return 1 + numSecurityTypes;
  }

  private handleVNCAuth(): number {
    // Server sends a 16-byte challenge
    if (this.receiveBuffer.length < 16) return 0;

    const challenge = this.receiveBuffer.subarray(0, 16);
    debug('Received VNC auth challenge');

    const response = vncEncryptChallenge(this.options.password || '', challenge);
    this.send(response);
    this.handshakeState = 'security-result';
    return 16;
  }

  private handleSecurityResult(): number {
    if (this.receiveBuffer.length < 4) return 0;

    const result = this.receiveBuffer.readUInt32BE(0);

    if (result !== 0) {
      // Authentication failed
      // In RFB 3.8, there's an error reason string
      if (this.receiveBuffer.length < 8) return 0;
      const reasonLen = this.receiveBuffer.readUInt32BE(4);
      if (this.receiveBuffer.length < 8 + reasonLen) return 0;
      const reason = this.receiveBuffer
        .subarray(8, 8 + reasonLen)
        .toString('utf-8');
      throw new Error(`VNC authentication failed: ${reason}`);
    }

    debug('Authentication successful');

    // Send ClientInit (shared flag = 1 to allow shared connections)
    this.send(Buffer.from([1]));
    this.handshakeState = 'server-init';
    return 4;
  }

  private handleServerInit(): number {
    // ServerInit: 2(width) + 2(height) + 16(pixel-format) + 4(name-length) + name
    if (this.receiveBuffer.length < 24) return 0;

    this.width = this.receiveBuffer.readUInt16BE(0);
    this.height = this.receiveBuffer.readUInt16BE(2);

    this.pixelFormat = {
      bitsPerPixel: this.receiveBuffer[4],
      depth: this.receiveBuffer[5],
      bigEndian: this.receiveBuffer[6] !== 0,
      trueColor: this.receiveBuffer[7] !== 0,
      redMax: this.receiveBuffer.readUInt16BE(8),
      greenMax: this.receiveBuffer.readUInt16BE(10),
      blueMax: this.receiveBuffer.readUInt16BE(12),
      redShift: this.receiveBuffer[14],
      greenShift: this.receiveBuffer[15],
      blueShift: this.receiveBuffer[16],
    };

    const nameLen = this.receiveBuffer.readUInt32BE(20);
    if (this.receiveBuffer.length < 24 + nameLen) return 0;

    this.serverName = this.receiveBuffer
      .subarray(24, 24 + nameLen)
      .toString('utf-8');

    debug(
      'Server init: %dx%d, name: %s, pixel format: %o',
      this.width,
      this.height,
      this.serverName,
      this.pixelFormat,
    );

    // Initialize framebuffer (RGBA, 4 bytes per pixel)
    this.framebuffer = Buffer.alloc(this.width * this.height * 4);

    // Set pixel format to 32-bit RGBA for consistency
    this.setPixelFormat();

    // Set supported encodings
    this.setEncodings([RFB.RAW, RFB.COPY_RECT, RFB.DESKTOP_SIZE]);

    // Request initial full framebuffer update
    this.requestFramebufferUpdate(false);

    this.connected = true;
    this.handshakeState = 'normal';

    if (this.connectPromise) {
      this.connectPromise.resolve();
      this.connectPromise = null;
    }

    return 24 + nameLen;
  }

  private handleNormalMessage(): number {
    if (this.receiveBuffer.length < 1) return 0;

    const messageType = this.receiveBuffer[0];

    switch (messageType) {
      case RFB.FRAMEBUFFER_UPDATE:
        return this.handleFramebufferUpdate();
      case RFB.SET_COLOUR_MAP_ENTRIES:
        return this.handleColorMapEntries();
      case RFB.BELL:
        debug('Bell');
        return 1;
      case RFB.SERVER_CUT_TEXT:
        return this.handleServerCutText();
      default:
        debug('Unknown message type: %d', messageType);
        return this.receiveBuffer.length; // Skip unknown
    }
  }

  private handleFramebufferUpdate(): number {
    // Header: 1(type) + 1(padding) + 2(numRects)
    if (this.receiveBuffer.length < 4) return 0;

    const numRects = this.receiveBuffer.readUInt16BE(2);
    let offset = 4;

    for (let i = 0; i < numRects; i++) {
      // Each rect header: 2(x) + 2(y) + 2(w) + 2(h) + 4(encoding) = 12 bytes
      if (this.receiveBuffer.length < offset + 12) return 0;

      const x = this.receiveBuffer.readUInt16BE(offset);
      const y = this.receiveBuffer.readUInt16BE(offset + 2);
      const w = this.receiveBuffer.readUInt16BE(offset + 4);
      const h = this.receiveBuffer.readUInt16BE(offset + 6);
      const encoding = this.receiveBuffer.readInt32BE(offset + 8);
      offset += 12;

      switch (encoding) {
        case RFB.RAW: {
          const dataLen = w * h * 4; // 4 bytes per pixel (32-bit)
          if (this.receiveBuffer.length < offset + dataLen) return 0;

          // Copy raw pixel data into framebuffer
          this.copyRectToFramebuffer(
            this.receiveBuffer.subarray(offset, offset + dataLen),
            x,
            y,
            w,
            h,
          );
          offset += dataLen;
          break;
        }
        case RFB.COPY_RECT: {
          if (this.receiveBuffer.length < offset + 4) return 0;
          const srcX = this.receiveBuffer.readUInt16BE(offset);
          const srcY = this.receiveBuffer.readUInt16BE(offset + 2);
          this.copyRectFromFramebuffer(srcX, srcY, x, y, w, h);
          offset += 4;
          break;
        }
        case RFB.DESKTOP_SIZE: {
          // Desktop resize
          debug('Desktop resize: %dx%d', w, h);
          this.width = w;
          this.height = h;
          this.framebuffer = Buffer.alloc(w * h * 4);
          break;
        }
        default:
          debug('Unknown encoding: %d', encoding);
          // Cannot determine data length for unknown encoding
          // This is a protocol error
          throw new Error(`Unsupported VNC encoding: ${encoding}`);
      }
    }

    // Framebuffer update complete
    if (this.updatePromise) {
      this.updatePromise.resolve();
      this.updatePromise = null;
    }

    return offset;
  }

  private handleColorMapEntries(): number {
    // Header: 1(type) + 1(padding) + 2(firstColor) + 2(numColors)
    if (this.receiveBuffer.length < 6) return 0;
    const numColors = this.receiveBuffer.readUInt16BE(4);
    const totalLen = 6 + numColors * 6;
    if (this.receiveBuffer.length < totalLen) return 0;
    debug('Color map entries: %d colors (ignored)', numColors);
    return totalLen;
  }

  private handleServerCutText(): number {
    // Header: 1(type) + 3(padding) + 4(length) + text
    if (this.receiveBuffer.length < 8) return 0;
    const textLen = this.receiveBuffer.readUInt32BE(4);
    if (this.receiveBuffer.length < 8 + textLen) return 0;
    const text = this.receiveBuffer.subarray(8, 8 + textLen).toString('latin1');
    debug('Server cut text: %s', text.substring(0, 50));
    return 8 + textLen;
  }

  private copyRectToFramebuffer(
    data: Buffer,
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    if (!this.framebuffer) return;

    for (let row = 0; row < h; row++) {
      const srcOffset = row * w * 4;
      const dstOffset = ((y + row) * this.width + x) * 4;

      // Copy pixel data, converting from server format (BGRA or RGBA) to RGBA
      for (let col = 0; col < w; col++) {
        const si = srcOffset + col * 4;
        const di = dstOffset + col * 4;

        // VNC pixel format after our SetPixelFormat: BGRA (blue at lowest shift)
        // We request: R shift=16, G shift=8, B shift=0 -> pixel is 0xXXRRGGBB in big-endian
        // In little-endian buffer: BB GG RR XX
        // We want RGBA for sharp
        this.framebuffer[di] = data[si + 2]; // R (from byte at +2 in LE)
        this.framebuffer[di + 1] = data[si + 1]; // G
        this.framebuffer[di + 2] = data[si]; // B (from byte at +0 in LE)
        this.framebuffer[di + 3] = 255; // A (opaque)
      }
    }
  }

  private copyRectFromFramebuffer(
    srcX: number,
    srcY: number,
    dstX: number,
    dstY: number,
    w: number,
    h: number,
  ): void {
    if (!this.framebuffer) return;

    // Need temp buffer to handle overlapping regions
    const temp = Buffer.alloc(w * h * 4);

    for (let row = 0; row < h; row++) {
      const srcOffset = ((srcY + row) * this.width + srcX) * 4;
      const tempOffset = row * w * 4;
      this.framebuffer.copy(temp, tempOffset, srcOffset, srcOffset + w * 4);
    }

    for (let row = 0; row < h; row++) {
      const dstOffset = ((dstY + row) * this.width + dstX) * 4;
      const tempOffset = row * w * 4;
      temp.copy(this.framebuffer, dstOffset, tempOffset, tempOffset + w * 4);
    }
  }

  /**
   * Set the pixel format to 32-bit RGBA
   */
  private setPixelFormat(): void {
    const buf = Buffer.alloc(20);
    buf[0] = RFB.SET_PIXEL_FORMAT;
    // 3 bytes padding
    // Pixel format (16 bytes)
    buf[4] = 32; // bits-per-pixel
    buf[5] = 24; // depth
    buf[6] = 0; // big-endian = false (little-endian)
    buf[7] = 1; // true-color = true
    buf.writeUInt16BE(255, 8); // red-max
    buf.writeUInt16BE(255, 10); // green-max
    buf.writeUInt16BE(255, 12); // blue-max
    buf[14] = 16; // red-shift
    buf[15] = 8; // green-shift
    buf[16] = 0; // blue-shift
    // 3 bytes padding
    this.send(buf);
  }

  /**
   * Set supported encoding types
   */
  private setEncodings(encodings: number[]): void {
    const buf = Buffer.alloc(4 + encodings.length * 4);
    buf[0] = RFB.SET_ENCODINGS;
    // 1 byte padding
    buf.writeUInt16BE(encodings.length, 2);
    for (let i = 0; i < encodings.length; i++) {
      buf.writeInt32BE(encodings[i], 4 + i * 4);
    }
    this.send(buf);
  }

  /**
   * Request a framebuffer update from the server
   */
  requestFramebufferUpdate(incremental = true): void {
    const buf = Buffer.alloc(10);
    buf[0] = RFB.FRAMEBUFFER_UPDATE_REQUEST;
    buf[1] = incremental ? 1 : 0;
    buf.writeUInt16BE(0, 2); // x
    buf.writeUInt16BE(0, 4); // y
    buf.writeUInt16BE(this.width, 6);
    buf.writeUInt16BE(this.height, 8);
    this.send(buf);
  }

  /**
   * Wait for the next framebuffer update to complete
   */
  async waitForUpdate(timeout = 5000): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.updatePromise) {
          this.updatePromise = null;
          reject(new Error(`Framebuffer update timeout after ${timeout}ms`));
        }
      }, timeout);

      this.updatePromise = {
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (err: Error) => {
          clearTimeout(timer);
          reject(err);
        },
      };
    });
  }

  /**
   * Capture the current framebuffer as a PNG buffer
   */
  async screenshot(): Promise<Buffer> {
    if (!this.framebuffer || !this.connected) {
      throw new Error('VNC not connected or framebuffer not initialized');
    }

    // Request a fresh full framebuffer update
    this.requestFramebufferUpdate(false);
    await this.waitForUpdate();

    // Convert RGBA raw data to PNG using sharp
    return sharp(this.framebuffer, {
      raw: {
        width: this.width,
        height: this.height,
        channels: 4,
      },
    })
      .png()
      .toBuffer();
  }

  /**
   * Send a pointer (mouse) event
   */
  pointerEvent(x: number, y: number, buttonMask: number): void {
    if (!this.connected) throw new Error('VNC not connected');

    const buf = Buffer.alloc(6);
    buf[0] = RFB.POINTER_EVENT;
    buf[1] = buttonMask;
    buf.writeUInt16BE(Math.max(0, Math.min(x, this.width - 1)), 2);
    buf.writeUInt16BE(Math.max(0, Math.min(y, this.height - 1)), 4);
    this.send(buf);
  }

  /**
   * Send a key event
   */
  keyEvent(keysym: number, down: boolean): void {
    if (!this.connected) throw new Error('VNC not connected');

    const buf = Buffer.alloc(8);
    buf[0] = RFB.KEY_EVENT;
    buf[1] = down ? 1 : 0;
    // 2 bytes padding
    buf.writeUInt32BE(keysym, 4);
    this.send(buf);
  }

  /**
   * Send clipboard text to the server
   */
  clientCutText(text: string): void {
    if (!this.connected) throw new Error('VNC not connected');

    const textBuf = Buffer.from(text, 'latin1');
    const buf = Buffer.alloc(8 + textBuf.length);
    buf[0] = RFB.CLIENT_CUT_TEXT;
    // 3 bytes padding
    buf.writeUInt32BE(textBuf.length, 4);
    textBuf.copy(buf, 8);
    this.send(buf);
  }

  /**
   * Get the screen dimensions
   */
  getScreenSize(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  /**
   * Get the VNC server name
   */
  getServerName(): string {
    return this.serverName;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Disconnect from the VNC server
   */
  disconnect(): void {
    debug('Disconnecting from VNC server');
    this.cleanup();
  }

  private send(data: Buffer): void {
    if (this.socket && !this.socket.destroyed) {
      this.socket.write(data);
    }
  }

  private cleanup(): void {
    this.connected = false;
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.receiveBuffer = Buffer.alloc(0);
  }
}
