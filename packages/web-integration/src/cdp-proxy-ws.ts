/**
 * Minimal WebSocket frame helpers (RFC 6455).
 * Used by cdp-proxy.ts. Extracted for testability.
 */

import { randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// WebSocket opcodes
// ---------------------------------------------------------------------------

export const OP_CONTINUATION = 0x00;
export const OP_TEXT = 0x01;
export const OP_BINARY = 0x02;
export const OP_CLOSE = 0x08;
export const OP_PING = 0x09;
export const OP_PONG = 0x0a;

// ---------------------------------------------------------------------------
// Frame encoding
// ---------------------------------------------------------------------------

export function encodeFrame(
  data: Buffer,
  opcode = OP_TEXT,
  mask = false,
): Buffer {
  const len = data.length;
  let headerLen = 2;
  if (len > 65535) headerLen += 8;
  else if (len > 125) headerLen += 2;
  if (mask) headerLen += 4;

  const header = Buffer.alloc(headerLen);
  header[0] = 0x80 | opcode; // FIN + opcode
  let offset = 1;

  if (len > 65535) {
    header[offset++] = (mask ? 0x80 : 0) | 127;
    header.writeBigUInt64BE(BigInt(len), offset);
    offset += 8;
  } else if (len > 125) {
    header[offset++] = (mask ? 0x80 : 0) | 126;
    header.writeUInt16BE(len, offset);
    offset += 2;
  } else {
    header[offset++] = (mask ? 0x80 : 0) | len;
  }

  if (mask) {
    const maskBytes = randomBytes(4);
    maskBytes.copy(header, offset);
    const masked = Buffer.alloc(len);
    for (let i = 0; i < len; i++) masked[i] = data[i] ^ maskBytes[i & 3];
    return Buffer.concat([header, masked]);
  }

  return Buffer.concat([header, data]);
}

// ---------------------------------------------------------------------------
// Frame parsing
// ---------------------------------------------------------------------------

export interface ParsedFrame {
  fin: boolean;
  opcode: number;
  payload: Buffer;
  total: number;
}

export function parseFrame(buf: Buffer): ParsedFrame | null {
  if (buf.length < 2) return null;
  const fin = (buf[0] & 0x80) !== 0;
  const opcode = buf[0] & 0x0f;
  const isMasked = (buf[1] & 0x80) !== 0;
  let payloadLen = buf[1] & 0x7f;
  let offset = 2;

  if (payloadLen === 126) {
    if (buf.length < 4) return null;
    payloadLen = buf.readUInt16BE(2);
    offset = 4;
  } else if (payloadLen === 127) {
    if (buf.length < 10) return null;
    payloadLen = Number(buf.readBigUInt64BE(2));
    offset = 10;
  }

  if (isMasked) offset += 4;
  if (buf.length < offset + payloadLen) return null;

  let payload: Buffer;
  if (isMasked) {
    const maskKey = buf.subarray(offset - 4, offset);
    payload = Buffer.alloc(payloadLen);
    for (let i = 0; i < payloadLen; i++)
      payload[i] = buf[offset + i] ^ maskKey[i & 3];
  } else {
    payload = buf.subarray(offset, offset + payloadLen);
  }

  return { fin, opcode, payload, total: offset + payloadLen };
}

// ---------------------------------------------------------------------------
// Fragment reassembly
//
// WebSocket allows a message to be split across multiple frames:
//   [opcode, FIN=0] [continuation, FIN=0]* [continuation, FIN=1]
// We buffer fragments and emit the complete message once FIN=1.
// ---------------------------------------------------------------------------

interface FragmentState {
  opcode: number;
  chunks: Buffer[];
}

export function createFragmentHandler(
  onMessage: (opcode: number, payload: Buffer) => void,
) {
  let state: FragmentState | null = null;

  return (frame: ParsedFrame) => {
    if (frame.opcode >= 0x08) {
      // Control frames (close/ping/pong) are never fragmented — deliver immediately
      onMessage(frame.opcode, frame.payload);
      return;
    }

    if (frame.opcode !== OP_CONTINUATION) {
      // Start of a new message (possibly the only frame if FIN=1)
      state = { opcode: frame.opcode, chunks: [frame.payload] };
    } else if (state) {
      // Continuation frame
      state.chunks.push(frame.payload);
    } else {
      // Orphan continuation without a starting frame — skip
      return;
    }

    if (frame.fin && state) {
      const payload =
        state.chunks.length === 1
          ? state.chunks[0]
          : Buffer.concat(state.chunks);
      const { opcode } = state;
      state = null;
      onMessage(opcode, payload);
    }
  };
}
