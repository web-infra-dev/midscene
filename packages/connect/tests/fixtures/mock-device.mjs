import { deflateSync } from 'node:zlib';

/** Build a solid-color RGB PNG without extra dependencies. */
export function solidPng(width, height, [r, g, b] = [32, 128, 224]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const row = Buffer.concat([
    Buffer.from([0]),
    Buffer.alloc(width * 3).fill(Buffer.from([r, g, b])),
  ]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(Array(height).fill(row)))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A device that records every call; used by tests and as a docs example. */
export default {
  name: 'Mock Screen',
  description: 'A fake touchscreen used for testing',
  pointerType: 'touch',
  options: {
    type: 'object',
    properties: {
      width: { type: 'integer', minimum: 1 },
      height: { type: 'integer', minimum: 1 },
    },
  },
  connect({ width = 400, height = 300 } = {}) {
    const calls = [];
    globalThis.__mockDeviceCalls = calls;
    const record =
      (name) =>
      (...args) => {
        calls.push([name, ...args]);
      };
    return {
      screenshot: () => solidPng(width, height),
      actions: {
        tap: record('tap'),
        longPress: record('longPress'),
        swipe: record('swipe'),
        typeText: record('typeText'),
        keyboardPress: record('keyboardPress'),
        clearInput: record('clearInput'),
        homeButton: record('homeButton'),
        wakeVoiceAssistant: {
          description: 'Wake up the voice assistant with a phrase',
          params: {
            type: 'object',
            properties: {
              phrase: { type: 'string', description: 'What to say' },
              target: { 'x-midscene-locate': true, description: 'Mic button' },
            },
            required: ['phrase'],
          },
          call: (params) => {
            calls.push(['wakeVoiceAssistant', params]);
            return { heard: params.phrase };
          },
        },
      },
      destroy: record('destroy'),
    };
  },
};
