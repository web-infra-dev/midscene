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
import { paddingToMatchBlock, saveBase64Image } from 'src/img/transform';
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
    const paddedBase64 = await paddingToMatchBlock(base64);

    const resultInfo = await imageInfoOfBase64(paddedBase64);
    expect(resultInfo.width).toMatchSnapshot();
    expect(resultInfo.height).toMatchSnapshot();

    const tmpFile = join(tmpdir(), 'heytea-padded.jpeg');
    await saveBase64Image({
      base64Data: paddedBase64,
      outputPath: tmpFile,
    });
    console.log('tmpFile', tmpFile);
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
