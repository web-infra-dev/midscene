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

  it('should extract last occurrence when multiple tags exist', () => {
    // Changed behavior: now extracts LAST occurrence to handle models
    // that prepend thinking content before actual response
    const xml = '<item>First</item><item>Second</item>';
    const result = extractXMLTag(xml, 'item');
    expect(result).toBe('Second');
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

  // Tests for think-prefix scenarios (models prepending thinking content)
  describe('think-prefix handling', () => {
    it('should extract content after </think> tag when model prepends thinking', () => {
      const xml = `"Okay, let's see. The user's instruction is to hover over the left menu..."</think>
<thought>The user's instruction is to hover over the left menu. In the screenshot, the left menu is the vertical navigation bar.</thought>
<log>Hovering over the left menu bar</log>
<action-type>Hover</action-type>`;
      const thought = extractXMLTag(xml, 'thought');
      expect(thought).toBe(
        "The user's instruction is to hover over the left menu. In the screenshot, the left menu is the vertical navigation bar.",
      );
    });

    it('should handle <think>...</think> prefix followed by actual content', () => {
      const xml = `<think>Let me analyze this step by step...
The user wants to click a button.
I should identify the button first.</think>
<thought>User wants to click the submit button</thought>
<action-type>Tap</action-type>
<action-param-json>{"locate": {"prompt": "submit button"}}</action-param-json>`;
      const thought = extractXMLTag(xml, 'thought');
      const actionType = extractXMLTag(xml, 'action-type');
      const actionParam = extractXMLTag(xml, 'action-param-json');
      expect(thought).toBe('User wants to click the submit button');
      expect(actionType).toBe('Tap');
      expect(actionParam).toBe('{"locate": {"prompt": "submit button"}}');
    });

    it('should extract last occurrence when same tag appears in think and response', () => {
      // Some models might output <thought> in their thinking section too
      const xml = `<think><thought>Internal reasoning...</thought></think>
<thought>Actual response thought</thought>
<action-type>Click</action-type>`;
      const thought = extractXMLTag(xml, 'thought');
      expect(thought).toBe('Actual response thought');
    });

    it('should handle real-world bad case with mixed think/content', () => {
      // Real bad case from the issue
      const xml = `"Okay, let's see. The user's instruction is to \\"仅执行 鼠标悬停在左侧菜单\\" which translates to \\"Only perform mouse hover over the left menu.\\" So I need to figure out where the left menu is on this screenshot.\\n\\nLooking at the image, there's a vertical sidebar on the left side of the screen. It has some icons, maybe a menu. The leftmost part of the screen shows a vertical strip with icons.</think>\\n<thought>The user's instruction is to hover over the left menu.</thought>\\n<log>Hovering over the left menu bar</log>
<action-type>Hover</action-type>
<action-param-json>{\\n  \\"locate\\": {\\n    \\"prompt\\": \\"Left vertical navigation menu bar\\",\\n  \\"bbox\\": [0, 0, 50, 999]\\n  }\\n}</action-param-json>`;
      const thought = extractXMLTag(xml, 'thought');
      const actionType = extractXMLTag(xml, 'action-type');
      expect(thought).toBe(
        "The user's instruction is to hover over the left menu.",
      );
      expect(actionType).toBe('Hover');
    });

    it('should handle multiple think blocks before actual content', () => {
      const xml = `<think>First thinking block</think>
<think>Second thinking block with more analysis</think>
<thought>The actual thought for the response</thought>
<log>Performing action</log>
<action-type>Scroll</action-type>`;
      const thought = extractXMLTag(xml, 'thought');
      const log = extractXMLTag(xml, 'log');
      expect(thought).toBe('The actual thought for the response');
      expect(log).toBe('Performing action');
    });

    it('should handle unclosed think tag at the start', () => {
      const xml = `Some raw thinking without proper tags...</think>
<thought>Clean thought content</thought>
<action-type>Tap</action-type>`;
      const thought = extractXMLTag(xml, 'thought');
      expect(thought).toBe('Clean thought content');
    });

    it('should handle incomplete tag followed by complete tag', () => {
      // Case: ...<action-type>..incomplete...<action-type>Hover</action-type>
      // Should extract "Hover" from the last complete tag pair
      const xml =
        '...<action-type>..some incomplete content...<action-type>Hover</action-type>';
      const result = extractXMLTag(xml, 'action-type');
      expect(result).toBe('Hover');
    });

    it('should handle partial tag inside think block then complete tag', () => {
      // Model might output partial tags inside thinking, then complete tags after
      const xml = `<think>analyzing...<action-type>partial</think>
<thought>User wants to hover</thought>
<action-type>Hover</action-type>`;
      const actionType = extractXMLTag(xml, 'action-type');
      expect(actionType).toBe('Hover');
    });

    it('should extract content from half-open tag when closing tag is missing', () => {
      const xml = `<thought>Need to input value</thought>
<log>Typing in field</log>
<action-type>Input
<action-param-json>{"value":"1000"}</action-param-json>`;
      const actionType = extractXMLTag(xml, 'action-type');
      expect(actionType).toBe('Input');
    });

    it('should return empty string when half-open tag has empty content', () => {
      const xml = `<action-type>   
<log>next</log>`;
      const actionType = extractXMLTag(xml, 'action-type');
      expect(actionType).toBe('');
    });

    it('should handle data-json extraction with think prefix', () => {
      const xml = `<think>Analyzing the page to extract user data...</think>
<thought>I can see user information in the profile section</thought>
<data-json>{"name": "John", "age": 30}</data-json>`;
      const dataJson = extractXMLTag(xml, 'data-json');
      expect(dataJson).toBe('{"name": "John", "age": 30}');
    });

    it('should handle complete extraction with think prefix', () => {
      const xml = `<think>The task has been completed successfully</think>
<thought>Task completed</thought>
<complete success="true">Successfully hovered over the left menu</complete>`;
      const thought = extractXMLTag(xml, 'thought');
      expect(thought).toBe('Task completed');
      // Note: complete has attributes, so extractXMLTag won't match it directly
      // This is handled separately in parseXMLPlanningResponse
    });
  });
});
