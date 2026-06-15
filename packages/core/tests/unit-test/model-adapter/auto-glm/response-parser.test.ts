import {
  extractValueAfter,
  parseAutoGLMResponse,
} from '@/ai-model/models/auto-glm/parser';
import { describe, expect, it } from 'vitest';

describe('auto-glm response parser', () => {
  describe('extractValueAfter', () => {
    it('should extract value after key', () => {
      const result = extractValueAfter('text="Hello"', 'text="');
      expect(result).toBe('Hello"');
    });

    it('should handle value ending with quote and parenthesis', () => {
      const result = extractValueAfter('message="Task done")end', 'message="');
      expect(result).toBe('Task done")end');
    });

    it('should trim whitespace', () => {
      const result = extractValueAfter('  value="test"  ', 'value="');
      expect(result).toBe('test"');
    });

    it('should handle escaped quotes in value', () => {
      const result = extractValueAfter(
        'message="Finished! Now There is a contact whose name is "Tom" in the list.")',
        'message="',
      );
      expect(result).toBe(
        'Finished! Now There is a contact whose name is "Tom" in the list.',
      );
    });

    it('should throw error when key is not found', () => {
      expect(() => {
        extractValueAfter('some content', 'notfound="');
      }).toThrow('Missing key notfound="');
    });

    it('should handle app name extraction', () => {
      const result = extractValueAfter(
        'do(action="Launch", app="Camera")',
        'app="',
      );
      expect(result).toBe('Camera');
    });

    it('should handle instruction extraction', () => {
      const result = extractValueAfter(
        'instruction="call some API")',
        'instruction="',
      );
      expect(result).toBe('call some API');
    });
  });

  describe('parseAutoGLMResponse', () => {
    it('should parse response with think and do action', () => {
      const response = 'I see a button. do(action="Tap", element=[100,200])';
      const result = parseAutoGLMResponse(response);
      expect(result.think).toBe('I see a button.');
      expect(result.content).toBe('do(action="Tap", element=[100,200])');
    });

    it('should parse response with think and finish action', () => {
      const response = 'Task completed. finish(message="Done successfully")';
      const result = parseAutoGLMResponse(response);
      expect(result.think).toBe('Task completed.');
      expect(result.content).toContain('finish(message="Done successfully")');
    });

    it('should parse response with answer tags', () => {
      const response =
        '<think>Click the button</think>\n<answer>foo(action="Tap", element=[50,100])</answer>';
      const result = parseAutoGLMResponse(response);
      expect(result.think).toBe('Click the button');
      expect(result.content).toBe('foo(action="Tap", element=[50,100])');
    });

    it('should return plain content when no Auto-GLM action marker exists', () => {
      const response = 'No actionable content yet';
      const result = parseAutoGLMResponse(response);
      expect(result).toEqual({
        think: '',
        content: 'No actionable content yet',
      });
    });
  });
});
