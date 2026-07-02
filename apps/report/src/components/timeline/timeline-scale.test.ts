import { describe, expect, it } from 'vitest';
import {
  createTimelineScale,
  formatTimelineTime,
  pickNiceStep,
} from './timeline-scale';

describe('formatTimelineTime', () => {
  it('uses milliseconds for values below one second', () => {
    expect(formatTimelineTime(50)).toBe('50ms');
    expect(formatTimelineTime(100)).toBe('100ms');
    expect(formatTimelineTime(500)).toBe('500ms');
    expect(formatTimelineTime(999)).toBe('999ms');
  });

  it('uses seconds for values at or above one second', () => {
    expect(formatTimelineTime(1000)).toBe('1s');
    expect(formatTimelineTime(1500)).toBe('1.5s');
    expect(formatTimelineTime(300000)).toBe('300s');
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
