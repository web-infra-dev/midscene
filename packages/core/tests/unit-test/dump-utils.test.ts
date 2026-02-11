import { describe, expect, it } from 'vitest';
import {
  escapeContent,
  generateDumpScriptTag,
  generateImageScriptTag,
  parseDumpScript,
  parseDumpScriptAttributes,
  parseImageScripts,
  restoreImageReferences,
  unescapeContent,
} from '../../src/dump';

describe('dump/html-utils', () => {
  describe('escapeContent and unescapeContent', () => {
    it('should escape and unescape content correctly', () => {
      const original = '<script>alert("test")</script>';
      const escaped = escapeContent(original);
      expect(escaped).not.toContain('<script>');
      expect(unescapeContent(escaped)).toBe(original);
    });

    it('should handle empty string', () => {
      expect(escapeContent('')).toBe('');
      expect(unescapeContent('')).toBe('');
    });
  });

  describe('parseImageScripts', () => {
    it('should parse image scripts from HTML', () => {
      const html = `
        <script type="midscene-image" data-id="img1">data:image/png;base64,abc123</script>
        <script type="midscene-image" data-id="img2">data:image/png;base64,def456</script>
      `;
      const result = parseImageScripts(html);
      expect(result).toEqual({
        img1: 'data:image/png;base64,abc123',
        img2: 'data:image/png;base64,def456',
      });
    });

    it('should return empty object for HTML without image scripts', () => {
      const html = '<div>No images here</div>';
      expect(parseImageScripts(html)).toEqual({});
    });
  });

  describe('parseDumpScript', () => {
    it('should parse dump script content from HTML', () => {
      const json = '{"test": "data"}';
      const html = `<script type="midscene_web_dump">${escapeContent(json)}</script>`;
      expect(parseDumpScript(html)).toBe(json);
    });

    it('should throw error if no dump script found', () => {
      expect(() => parseDumpScript('<div>No dump</div>')).toThrow(
        'No dump script found in HTML',
      );
    });
  });

  describe('parseDumpScriptAttributes', () => {
    it('should parse attributes from dump script', () => {
      const html =
        '<script type="midscene_web_dump" name="test" version="1.0">content</script>';
      const attrs = parseDumpScriptAttributes(html);
      expect(attrs).toEqual({ name: 'test', version: '1.0' });
    });

    it('should return empty object for missing dump script', () => {
      expect(parseDumpScriptAttributes('<div>No dump</div>')).toEqual({});
    });
  });

  describe('generateImageScriptTag', () => {
    it('should generate image script tag', () => {
      const tag = generateImageScriptTag('img1', 'data:image/png;base64,abc');
      expect(tag).toContain('type="midscene-image"');
      expect(tag).toContain('data-id="img1"');
    });
  });

  describe('generateDumpScriptTag', () => {
    it('should generate dump script tag without attributes', () => {
      const tag = generateDumpScriptTag('{"test": "data"}');
      expect(tag).toContain('type="midscene_web_dump"');
    });

    it('should generate dump script tag with attributes', () => {
      const tag = generateDumpScriptTag('{"test": "data"}', { name: 'test' });
      expect(tag).toContain('name="test"');
    });
  });
});

describe('dump/image-restoration', () => {
  const imageMap: Record<string, string> = {
    img1: 'data:image/png;base64,abc123',
    img2: 'data:image/png;base64,def456',
  };

  describe('restoreImageReferences', () => {
    it('should restore screenshot references to { base64 } format', () => {
      const data = {
        screenshot: { $screenshot: 'img1' },
      };
      const result = restoreImageReferences(data, imageMap);
      expect(result).toEqual({
        screenshot: { base64: 'data:image/png;base64,abc123' },
      });
    });

    it('should handle nested objects', () => {
      const data = {
        level1: {
          level2: {
            screenshot: { $screenshot: 'img2' },
          },
        },
      };
      const result = restoreImageReferences(data, imageMap);
      expect(result).toEqual({
        level1: {
          level2: {
            screenshot: { base64: 'data:image/png;base64,def456' },
          },
        },
      });
    });

    it('should handle arrays', () => {
      const data = [{ $screenshot: 'img1' }, { $screenshot: 'img2' }];
      const result = restoreImageReferences(data, imageMap);
      expect(result).toEqual([
        { base64: 'data:image/png;base64,abc123' },
        { base64: 'data:image/png;base64,def456' },
      ]);
    });

    it('should pass through already base64 data', () => {
      const data = {
        screenshot: { $screenshot: 'data:image/png;base64,existing' },
      };
      const result = restoreImageReferences(data, imageMap);
      expect(result).toEqual({
        screenshot: { base64: 'data:image/png;base64,existing' },
      });
    });

    it('should handle file paths', () => {
      const data = {
        screenshot: { $screenshot: './images/test.png' },
      };
      const result = restoreImageReferences(data, imageMap);
      expect(result).toEqual({
        screenshot: { base64: './images/test.png' },
      });
    });

    it('should fallback to directory path when image ID not in imageMap', () => {
      // This is the key behavior for directory mode reports:
      // When $screenshot ID is not found in imageMap, fallback to ./screenshots/{id}.png
      const data = {
        screenshot: { $screenshot: 'uuid-not-in-map' },
      };
      const result = restoreImageReferences(data, imageMap);
      expect(result).toEqual({
        screenshot: { base64: './screenshots/uuid-not-in-map.png' },
      });
    });

    it('should work correctly for directory mode report flow', () => {
      // Directory mode: dump contains { $screenshot: id }, no imageMap entries
      // Browser should fallback to ./screenshots/{id}.png path
      const emptyImageMap: Record<string, string> = {};
      const data = {
        executions: [
          {
            tasks: [
              {
                uiContext: {
                  screenshot: { $screenshot: 'abc-123-def' },
                },
              },
            ],
          },
        ],
      };
      const result = restoreImageReferences(data, emptyImageMap);
      expect(result.executions[0].tasks[0].uiContext.screenshot).toEqual({
        base64: './screenshots/abc-123-def.png',
      });
    });

    it('should preserve { base64: path } with JPEG extension as-is', () => {
      // Directory mode with JPEG: dump contains { base64: "./screenshots/id.jpeg" }
      const data = {
        screenshot: { base64: './screenshots/abc-123.jpeg' },
      };
      const result = restoreImageReferences(data, imageMap);
      expect(result).toEqual({
        screenshot: { base64: './screenshots/abc-123.jpeg' },
      });
    });

    it('should handle primitive values', () => {
      expect(restoreImageReferences('string', imageMap)).toBe('string');
      expect(restoreImageReferences(123, imageMap)).toBe(123);
      expect(restoreImageReferences(null, imageMap)).toBe(null);
    });
  });
});
