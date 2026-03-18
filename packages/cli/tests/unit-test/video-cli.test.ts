import { parseVideo2YamlArgs } from '@/video/cli';
import { describe, expect, test, vi } from 'vitest';

// Mock process.exit to throw instead of exiting
vi.spyOn(process, 'exit').mockImplementation((code) => {
  throw new Error(`process.exit(${code})`);
});

// Suppress console.error/log in tests
vi.spyOn(console, 'error').mockImplementation(() => {});
vi.spyOn(console, 'log').mockImplementation(() => {});

describe('parseVideo2YamlArgs', () => {
  test('parses basic video file argument', () => {
    const result = parseVideo2YamlArgs(['recording.mp4']);
    expect(result.input).toBe('recording.mp4');
    expect(result.format).toBeUndefined();
    expect(result.output).toBeUndefined();
  });

  test('parses all options', () => {
    const result = parseVideo2YamlArgs([
      'video.mp4',
      '-o',
      'output.yaml',
      '-f',
      'playwright',
      '--url',
      'https://example.com',
      '--description',
      'Login flow',
      '--fps',
      '2',
      '--max-frames',
      '30',
      '--viewport-width',
      '1920',
      '--viewport-height',
      '1080',
    ]);

    expect(result.input).toBe('video.mp4');
    expect(result.output).toBe('output.yaml');
    expect(result.format).toBe('playwright');
    expect(result.url).toBe('https://example.com');
    expect(result.description).toBe('Login flow');
    expect(result.fps).toBe(2);
    expect(result.maxFrames).toBe(30);
    expect(result.viewportWidth).toBe(1920);
    expect(result.viewportHeight).toBe(1080);
  });

  test('exits with error when video file is missing', () => {
    expect(() => parseVideo2YamlArgs([])).toThrow('process.exit(1)');
  });

  test('exits with error for invalid format', () => {
    expect(() => parseVideo2YamlArgs(['video.mp4', '-f', 'invalid'])).toThrow(
      'process.exit(1)',
    );
  });

  test('exits with error for unknown option', () => {
    expect(() => parseVideo2YamlArgs(['video.mp4', '--unknown'])).toThrow(
      'process.exit(1)',
    );
  });

  test('exits with error when flag value is missing', () => {
    expect(() => parseVideo2YamlArgs(['video.mp4', '--fps'])).toThrow(
      'process.exit(1)',
    );
  });

  test('exits with error when flag value looks like another flag', () => {
    expect(() =>
      parseVideo2YamlArgs(['video.mp4', '--url', '--fps', '2']),
    ).toThrow('process.exit(1)');
  });

  test('shows help and exits with 0', () => {
    expect(() => parseVideo2YamlArgs(['--help'])).toThrow('process.exit(0)');
    expect(() => parseVideo2YamlArgs(['-h'])).toThrow('process.exit(0)');
  });

  // Numeric validation tests
  test('exits with error for fps <= 0', () => {
    expect(() => parseVideo2YamlArgs(['video.mp4', '--fps', '0'])).toThrow(
      'process.exit(1)',
    );
    expect(() => parseVideo2YamlArgs(['video.mp4', '--fps', '-1'])).toThrow(
      'process.exit(1)',
    );
  });

  test('exits with error for max-frames < 1', () => {
    expect(() =>
      parseVideo2YamlArgs(['video.mp4', '--max-frames', '0']),
    ).toThrow('process.exit(1)');
  });

  test('exits with error for max-frames-per-segment < 1', () => {
    expect(() =>
      parseVideo2YamlArgs(['video.mp4', '--max-frames-per-segment', '0']),
    ).toThrow('process.exit(1)');
  });

  test('exits with error for scene-threshold out of range', () => {
    expect(() =>
      parseVideo2YamlArgs(['video.mp4', '--scene-threshold', '-0.1']),
    ).toThrow('process.exit(1)');
    expect(() =>
      parseVideo2YamlArgs(['video.mp4', '--scene-threshold', '1.5']),
    ).toThrow('process.exit(1)');
  });

  test('exits with error for NaN numeric values', () => {
    expect(() => parseVideo2YamlArgs(['video.mp4', '--fps', 'abc'])).toThrow(
      'process.exit(1)',
    );
  });
});
