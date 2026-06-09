import {
  parseReportVideoArgResult,
  parseReportVideoArgs,
} from '@/report-video-args';
import { dumpJsonReferencesFileStoredScreenshots } from '@/report-video-dump';
import { ffmpegArgs } from '@/report-video-ffmpeg';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('report-video arg parsing', () => {
  test('parses required input and defaults', () => {
    const opts = parseReportVideoArgs(['--input', 'report.html']);
    expect(opts).toEqual({
      input: 'report.html',
      autoZoom: true,
      encoder: 'ffmpeg',
      format: 'webm',
      frameFormat: 'jpeg',
      concurrency: 4,
      scale: 1,
    });
  });

  test('parses short flags and output/name/index', () => {
    const opts = parseReportVideoArgs([
      '-i',
      './r/index.html',
      '-o',
      './out',
      '--name',
      'clip',
      '--index',
      '2',
    ]);
    expect(opts).toMatchObject({
      input: './r/index.html',
      output: './out',
      name: 'clip',
      index: 2,
      autoZoom: true,
      encoder: 'ffmpeg',
      format: 'webm',
      frameFormat: 'jpeg',
      concurrency: 4,
      scale: 1,
    });
  });

  test('supports --key=value style', () => {
    const opts = parseReportVideoArgs([
      '--input=dump.json',
      '--output=/tmp/v',
      '--name=foo',
    ]);
    expect(opts).toMatchObject({
      input: 'dump.json',
      output: '/tmp/v',
      name: 'foo',
    });
  });

  test('--no-auto-zoom disables auto zoom', () => {
    const opts = parseReportVideoArgs(['-i', 'r.html', '--no-auto-zoom']);
    expect(opts?.autoZoom).toBe(false);
  });

  test('returns null for --help', () => {
    expect(parseReportVideoArgs(['--help'])).toBeNull();
  });

  test('distinguishes help from argument errors', () => {
    expect(parseReportVideoArgResult(['--help'])).toEqual({
      type: 'help',
      exitCode: 0,
    });
    expect(parseReportVideoArgResult(['--name', 'x'])).toEqual({
      type: 'error',
      exitCode: 1,
    });
  });

  test('returns null when input is missing', () => {
    expect(parseReportVideoArgs(['--name', 'x'])).toBeNull();
  });

  test('returns null for a non-integer --index', () => {
    expect(parseReportVideoArgs(['-i', 'r.html', '--index', 'abc'])).toBeNull();
  });

  test('returns null for a negative --index', () => {
    expect(parseReportVideoArgs(['-i', 'r.html', '--index=-1'])).toBeNull();
  });

  test('parses ffmpeg mp4 output', () => {
    const opts = parseReportVideoArgs([
      '-i',
      'r.html',
      '--format',
      'mp4',
      '--encoder',
      'ffmpeg',
      '--fps',
      '15',
      '--frame-format',
      'png',
      '--concurrency',
      '2',
      '--scale',
      '2',
    ]);
    expect(opts).toMatchObject({
      encoder: 'ffmpeg',
      format: 'mp4',
      fps: 15,
      frameFormat: 'png',
      concurrency: 2,
      scale: 2,
    });
  });

  test('rejects mp4 with media-recorder', () => {
    expect(
      parseReportVideoArgs([
        '-i',
        'r.html',
        '--encoder',
        'media-recorder',
        '--format',
        'mp4',
      ]),
    ).toBeNull();
  });

  test('returns an error result for invalid choice values', () => {
    expect(
      parseReportVideoArgResult(['-i', 'r.html', '--encoder', 'bad']),
    ).toEqual({
      type: 'error',
      exitCode: 1,
    });
  });

  test('rejects invalid fps', () => {
    expect(parseReportVideoArgs(['-i', 'r.html', '--fps', '0'])).toBeNull();
    expect(parseReportVideoArgs(['-i', 'r.html', '--fps', '10.5'])).toBeNull();
    expect(parseReportVideoArgs(['-i', 'r.html', '--fps', '61'])).toBeNull();
  });

  test('rejects fps with media-recorder', () => {
    expect(
      parseReportVideoArgs([
        '-i',
        'r.html',
        '--encoder',
        'media-recorder',
        '--fps',
        '15',
      ]),
    ).toBeNull();
  });

  test('rejects frame format with media-recorder', () => {
    expect(
      parseReportVideoArgs([
        '-i',
        'r.html',
        '--encoder',
        'media-recorder',
        '--frame-format',
        'png',
      ]),
    ).toBeNull();
  });

  test('rejects invalid concurrency', () => {
    expect(
      parseReportVideoArgs(['-i', 'r.html', '--concurrency', '0']),
    ).toBeNull();
    expect(
      parseReportVideoArgs(['-i', 'r.html', '--concurrency', '1.5']),
    ).toBeNull();
    expect(
      parseReportVideoArgs(['-i', 'r.html', '--concurrency', '9']),
    ).toBeNull();
  });

  test('rejects invalid scale', () => {
    expect(parseReportVideoArgs(['-i', 'r.html', '--scale', '0'])).toBeNull();
    expect(parseReportVideoArgs(['-i', 'r.html', '--scale', '1.5'])).toBeNull();
    expect(parseReportVideoArgs(['-i', 'r.html', '--scale', '5'])).toBeNull();
  });

  test('rejects scale with media-recorder', () => {
    expect(
      parseReportVideoArgs([
        '-i',
        'r.html',
        '--encoder',
        'media-recorder',
        '--scale',
        '2',
      ]),
    ).toBeNull();
  });

  test('detects file-stored screenshots in pretty dump json', () => {
    expect(
      dumpJsonReferencesFileStoredScreenshots(
        JSON.stringify(
          {
            executions: [
              {
                tasks: [
                  {
                    screenshot: {
                      id: 'screen-1',
                      storage: 'file',
                      path: './screenshots/screen-1.jpeg',
                    },
                  },
                ],
              },
            ],
          },
          null,
          2,
        ),
      ),
    ).toBe(true);
    expect(
      dumpJsonReferencesFileStoredScreenshots(
        JSON.stringify({ executions: [{ tasks: [{ screenshot: 'inline' }] }] }),
      ),
    ).toBe(false);
  });

  test('scales webm bitrate with output pixel area', () => {
    const args = ffmpegArgs(
      15,
      'webm',
      '/tmp/frame-%06d.jpg',
      '/tmp/out.webm',
      2,
    );
    expect(args).toContain('-b:v');
    expect(args[args.indexOf('-b:v') + 1]).toBe('8M');
  });
});
