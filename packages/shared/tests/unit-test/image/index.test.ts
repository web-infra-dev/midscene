import { base64Encoded, imageInfo, imageInfoOfBase64 } from '@/img';
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
    expect(info).toMatchSnapshot();
  });

  it('jpeg + base64 + imageInfo', async () => {
    const image = getFixture('heytea.jpeg');
    const base64 = base64Encoded(image);
    const info = await imageInfoOfBase64(base64);
    expect(info).toMatchSnapshot();
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

// it('align a sub-image', async () => {
//   const file = getFixture('long-text.png');
//   const rect = await alignCoordByTrim(file, {
//     left: 140,
//     top: 50,
//     width: 200,
//     height: 80,
//   });
//   expect(rect).toMatchSnapshot();
// });

// it('align a tiny sub-image', async () => {
//   const file = getFixture('2x2.jpeg');
//   const rect = await alignCoordByTrim(file, {
//     left: 140,
//     top: 50,
//     width: 200,
//     height: 80,
//   });
//   expect(rect).toMatchSnapshot();
// });

// it('align a table style sub-image', async () => {
//   const file = getFixture('table.png');
//   const rect = await alignCoordByTrim(file, {
//     left: 140,
//     top: 50,
//     width: 200,
//     height: 80,
//   });
//   expect(rect).toMatchSnapshot();
// });

// it('illegal center rect, refuse to align', async () => {
//   const file = getFixture('long-text.png'); // 2862x250
//   const rect = await alignCoordByTrim(file, {
//     left: 3000,
//     top: 3000,
//     width: 200,
//     height: 200,
//   });
//   expect(rect).toMatchSnapshot();
// });

// it('align a sub-image with negative coord', async () => {
//   const file = getFixture('long-text.png'); // 2862x250
//   const rect = await alignCoordByTrim(file, {
//     left: -100,
//     top: -100,
//     width: 200,
//     height: 200,
//   });
//   expect(rect).toMatchSnapshot();
// });

// it('align an oversized sub-image', async () => {
//   const file = getFixture('long-text.png'); // 2862x250
//   const rect = await alignCoordByTrim(file, {
//     left: 2860,
//     top: 200,
//     width: 200,
//     height: 200,
//   });
//   expect(rect).toMatchSnapshot();
// });
