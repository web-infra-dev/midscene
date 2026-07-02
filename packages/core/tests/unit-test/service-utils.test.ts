import { getDescribeDeepContextAreas, getRectInCrop } from '@/service/utils';
import { describe, expect, it } from 'vitest';

describe('service describe utils', () => {
  it('uses focused context for point targets on tall screenshots', () => {
    const searchAreas = getDescribeDeepContextAreas(
      { left: 185, top: 700, width: 30, height: 30 },
      { width: 400, height: 1200 },
    );

    expect(searchAreas).toEqual([
      {
        kind: 'focused',
        rect: {
          left: 0,
          top: 515,
          width: 400,
          height: 400,
        },
      },
    ]);
  });

  it('uses focused context for point targets on square-ish screenshots', () => {
    const searchAreas = getDescribeDeepContextAreas(
      { left: 435, top: 435, width: 30, height: 30 },
      { width: 960, height: 900 },
    );

    expect(searchAreas).toEqual([
      {
        kind: 'focused',
        rect: {
          left: 250,
          top: 250,
          width: 400,
          height: 400,
        },
      },
    ]);
  });

  it('maps target rectangles into cropped image coordinates', () => {
    expect(
      getRectInCrop(
        { left: 1500, top: 500, width: 56, height: 20 },
        { left: 664, top: 310, width: 1152, height: 400 },
        { width: 1152, height: 400 },
      ),
    ).toEqual({ left: 836, top: 190, width: 56, height: 20 });
  });
});
