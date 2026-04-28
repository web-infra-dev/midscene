import { parseWebCliOptions } from '@/cli-options';
import { defaultViewportHeight, defaultViewportWidth } from '@/common/viewport';
import { CLIError } from '@midscene/shared/cli';
import { describe, expect, it } from 'vitest';

describe('parseWebCliOptions', () => {
  it('uses Puppeteer mode and default viewport when no global flags are provided', () => {
    const parsed = parseWebCliOptions([
      'connect',
      '--url',
      'https://example.com',
    ]);

    expect(parsed.mode).toBe('puppeteer');
    expect(parsed.argv).toEqual(['connect', '--url', 'https://example.com']);
    expect(parsed.viewport).toEqual({
      width: defaultViewportWidth,
      height: defaultViewportHeight,
    });
  });

  it('parses viewport overrides anywhere in argv for Puppeteer mode', () => {
    const parsed = parseWebCliOptions([
      'connect',
      '--viewport-width',
      '1600',
      '--url',
      'https://example.com',
      '--viewport-height=900',
    ]);

    expect(parsed.mode).toBe('puppeteer');
    expect(parsed.argv).toEqual(['connect', '--url', 'https://example.com']);
    expect(parsed.viewport).toEqual({ width: 1600, height: 900 });
  });

  it('uses env fallback for CDP without consuming the command name', () => {
    const parsed = parseWebCliOptions(
      ['--cdp', 'connect', '--url', 'https://example.com'],
      {
        MIDSCENE_CDP_ENDPOINT: 'ws://127.0.0.1:9222/devtools/browser/demo',
      },
    );

    expect(parsed.mode).toBe('cdp');
    expect(parsed.cdpEndpoint).toBe(
      'ws://127.0.0.1:9222/devtools/browser/demo',
    );
    expect(parsed.argv).toEqual(['connect', '--url', 'https://example.com']);
  });

  it('rejects viewport overrides in bridge mode', () => {
    expect(() =>
      parseWebCliOptions(['--bridge', '--viewport-width', '1600', 'connect']),
    ).toThrowError(
      new CLIError(
        'Viewport options are only supported in the default Puppeteer mode.',
      ),
    );
  });

  it('rejects invalid viewport values', () => {
    expect(() =>
      parseWebCliOptions(['--viewport-height', '0', 'connect']),
    ).toThrowError(
      new CLIError(
        'Invalid value for "--viewport-height": expected a positive integer, got "0".',
      ),
    );
  });
});
