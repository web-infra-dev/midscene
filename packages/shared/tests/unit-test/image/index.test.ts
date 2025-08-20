import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  httpImg2Base64,
  imageInfo,
  imageInfoOfBase64,
  isValidPNGImageBuffer,
  localImg2Base64,
  resizeAndConvertImgBuffer,
  resizeImgBase64,
} from 'src/img';
import getJimp from 'src/img/get-jimp';
import {
  createImgBase64ByFormat,
  cropByRect,
  jimpFromBase64,
  jimpToBase64,
  paddingToMatchBlock,
  parseBase64,
  saveBase64Image,
} from 'src/img/transform';
import { getFixture } from 'tests/utils';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

describe('image utils', () => {
  const image = getFixture('icon.png');
  it('imageInfo', async () => {
    const info = await imageInfo(image);

    // test basic properties of ImageInfo
    expect(info.width).toMatchSnapshot();
    expect(info.height).toMatchSnapshot();

    // test basic properties of jimpImage
    expect(typeof info.jimpImage.getBuffer).toBe('function');
    expect(typeof info.jimpImage.getBufferAsync).toBe('function');
    expect(typeof info.jimpImage.getPixelColour).toBe('function');
    expect(typeof info.jimpImage.setPixelColour).toBe('function');
    expect(typeof info.jimpImage.writeAsync).toBe('function');

    // shapeMode is inconsistent across environments
    expect(info.jimpImage.bitmap).toMatchSnapshot();
  });

  it('localImg2Base64', () => {
    const base64 = localImg2Base64(image);
    expect(base64).toMatchSnapshot();

    const headlessBase64 = localImg2Base64(image, true);
    expect(headlessBase64).toMatchSnapshot();
  });

  it('localImg2Base64 + imageInfo', async () => {
    const image = getFixture('icon.png');
    const base64 = localImg2Base64(image);
    const info = await imageInfoOfBase64(base64);
    expect(info.width).toMatchSnapshot();
    expect(info.height).toMatchSnapshot();
  });

  it('jpeg + base64 + imageInfo', async () => {
    const image = getFixture('heytea.jpeg');
    const base64 = localImg2Base64(image);
    const info = await imageInfoOfBase64(base64);
    expect(info.width).toMatchSnapshot();
    expect(info.height).toMatchSnapshot();
  });

  it('jimp + imageInfo', async () => {
    const image = getFixture('heytea.jpeg');
    const jimp = await getJimp();
    const jimpImage = await jimp.read(image);
    const info = await imageInfo(jimpImage);
    expect(info.width).toMatchSnapshot();
    expect(info.height).toMatchSnapshot();
  });

  it('resizeImgBase64', async () => {
    const image = getFixture('heytea.jpeg');

    const base64 = localImg2Base64(image);
    const resizedBase64 = await resizeImgBase64(base64, {
      width: 100,
      height: 100,
    });
    expect(resizedBase64).toContain(';base64,');
  });

  it('paddingToMatchBlock', async () => {
    const image = getFixture('heytea.jpeg');
    const base64 = localImg2Base64(image);
    const jimpImage = await jimpFromBase64(base64);
    const result = await paddingToMatchBlock(jimpImage);

    const width = result.bitmap.width;
    expect(width).toMatchSnapshot();

    const height = result.bitmap.height;
    expect(height).toMatchSnapshot();

    const tmpFile = join(tmpdir(), 'heytea-padded.jpeg');
    await saveBase64Image({
      base64Data: await jimpToBase64(result),
      outputPath: tmpFile,
    });
    // console.log('tmpFile', tmpFile);
  });

  it('cropByRect, with padding', async () => {
    const image = getFixture('heytea.jpeg');
    const base64 = localImg2Base64(image);
    const croppedBase64 = await cropByRect(
      base64,
      {
        left: 200,
        top: 80,
        width: 100,
        height: 400,
      },
      true,
    );

    expect(croppedBase64).toBeTruthy();

    const info = await imageInfoOfBase64(croppedBase64);
    // biome-ignore lint/style/noUnusedTemplateLiteral: by intention
    expect(info.width).toMatchInlineSnapshot(`112`);
    // biome-ignore lint/style/noUnusedTemplateLiteral: by intention
    expect(info.height).toMatchInlineSnapshot(`420`);

    const tmpFile = join(tmpdir(), 'heytea-cropped.jpeg');
    await saveBase64Image({
      base64Data: croppedBase64,
      outputPath: tmpFile,
    });
    console.log('cropped image saved to', tmpFile);
  });

  it('cropByRect, without padding', async () => {
    const image = getFixture('heytea.jpeg');
    const base64 = localImg2Base64(image);
    const croppedBase64 = await cropByRect(
      base64,
      {
        left: 200,
        top: 80,
        width: 100,
        height: 400,
      },
      false,
    );

    expect(croppedBase64).toBeTruthy();

    const info = await imageInfoOfBase64(croppedBase64);
    // biome-ignore lint/style/noUnusedTemplateLiteral: by intention
    expect(info.width).toMatchInlineSnapshot(`100`);
    // biome-ignore lint/style/noUnusedTemplateLiteral: by intention
    expect(info.height).toMatchInlineSnapshot(`400`);

    const tmpFile = join(tmpdir(), 'heytea-cropped-2.jpeg');
    await saveBase64Image({
      base64Data: croppedBase64,
      outputPath: tmpFile,
    });
    console.log('cropped image saved to', tmpFile);
  });

  it('isValidPNGImageBuffer', () => {
    const buffer = readFileSync(getFixture('icon.png'));
    const isValid = isValidPNGImageBuffer(buffer);
    expect(isValid).toBe(true);
  });

  it('isValidPNGImageBuffer, invalid', () => {
    const buffer = readFileSync(getFixture('heytea.jpeg'));
    const isValid = isValidPNGImageBuffer(buffer);
    expect(isValid).toBe(false);
  });

  it('isValidPNGImageBuffer, invalid buffer', () => {
    const isValid = isValidPNGImageBuffer(
      Buffer.from(
        '<Buffer 49 6e 76 61 6c 69 64 20 64 69 73 70 6c 61 79 20 49 44 3a 20 4f 75 74 20 6f 66 20 72 61 6e 67 65 20 5b 30 2c 20 32 5e 36 34 29 2e 0a>',
      ),
    );
    expect(isValid).toBe(false);
  });

  it('httpImg2Base64', async () => {
    expect(
      await httpImg2Base64(
        'https://github.githubassets.com/favicons/favicon.svg',
      ),
    ).toMatchInlineSnapshot(
      `"data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik0xNiAwQzcuMTYgMCAwIDcuMTYgMCAxNkMwIDIzLjA4IDQuNTggMjkuMDYgMTAuOTQgMzEuMThDMTEuNzQgMzEuMzIgMTIuMDQgMzAuODQgMTIuMDQgMzAuNDJDMTIuMDQgMzAuMDQgMTIuMDIgMjguNzggMTIuMDIgMjcuNDRDOCAyOC4xOCA2Ljk2IDI2LjQ2IDYuNjQgMjUuNTZDNi40NiAyNS4xIDUuNjggMjMuNjggNSAyMy4zQzQuNDQgMjMgMy42NCAyMi4yNiA0Ljk4IDIyLjI0QzYuMjQgMjIuMjIgNy4xNCAyMy40IDcuNDQgMjMuODhDOC44OCAyNi4zIDExLjE4IDI1LjYyIDEyLjEgMjUuMkMxMi4yNCAyNC4xNiAxMi42NiAyMy40NiAxMy4xMiAyMy4wNkM5LjU2IDIyLjY2IDUuODQgMjEuMjggNS44NCAxNS4xNkM1Ljg0IDEzLjQyIDYuNDYgMTEuOTggNy40OCAxMC44NkM3LjMyIDEwLjQ2IDYuNzYgOC44MiA3LjY0IDYuNjJDNy42NCA2LjYyIDguOTggNi4yIDEyLjA0IDguMjZDMTMuMzIgNy45IDE0LjY4IDcuNzIgMTYuMDQgNy43MkMxNy40IDcuNzIgMTguNzYgNy45IDIwLjA0IDguMjZDMjMuMSA2LjE4IDI0LjQ0IDYuNjIgMjQuNDQgNi42MkMyNS4zMiA4LjgyIDI0Ljc2IDEwLjQ2IDI0LjYgMTAuODZDMjUuNjIgMTEuOTggMjYuMjQgMTMuNCAyNi4yNCAxNS4xNkMyNi4yNCAyMS4zIDIyLjUgMjIuNjYgMTguOTQgMjMuMDZDMTkuNTIgMjMuNTYgMjAuMDIgMjQuNTIgMjAuMDIgMjYuMDJDMjAuMDIgMjguMTYgMjAgMjkuODggMjAgMzAuNDJDMjAgMzAuODQgMjAuMyAzMS4zNCAyMS4xIDMxLjE4QzI3LjQyIDI5LjA2IDMyIDIzLjA2IDMyIDE2QzMyIDcuMTYgMjQuODQgMCAxNiAwVjBaIiBmaWxsPSIjMjQyOTJFIi8+Cjwvc3ZnPgo="`,
    );
  });

  it('parseBase64', () => {
    const base64 =
      'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
    const { mimeType, body } = parseBase64(base64);
    expect(mimeType).toBe('image/gif');
    expect(body).toBe(
      'R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
    );
  });

  it('parseBase64, invalid', () => {
    const base64 = 'IamNotBase64';
    expect(() => parseBase64(base64)).toThrowError(
      'parseBase64 fail because intput is not a valid base64 string: IamNotBase64',
    );
  });

  it('createImgBase64ByFormat', () => {
    const base64 = createImgBase64ByFormat('png', 'foo');
    expect(base64).toBe('data:image/png;base64,foo');
  });

  // it(
  //   'profile',
  //   async () => {
  //     let count = 100;
  //     console.time('alignCoordByTrim');
  //     while (count--) {
  //       const file = getFixture('long-text.png');
  //       await alignCoordByTrim(file, {
  //         left: 440,
  //         top: 50,
  //         width: 200,
  //         height: 150,
  //       });
  //     }
  //     console.timeEnd('alignCoordByTrim');
  //   },
  //   10 * 1000,
  // );
});

describe('resizeAndConvertImgBuffer', () => {
  const imageBuffer = readFileSync(getFixture('2x2.png'));

  describe('try sharp', () => {
    it('Sharp no-resize will get original format', async () => {
      const { format, buffer } = await resizeAndConvertImgBuffer(
        'png',
        imageBuffer,
        {
          width: 2,
          height: 2,
        },
      );
      expect(format).toBe('png');
    });
    it('Sharp resize will get jpeg format', async () => {
      const { format, buffer } = await resizeAndConvertImgBuffer(
        'png',
        imageBuffer,
        {
          width: 1,
          height: 1,
        },
      );
      expect(format).toBe('jpeg');
    });
  });

  describe('fallback photon', () => {
    const metadataFn = vi.fn(() => {
      throw new Error('sharp is not available');
    });

    beforeAll(() => {
      vi.doMock('sharp', () => ({
        default: () => ({
          metadata: metadataFn,
        }),
      }));
    });

    afterAll(() => {
      vi.resetAllMocks();
    });

    it('fallback photon no-resize will get original format', async () => {
      const { format, buffer } = await resizeAndConvertImgBuffer(
        'png',
        imageBuffer,
        {
          width: 2,
          height: 2,
        },
      );
      expect(metadataFn).toHaveBeenCalledTimes(1);
      expect(format).toBe('png');
    });
    it('fallback photon resize will get jpeg format', async () => {
      const { format, buffer } = await resizeAndConvertImgBuffer(
        'png',
        imageBuffer,
        {
          width: 1,
          height: 1,
        },
      );
      expect(format).toBe('jpeg');
      expect(metadataFn).toHaveBeenCalledTimes(2);
    });
  });
});
