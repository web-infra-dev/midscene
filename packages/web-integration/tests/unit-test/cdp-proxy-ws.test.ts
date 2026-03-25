import { describe, expect, it } from 'vitest';
import {
  OP_BINARY,
  OP_CLOSE,
  OP_CONTINUATION,
  OP_PING,
  OP_PONG,
  OP_TEXT,
  createFragmentHandler,
  encodeFrame,
  parseFrame,
} from '../../src/cdp-proxy-ws';

describe('encodeFrame / parseFrame roundtrip', () => {
  it('small text frame (unmasked)', () => {
    const data = Buffer.from('hello');
    const encoded = encodeFrame(data, OP_TEXT, false);
    const parsed = parseFrame(encoded);
    expect(parsed).not.toBeNull();
    expect(parsed!.fin).toBe(true);
    expect(parsed!.opcode).toBe(OP_TEXT);
    expect(parsed!.payload.toString()).toBe('hello');
    expect(parsed!.total).toBe(encoded.length);
  });

  it('small text frame (masked)', () => {
    const data = Buffer.from('world');
    const encoded = encodeFrame(data, OP_TEXT, true);
    const parsed = parseFrame(encoded);
    expect(parsed).not.toBeNull();
    expect(parsed!.payload.toString()).toBe('world');
  });

  it('medium payload (126–65535 bytes)', () => {
    const data = Buffer.alloc(300, 0x42);
    const encoded = encodeFrame(data, OP_BINARY, false);
    const parsed = parseFrame(encoded);
    expect(parsed).not.toBeNull();
    expect(parsed!.opcode).toBe(OP_BINARY);
    expect(parsed!.payload.length).toBe(300);
    expect(parsed!.payload.every((b) => b === 0x42)).toBe(true);
  });

  it('medium masked payload', () => {
    const data = Buffer.alloc(200, 0xab);
    const encoded = encodeFrame(data, OP_BINARY, true);
    const parsed = parseFrame(encoded);
    expect(parsed).not.toBeNull();
    expect(parsed!.payload.length).toBe(200);
    expect(parsed!.payload.every((b) => b === 0xab)).toBe(true);
  });

  it('empty payload', () => {
    const data = Buffer.alloc(0);
    const encoded = encodeFrame(data, OP_TEXT, false);
    const parsed = parseFrame(encoded);
    expect(parsed).not.toBeNull();
    expect(parsed!.payload.length).toBe(0);
  });

  it('close frame', () => {
    const data = Buffer.alloc(0);
    const encoded = encodeFrame(data, OP_CLOSE, false);
    const parsed = parseFrame(encoded);
    expect(parsed).not.toBeNull();
    expect(parsed!.opcode).toBe(OP_CLOSE);
  });

  it('ping frame with payload', () => {
    const data = Buffer.from('ping-data');
    const encoded = encodeFrame(data, OP_PING, false);
    const parsed = parseFrame(encoded);
    expect(parsed).not.toBeNull();
    expect(parsed!.opcode).toBe(OP_PING);
    expect(parsed!.payload.toString()).toBe('ping-data');
  });

  it('pong frame', () => {
    const data = Buffer.from('pong-data');
    const encoded = encodeFrame(data, OP_PONG, false);
    const parsed = parseFrame(encoded);
    expect(parsed).not.toBeNull();
    expect(parsed!.opcode).toBe(OP_PONG);
    expect(parsed!.payload.toString()).toBe('pong-data');
  });
});

describe('parseFrame edge cases', () => {
  it('returns null for buffer shorter than 2 bytes', () => {
    expect(parseFrame(Buffer.alloc(0))).toBeNull();
    expect(parseFrame(Buffer.alloc(1))).toBeNull();
  });

  it('returns null for incomplete payload', () => {
    // Encode a 10-byte frame but truncate it
    const encoded = encodeFrame(Buffer.alloc(10, 0x41), OP_TEXT, false);
    const truncated = encoded.subarray(0, encoded.length - 3);
    expect(parseFrame(truncated)).toBeNull();
  });

  it('parses multiple frames from concatenated buffer', () => {
    const frame1 = encodeFrame(Buffer.from('first'), OP_TEXT, false);
    const frame2 = encodeFrame(Buffer.from('second'), OP_TEXT, false);
    const combined = Buffer.concat([frame1, frame2]);

    const parsed1 = parseFrame(combined);
    expect(parsed1).not.toBeNull();
    expect(parsed1!.payload.toString()).toBe('first');

    const remaining = combined.subarray(parsed1!.total);
    const parsed2 = parseFrame(remaining);
    expect(parsed2).not.toBeNull();
    expect(parsed2!.payload.toString()).toBe('second');
  });
});

describe('createFragmentHandler', () => {
  it('delivers single-frame message immediately', () => {
    const messages: { opcode: number; data: string }[] = [];
    const handler = createFragmentHandler((opcode, payload) => {
      messages.push({ opcode, data: payload.toString() });
    });

    handler({
      fin: true,
      opcode: OP_TEXT,
      payload: Buffer.from('complete'),
      total: 0,
    });

    expect(messages).toHaveLength(1);
    expect(messages[0].data).toBe('complete');
  });

  it('reassembles fragmented message', () => {
    const messages: { opcode: number; data: string }[] = [];
    const handler = createFragmentHandler((opcode, payload) => {
      messages.push({ opcode, data: payload.toString() });
    });

    // First fragment
    handler({
      fin: false,
      opcode: OP_TEXT,
      payload: Buffer.from('hel'),
      total: 0,
    });
    expect(messages).toHaveLength(0);

    // Continuation
    handler({
      fin: false,
      opcode: OP_CONTINUATION,
      payload: Buffer.from('lo '),
      total: 0,
    });
    expect(messages).toHaveLength(0);

    // Final fragment
    handler({
      fin: true,
      opcode: OP_CONTINUATION,
      payload: Buffer.from('world'),
      total: 0,
    });
    expect(messages).toHaveLength(1);
    expect(messages[0].opcode).toBe(OP_TEXT);
    expect(messages[0].data).toBe('hello world');
  });

  it('delivers control frames immediately even during fragmentation', () => {
    const messages: { opcode: number; data: string }[] = [];
    const handler = createFragmentHandler((opcode, payload) => {
      messages.push({ opcode, data: payload.toString() });
    });

    // Start a fragmented message
    handler({
      fin: false,
      opcode: OP_TEXT,
      payload: Buffer.from('part1'),
      total: 0,
    });

    // Ping arrives mid-fragment
    handler({
      fin: true,
      opcode: OP_PING,
      payload: Buffer.from(''),
      total: 0,
    });
    expect(messages).toHaveLength(1);
    expect(messages[0].opcode).toBe(OP_PING);

    // Complete the fragmented message
    handler({
      fin: true,
      opcode: OP_CONTINUATION,
      payload: Buffer.from('part2'),
      total: 0,
    });
    expect(messages).toHaveLength(2);
    expect(messages[1].opcode).toBe(OP_TEXT);
    expect(messages[1].data).toBe('part1part2');
  });

  it('skips orphan continuation frames', () => {
    const messages: { opcode: number; data: string }[] = [];
    const handler = createFragmentHandler((opcode, payload) => {
      messages.push({ opcode, data: payload.toString() });
    });

    // Continuation without a starting frame
    handler({
      fin: true,
      opcode: OP_CONTINUATION,
      payload: Buffer.from('orphan'),
      total: 0,
    });
    expect(messages).toHaveLength(0);
  });
});
