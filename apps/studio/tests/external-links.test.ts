import { describe, expect, it } from 'vitest';
import {
  STUDIO_EXTERNAL_LINKS,
  resolveExternalUrl,
} from '../src/shared/external-links';

describe('STUDIO_EXTERNAL_LINKS', () => {
  it('points GitHub and website entries to the official Midscene pages', () => {
    expect(STUDIO_EXTERNAL_LINKS.github).toBe(
      'https://github.com/web-infra-dev/midscene',
    );
    expect(STUDIO_EXTERNAL_LINKS.website).toBe('https://midscenejs.com');
  });
});

describe('resolveExternalUrl', () => {
  it('normalizes supported external URLs', () => {
    expect(resolveExternalUrl(STUDIO_EXTERNAL_LINKS.github)).toBe(
      'https://github.com/web-infra-dev/midscene',
    );
    expect(resolveExternalUrl(STUDIO_EXTERNAL_LINKS.website)).toBe(
      'https://midscenejs.com/',
    );
  });

  it('rejects unsupported protocols', () => {
    expect(() => resolveExternalUrl('file:///tmp/midscene')).toThrow(
      'Unsupported external URL protocol: file:',
    );
  });

  it('rejects malformed URLs', () => {
    expect(() => resolveExternalUrl('not a url')).toThrow(
      'Invalid external URL: not a url',
    );
  });
});
