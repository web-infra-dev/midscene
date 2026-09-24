import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { executeImageTransform } from '@/img/backends/photon';
import { EncodedImage } from '@/img/encoded-image';
import { beforeAll, describe, expect, it, rs } from '@rstest/core';
import * as photon from '@silvia-odwyer/photon/photon_rs.js';
import sharp from 'sharp';

rs.mock('@/img/get-photon', () => ({ default: async () => photon }));

describe('Photon backend with real WASM', () => {
  beforeAll(() => {
    const require = createRequire(import.meta.url);
    photon.initSync({
      module: readFileSync(
        require.resolve('@silvia-odwyer/photon/photon_rs_bg.wasm'),
      ),
    });
  });

  it('uses real Lanczos3 when explicitly requested', async () => {
    const pixels = Buffer.from(
      Array.from(
        { length: 16 * 16 * 3 },
        (_, i) => (i * 73 + (i % 17) * 11) % 256,
      ),
    );
    const input = EncodedImage.fromBytes(
      await sharp(pixels, {
        raw: { width: 16, height: 16, channels: 3 },
      })
        .png()
        .toBuffer(),
    );
    const actual = await executeImageTransform(
      input,
      [{ type: 'resize', width: 7, height: 7, kernel: 'lanczos3' }],
      { format: 'png' },
    );
    const original = photon.PhotonImage.new_from_byteslice(input.bytes);
    try {
      const expected = photon.resize(
        original,
        7,
        7,
        photon.SamplingFilter.Lanczos3,
      );
      try {
        expect(Buffer.from(actual)).toEqual(Buffer.from(expected.get_bytes()));
      } finally {
        expected.free();
      }
    } finally {
      original.free();
    }
  });

  it('executes crop, resize, two-sided padding and overlay with valid ownership', async () => {
    const input = EncodedImage.fromBytes(
      await sharp({
        create: { width: 8, height: 6, channels: 4, background: '#ffffff' },
      })
        .png()
        .toBuffer(),
    );
    const pixels = new Uint8Array(6 * 5 * 4);
    pixels.set([255, 0, 0, 255]);
    const output = await executeImageTransform(
      input,
      [
        { type: 'crop', rect: { left: 1, top: 1, width: 4, height: 3 } },
        { type: 'resize', width: 4, height: 4 },
        { type: 'pad', right: 2, bottom: 1 },
        { type: 'overlay', width: 6, height: 5, pixels },
      ],
      { format: 'png' },
    );
    expect(EncodedImage.fromBytes(output).size).toEqual({
      width: 6,
      height: 5,
    });
    const raw = await sharp(output).ensureAlpha().raw().toBuffer();
    expect(Array.from(raw.subarray(0, 4))).toEqual([255, 0, 0, 255]);
    expect(Array.from(raw.subarray(raw.length - 4))).toEqual([
      255, 255, 255, 255,
    ]);
  });
});
