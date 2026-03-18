import type { ExtractedFrame } from '@/video/extract-frames';
import { parseSceneTimestamps, segmentFrames } from '@/video/segment-frames';
import { describe, expect, test } from 'vitest';

function makeFrames(count: number): ExtractedFrame[] {
  return Array.from({ length: count }, (_, i) => ({
    base64: `data:image/jpeg;base64,frame${i}`,
    timestamp: i,
  }));
}

describe('parseSceneTimestamps', () => {
  test('parses pts_time values from ffmpeg showinfo output', () => {
    const output = `
[Parsed_showinfo_1 @ 0x1234] n:   0 pts:   5000 pts_time:5.000 fmt:yuv420p
[Parsed_showinfo_1 @ 0x1234] n:   1 pts:  12000 pts_time:12.500 fmt:yuv420p
[Parsed_showinfo_1 @ 0x1234] n:   2 pts:  20000 pts_time:20.000 fmt:yuv420p
`;
    const result = parseSceneTimestamps(output);
    expect(result).toEqual([5.0, 12.5, 20.0]);
  });

  test('returns empty array when no pts_time found', () => {
    expect(parseSceneTimestamps('no scene changes here')).toEqual([]);
    expect(parseSceneTimestamps('')).toEqual([]);
  });

  test('returns sorted timestamps', () => {
    const output =
      'pts_time:20.0 something\npts_time:5.0 other\npts_time:10.0 more';
    const result = parseSceneTimestamps(output);
    expect(result).toEqual([5.0, 10.0, 20.0]);
  });
});

describe('segmentFrames', () => {
  test('returns empty array for empty input', () => {
    const result = segmentFrames([], [], 15);
    expect(result).toEqual([]);
  });

  test('returns single segment when frames fit within max', () => {
    const frames = makeFrames(10);
    const result = segmentFrames(frames, [], 15);
    expect(result).toHaveLength(1);
    expect(result[0].frames).toHaveLength(10);
    expect(result[0].segmentIndex).toBe(0);
  });

  test('splits evenly when no scene changes detected', () => {
    const frames = makeFrames(30);
    const result = segmentFrames(frames, [], 10);
    expect(result.length).toBeGreaterThan(1);
    for (const seg of result) {
      expect(seg.frames.length).toBeLessThanOrEqual(11); // 10 + 1 overlap
    }
  });

  test('splits at scene change boundaries', () => {
    const frames = makeFrames(20);
    const result = segmentFrames(frames, [10], 15);
    expect(result.length).toBe(2);
    expect(result[0].startTimestamp).toBe(0);
    expect(result[1].segmentIndex).toBe(1);
  });

  test('adds 1-frame overlap between segments', () => {
    const frames = makeFrames(20);
    const result = segmentFrames(frames, [10], 15);
    if (result.length >= 2) {
      const lastOfFirst = result[0].frames[result[0].frames.length - 1];
      const firstOfSecond = result[1].frames[0];
      expect(firstOfSecond.timestamp).toBe(lastOfFirst.timestamp);
    }
  });

  test('handles large segments by splitting evenly', () => {
    const frames = makeFrames(50);
    const result = segmentFrames(frames, [25], 10);
    expect(result.length).toBeGreaterThan(2);
    for (const seg of result) {
      expect(seg.frames.length).toBeLessThanOrEqual(14);
    }
  });

  test('segment indices are sequential', () => {
    const frames = makeFrames(40);
    const result = segmentFrames(frames, [10, 20, 30], 15);
    for (let i = 0; i < result.length; i++) {
      expect(result[i].segmentIndex).toBe(i);
    }
  });

  test('timestamps are correct', () => {
    const frames = makeFrames(20);
    const result = segmentFrames(frames, [], 10);
    for (const seg of result) {
      expect(seg.startTimestamp).toBe(seg.frames[0].timestamp);
      expect(seg.endTimestamp).toBe(
        seg.frames[seg.frames.length - 1].timestamp,
      );
    }
  });
});
