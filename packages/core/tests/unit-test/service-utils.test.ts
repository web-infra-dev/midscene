import {
  expandDescribeDeepSearchArea,
  getDescribeDeepContextAreas,
  getRectInCrop,
} from '@/service/utils';
import { describe, expect, it } from 'vitest';

describe('service describe utils', () => {
  it('keeps wide row context for point targets on 800px screenshots', () => {
    const searchArea = expandDescribeDeepSearchArea(
      { left: 148, top: 310, width: 30, height: 30 },
      { width: 800, height: 417 },
      { keepWideContext: true },
    );

    expect(searchArea).toEqual({
      left: 0,
      top: 17,
      width: 800,
      height: 400,
    });
  });

  it('keeps vertical column context for point targets on tall screenshots', () => {
    const searchAreas = getDescribeDeepContextAreas(
      { left: 185, top: 700, width: 30, height: 30 },
      { width: 400, height: 1200 },
      { targetFromPoint: true },
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
      {
        kind: 'axis',
        axisMode: 'vertical',
        rect: {
          left: 0,
          top: 265,
          width: 400,
          height: 900,
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
