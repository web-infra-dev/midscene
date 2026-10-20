import { describe, expect, it } from '@rstest/core';
import {
  createTimelineScale,
  formatTimelineTime,
  pickNiceStep,
} from './timeline-scale';

describe('formatTimelineTime', () => {
  it('uses integer milliseconds below two seconds', () => {
    expect(formatTimelineTime(0)).toBe('0 ms');
    expect(formatTimelineTime(50.4)).toBe('50 ms');
    expect(formatTimelineTime(1000)).toBe('1000 ms');
    expect(formatTimelineTime(1500)).toBe('1500 ms');
    expect(formatTimelineTime(1999)).toBe('1999 ms');
  });

  it('uses seconds with at most one decimal from two seconds to one minute', () => {
    expect(formatTimelineTime(2000)).toBe('2 s');
    expect(formatTimelineTime(2100)).toBe('2.1 s');
    expect(formatTimelineTime(32_340)).toBe('32.3 s');
    expect(formatTimelineTime(54_741)).toBe('54.7 s');
    expect(formatTimelineTime(59_949)).toBe('59.9 s');
  });

  it('uses minutes and integer seconds for long timelines', () => {
    expect(formatTimelineTime(60_000)).toBe('1m 0s');
    expect(formatTimelineTime(109_482)).toBe('1m 49s');
    expect(formatTimelineTime(164_223)).toBe('2m 44s');
    expect(formatTimelineTime(300_000)).toBe('5m 0s');
  });

  it('carries rounded values into the next unit', () => {
    expect(formatTimelineTime(1999.6)).toBe('2 s');
    expect(formatTimelineTime(59_950)).toBe('1m 0s');
    expect(formatTimelineTime(119_500)).toBe('2m 0s');
  });

  it('preserves negative offsets without showing negative zero', () => {
    expect(formatTimelineTime(-0.4)).toBe('0 ms');
    expect(formatTimelineTime(-1500)).toBe('-1500 ms');
    expect(formatTimelineTime(-2100)).toBe('-2.1 s');
    expect(formatTimelineTime(-59_950)).toBe('-1m 0s');
  });
});

describe('pickNiceStep', () => {
  it('rounds rough steps up to readable values', () => {
    expect(pickNiceStep(0.2)).toBe(1);
    expect(pickNiceStep(73)).toBe(100);
    expect(pickNiceStep(420)).toBe(500);
    expect(pickNiceStep(1700)).toBe(2000);
    expect(pickNiceStep(12000)).toBe(20000);
    expect(pickNiceStep(173000)).toBe(200000);
    expect(pickNiceStep(610000)).toBe(1000000);
  });

  it('falls back for invalid rough steps', () => {
    expect(pickNiceStep(0)).toBe(1000);
    expect(pickNiceStep(Number.NaN)).toBe(1000);
    expect(pickNiceStep(Number.POSITIVE_INFINITY)).toBe(1000);
  });
});

describe('createTimelineScale', () => {
  it('pads the visible range so the last screenshot stays inside the canvas', () => {
    const scale = createTimelineScale({
      canvasWidth: 1000,
      maxTime: 1_733_653,
      sizeRatio: 2,
    });

    expect(scale.leftForTimeOffset(0)).toBe(0);
    expect(scale.timeStep).toBe(500_000);
    expect(scale.visibleMaxTime).toBe(2_000_000);
    expect(scale.leftForTimeOffset(1_733_653)).toBeLessThan(1000);
    expect(scale.leftForTimeOffset(scale.visibleMaxTime)).toBe(1000);
    expect(scale.timeOffsetForLeft(1000)).toBe(2_000_000);
  });

  it('keeps long narrow timelines on a readable step instead of falling back to 50ms', () => {
    const scale = createTimelineScale({
      canvasWidth: 1000,
      maxTime: 1_733_653,
      sizeRatio: 2,
    });

    expect(scale.timeStep).toBe(500_000);
    expect(scale.visibleMaxTime).toBe(2_000_000);
  });

  it('uses the canvas scale for positions independently from the nice tick step', () => {
    const scale = createTimelineScale({
      canvasWidth: 2000,
      maxTime: 1000,
      sizeRatio: 2,
    });

    expect(scale.timeStep).toBe(100);
    expect(scale.leftForTimeOffset(250)).toBe(500);
    expect(scale.leftForTimeOffset(500)).toBe(1000);
  });

  it('uses size ratio when choosing the readable tick step', () => {
    const lowDensityScale = createTimelineScale({
      canvasWidth: 1000,
      maxTime: 1000,
      sizeRatio: 1,
    });
    const highDensityScale = createTimelineScale({
      canvasWidth: 1000,
      maxTime: 1000,
      sizeRatio: 2,
    });

    expect(lowDensityScale.timeStep).toBe(100);
    expect(highDensityScale.timeStep).toBe(200);
    expect(lowDensityScale.leftForTimeOffset(500)).toBe(500);
    expect(highDensityScale.leftForTimeOffset(500)).toBe(500);
  });
});
