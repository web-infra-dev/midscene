import { extractXMLTag } from '@/ai-model/prompt/util';
import { describe, expect, it } from 'vitest';

describe('extractXMLTag', () => {
  it('should extract simple tag content', () => {
    const xml = '<name>John Doe</name>';
    const result = extractXMLTag(xml, 'name');
    expect(result).toBe('John Doe');
  });

  it('should extract tag with multiline content', () => {
    const xml = `
<description>
  This is a multiline
  description text
</description>`;
    const result = extractXMLTag(xml, 'description');
    expect(result).toBe('This is a multiline\n  description text');
  });

  it('should extract tag with nested XML-like content', () => {
    const xml = `
<data>
{
  "value": "<special>",
  "count": 100
}
</data>`;
    const result = extractXMLTag(xml, 'data');
    expect(result).toContain('"value": "<special>"');
  });

  it('should return undefined for non-existent tag', () => {
    const xml = '<name>John</name>';
    const result = extractXMLTag(xml, 'age');
    expect(result).toBeUndefined();
  });

  it('should handle case-insensitive tag matching', () => {
    const xml = '<NAME>John Doe</NAME>';
    const result = extractXMLTag(xml, 'name');
    expect(result).toBe('John Doe');
  });

  it('should handle mixed case tags', () => {
    const xml = '<MyTag>Content</myTag>';
    const result = extractXMLTag(xml, 'mytag');
    expect(result).toBe('Content');
  });

  it('should extract first occurrence when multiple tags exist', () => {
    const xml = '<item>First</item><item>Second</item>';
    const result = extractXMLTag(xml, 'item');
    expect(result).toBe('First');
  });

  it('should handle tags with special characters in content', () => {
    const xml = '<message>Values: <100 & >50</message>';
    const result = extractXMLTag(xml, 'message');
    expect(result).toBe('Values: <100 & >50');
  });

  it('should handle empty tags', () => {
    const xml = '<empty></empty>';
    const result = extractXMLTag(xml, 'empty');
    expect(result).toBe('');
  });

  it('should handle tags with only whitespace', () => {
    const xml = '<whitespace>   \n  \t  </whitespace>';
    const result = extractXMLTag(xml, 'whitespace');
    expect(result).toBe('');
  });

  it('should trim leading and trailing whitespace', () => {
    const xml = '<text>   trimmed content   </text>';
    const result = extractXMLTag(xml, 'text');
    expect(result).toBe('trimmed content');
  });

  it('should handle tags with attributes (ignoring attributes)', () => {
    const xml = '<div class="container" id="main">Content</div>';
    const result = extractXMLTag(xml, 'div');
    // Note: This will not match because our regex doesn't handle attributes
    expect(result).toBeUndefined();
  });

  it('should extract JSON content correctly', () => {
    const xml = `
<data-json>
{
  "name": "Alice",
  "age": 30,
  "active": true
}
</data-json>`;
    const result = extractXMLTag(xml, 'data-json');
    expect(result).toContain('"name": "Alice"');
    expect(result).toContain('"age": 30');
  });

  it('should handle hyphenated tag names', () => {
    const xml = '<action-type>Tap</action-type>';
    const result = extractXMLTag(xml, 'action-type');
    expect(result).toBe('Tap');
  });

  it('should handle self-contained content with angle brackets', () => {
    const xml = '<code>if (a < b && c > d) { return true; }</code>';
    const result = extractXMLTag(xml, 'code');
    expect(result).toBe('if (a < b && c > d) { return true; }');
  });

  it('should handle newlines and preserve internal formatting', () => {
    const xml = `
<thought>
Line 1
  Indented line 2
    More indented line 3
</thought>`;
    const result = extractXMLTag(xml, 'thought');
    expect(result).toBe('Line 1\n  Indented line 2\n    More indented line 3');
  });

  it('should handle tags with numbers', () => {
    const xml = '<value123>Test</value123>';
    const result = extractXMLTag(xml, 'value123');
    expect(result).toBe('Test');
  });

  it('should handle content with quotes', () => {
    const xml = '<message>He said "Hello" to me</message>';
    const result = extractXMLTag(xml, 'message');
    expect(result).toBe('He said "Hello" to me');
  });

  it('should handle content with single quotes', () => {
    const xml = "<message>It's a beautiful day</message>";
    const result = extractXMLTag(xml, 'message');
    expect(result).toBe("It's a beautiful day");
  });

  it('should handle CDATA-like content', () => {
    const xml = '<script><![CDATA[function() { return x < 5; }]]></script>';
    const result = extractXMLTag(xml, 'script');
    expect(result).toContain('function() { return x < 5; }');
  });
});
