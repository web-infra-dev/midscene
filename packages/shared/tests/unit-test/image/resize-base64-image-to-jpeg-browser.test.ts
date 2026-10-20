import { beforeEach, describe, expect, it, rs } from '@rstest/core';

const photonMocks = rs.hoisted(() => {
  const inputFree = rs.fn();
  const inputGetBytesJpeg = rs.fn(() =>
    Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
  );
  const inputImage = {
    free: inputFree,
    get_bytes_jpeg: inputGetBytesJpeg,
    get_height: rs.fn(() => 6),
    get_width: rs.fn(() => 8),
  };

  const outputFree = rs.fn();
  const outputGetBytesJpeg = rs.fn(() =>
    Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
  );
  const outputImage = {
    free: outputFree,
    get_bytes_jpeg: outputGetBytesJpeg,
  };

  const newFromBase64 = rs.fn(() => inputImage);
  const newFromByteslice = rs.fn(() => inputImage);
  const resize = rs.fn(() => outputImage);
  const samplingFilter = { CatmullRom: 'CatmullRom' };
  const getPhoton = rs.fn(async () => ({
    PhotonImage: {
      new_from_base64: newFromBase64,
      new_from_byteslice: newFromByteslice,
    },
    SamplingFilter: samplingFilter,
    resize,
  }));

  return {
    getPhoton,
    inputFree,
    inputGetBytesJpeg,
    newFromBase64,
    newFromByteslice,
    outputFree,
    outputGetBytesJpeg,
    resize,
    samplingFilter,
  };
});

rs.mock('@/utils', () => ({ ifInNode: false }));
rs.mock('@/img/get-photon', () => ({ default: photonMocks.getPhoton }));

import {
  constrainBase64ImageToMaxSize,
  convertBase64ImageToJpeg,
  resizeBase64ImageToJpeg,
} from '@/img';

const pngDataUrl =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGMQqbiDFTEMpAQAorNDgTX/VEoAAAAASUVORK5CYII=';

describe('JPEG conversion in browser environments', () => {
  beforeEach(() => {
    rs.clearAllMocks();
  });

  it('converts an unscaled PNG with Photon and releases the input image', async () => {
    await expect(convertBase64ImageToJpeg(pngDataUrl, 77)).resolves.toMatch(
      /^data:image\/jpeg;base64,/,
    );

    expect(photonMocks.newFromBase64).toHaveBeenCalledOnce();
    expect(photonMocks.inputGetBytesJpeg).toHaveBeenCalledWith(77);
    expect(photonMocks.inputFree).toHaveBeenCalledOnce();
    expect(photonMocks.resize).not.toHaveBeenCalled();
  });

  it('encodes an unchanged PNG without allocating a resized image', async () => {
    await expect(
      resizeBase64ImageToJpeg(pngDataUrl, {
        sourceSize: { width: 8, height: 6 },
        targetSize: { width: 8, height: 6 },
        jpegQuality: 80,
      }),
    ).resolves.toMatch(/^data:image\/jpeg;base64,/);

    expect(photonMocks.newFromByteslice).toHaveBeenCalledOnce();
    expect(photonMocks.resize).not.toHaveBeenCalled();
    expect(photonMocks.inputGetBytesJpeg).toHaveBeenCalledWith(80);
    expect(photonMocks.inputFree).toHaveBeenCalledOnce();
    expect(photonMocks.outputFree).not.toHaveBeenCalled();
  });

  it('resizes with Photon and releases both images', async () => {
    await expect(
      resizeBase64ImageToJpeg(pngDataUrl, {
        sourceSize: { width: 8, height: 6 },
        targetSize: { width: 4, height: 3 },
        jpegQuality: 81,
      }),
    ).resolves.toMatch(/^data:image\/jpeg;base64,/);

    expect(photonMocks.resize).toHaveBeenCalledWith(
      expect.any(Object),
      4,
      3,
      photonMocks.samplingFilter.CatmullRom,
    );
    expect(photonMocks.outputGetBytesJpeg).toHaveBeenCalledWith(81);
    expect(photonMocks.inputFree).toHaveBeenCalledOnce();
    expect(photonMocks.outputFree).toHaveBeenCalledOnce();
  });

  it('constrains the longest edge with Photon from one parsed buffer', async () => {
    await expect(
      constrainBase64ImageToMaxSize(pngDataUrl, {
        maxSize: 4,
        jpegQuality: 83,
      }),
    ).resolves.toMatch(/^data:image\/jpeg;base64,/);

    expect(photonMocks.newFromByteslice).toHaveBeenCalledOnce();
    expect(photonMocks.resize).toHaveBeenCalledWith(
      expect.any(Object),
      4,
      3,
      photonMocks.samplingFilter.CatmullRom,
    );
    expect(photonMocks.outputGetBytesJpeg).toHaveBeenCalledWith(83);
    expect(photonMocks.inputFree).toHaveBeenCalledOnce();
    expect(photonMocks.outputFree).toHaveBeenCalledOnce();
  });
});
