import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  base64Encoded,
  imageInfo,
  imageInfoOfBase64,
  resizeImg,
  resizeImgBase64,
} from '@/img';
import getJimp from '@/img/get-jimp';
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
    expect(info).toMatchSnapshot();
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
