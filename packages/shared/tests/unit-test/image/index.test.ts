import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  base64Encoded,
  imageInfo,
  imageInfoOfBase64,
  isValidPNGImageBuffer,
  resizeImg,
  resizeImgBase64,
} from 'src/img';
import getJimp from 'src/img/get-jimp';
import {
  cropByRect,
  jimpFromBase64,
  jimpToBase64,
  paddingToMatchBlock,
  saveBase64Image,
} from 'src/img/transform';
import { getFixture } from 'tests/utils';
import { describe, expect, it } from 'vitest';

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

  it('base64Encoded', () => {
    const base64 = base64Encoded(image);
    expect(base64).toMatchSnapshot();

    const headlessBase64 = base64Encoded(image, false);
    expect(headlessBase64).toMatchSnapshot();
  });

  it('base64 + imageInfo', async () => {
    const image = getFixture('icon.png');
    const base64 = base64Encoded(image);
    const info = await imageInfoOfBase64(base64);
    expect(info.width).toMatchSnapshot();
    expect(info.height).toMatchSnapshot();
  });

  it('jpeg + base64 + imageInfo', async () => {
    const image = getFixture('heytea.jpeg');
    const base64 = base64Encoded(image);
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

    const base64 = base64Encoded(image);
    const resizedBase64 = await resizeImgBase64(base64, {
      width: 100,
      height: 100,
    });
    expect(resizedBase64).toContain(';base64,');
  });

  it('resize image', async () => {
    const image = getFixture('heytea.jpeg');
    const buffer = await resizeImg(readFileSync(image), {
      width: 100,
      height: 100,
    });
    expect(buffer).toBeDefined();
  });

  it('paddingToMatchBlock', async () => {
    const image = getFixture('heytea.jpeg');
    const base64 = base64Encoded(image);
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
    const base64 = base64Encoded(image);
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
    const base64 = base64Encoded(image);
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
