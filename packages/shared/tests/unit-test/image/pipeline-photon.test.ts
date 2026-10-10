import { executeImageTransform } from '@/img/backends/photon';
import { paddingToMatchBlock } from '@/img/backends/photon-compat';
import { EncodedImage } from '@/img/encoded-image';
import { beforeEach, describe, expect, it, rs } from '@rstest/core';
import type { PhotonImage } from '@silvia-odwyer/photon';

const mocks = rs.hoisted(() => ({
  load: rs.fn(),
  encode: rs.fn(),
  input: {
    free: rs.fn(),
    get_bytes_jpeg: rs.fn(),
    get_width: () => 8,
    get_height: () => 6,
  },
  resize: rs.fn(),
  crop: rs.fn(),
  padding_right: rs.fn(),
  padding_bottom: rs.fn(),
  freeColor: rs.fn(),
}));
rs.mock('@/img/get-photon', () => ({ default: mocks.load }));
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGMQqbiDFTEMpAQAorNDgTX/VEoAAAAASUVORK5CYII=';

describe('Photon pipeline ownership', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    mocks.load.mockResolvedValue({
      PhotonImage: { new_from_byteslice: () => mocks.input },
      SamplingFilter: { Nearest: 0, CatmullRom: 1 },
      resize: mocks.resize,
      crop: mocks.crop,
      padding_right: mocks.padding_right,
      padding_bottom: mocks.padding_bottom,
      Rgba: class {
        free = mocks.freeColor;
      },
    });
    mocks.encode.mockReturnValue(new Uint8Array([1]));
    mocks.input.get_bytes_jpeg = mocks.encode;
  });

  it('releases every replaced image and encodes only the final image', async () => {
    const cropped = { free: rs.fn() };
    const resized = { free: rs.fn(), get_bytes_jpeg: mocks.encode };
    mocks.crop.mockReturnValue(cropped);
    mocks.resize.mockReturnValue(resized);
    await executeImageTransform(
      EncodedImage.fromBase64(png),
      [
        { type: 'crop', rect: { left: 0, top: 0, width: 4, height: 3 } },
        { type: 'resize', width: 2, height: 2 },
      ],
      { format: 'jpeg', quality: 90 },
    );
    expect(mocks.input.free).toHaveBeenCalledTimes(1);
    expect(cropped.free).toHaveBeenCalledTimes(1);
    expect(resized.free).toHaveBeenCalledTimes(1);
    expect(mocks.encode).toHaveBeenCalledTimes(1);
    expect(mocks.encode).toHaveBeenCalledWith(90);
  });

  it('releases input when an operation throws', async () => {
    mocks.resize.mockImplementation(() => {
      throw new Error('resize failed');
    });
    await expect(
      executeImageTransform(
        EncodedImage.fromBase64(png),
        [{ type: 'resize', width: 2, height: 2 }],
        { format: 'jpeg', quality: 90 },
      ),
    ).rejects.toThrow('resize failed');
    expect(mocks.input.free).toHaveBeenCalledTimes(1);
  });

  it('legacy Photon padding frees only owned intermediates on failure', async () => {
    const padded = { free: rs.fn() };
    mocks.padding_right.mockReturnValue(padded);
    mocks.padding_bottom.mockImplementation(() => {
      throw new Error('padding failed');
    });
    await expect(
      paddingToMatchBlock(mocks.input as unknown as PhotonImage, 28),
    ).rejects.toThrow('padding failed');
    expect(padded.free).toHaveBeenCalledTimes(1);
    expect(mocks.input.free).not.toHaveBeenCalled();
  });

  it('releases intermediate padding on failure and transfers a fresh color to each WASM call', async () => {
    const padded = { free: rs.fn() };
    mocks.padding_right.mockReturnValue(padded);
    mocks.padding_bottom.mockImplementation(() => {
      throw new Error('padding failed');
    });
    await expect(
      executeImageTransform(
        EncodedImage.fromBase64(png),
        [{ type: 'pad', right: 1, bottom: 1 }],
        { format: 'jpeg', quality: 90 },
      ),
    ).rejects.toThrow('padding failed');
    expect(mocks.input.free).toHaveBeenCalledTimes(1);
    expect(padded.free).toHaveBeenCalledTimes(1);
    expect(mocks.padding_right.mock.calls[0][2]).not.toBe(
      mocks.padding_bottom.mock.calls[0][2],
    );
    expect(mocks.freeColor).not.toHaveBeenCalled();
  });

  it('releases the final image when encoding rejects', async () => {
    mocks.encode.mockImplementation(() => {
      throw new Error('encode failed');
    });
    await expect(
      executeImageTransform(EncodedImage.fromBase64(png), [], {
        format: 'jpeg',
        quality: 90,
      }),
    ).rejects.toThrow('encode failed');
    expect(mocks.input.free).toHaveBeenCalledTimes(1);
  });
});
