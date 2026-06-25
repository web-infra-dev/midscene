import { expandDescribeDeepSearchArea } from '@/service/utils';
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
});
