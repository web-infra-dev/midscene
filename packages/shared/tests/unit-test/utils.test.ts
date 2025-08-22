import { describe, expect, it } from 'vitest';
import { replaceIllegalPathCharsAndSpace } from '../../src/utils';

describe('replaceIllegalPathCharsAndSpace', () => {
  it('should preserve Unix path separators', () => {
    const input = '/path/to/file.txt';
    const result = replaceIllegalPathCharsAndSpace(input);
    expect(result).toBe('/path/to/file.txt');
  });

  it('should preserve Windows backslash separators but replace colon', () => {
    const input = 'C:\\Users\\Documents\\file.txt';
    const result = replaceIllegalPathCharsAndSpace(input);
    expect(result).toBe('C-\\Users\\Documents\\file.txt');
  });

  it('should replace illegal filename characters with dashes', () => {
    const input = 'file:name*with?illegal"chars<>|.txt';
    const result = replaceIllegalPathCharsAndSpace(input);
    expect(result).toBe('file-name-with-illegal-chars---.txt');
  });

  it('should replace spaces with dashes', () => {
    const input = 'file name with spaces.txt';
    const result = replaceIllegalPathCharsAndSpace(input);
    expect(result).toBe('file-name-with-spaces.txt');
  });

  it('should handle mixed path and illegal characters', () => {
    const input = '/path/to/file:with*illegal?chars<>|.txt';
    const result = replaceIllegalPathCharsAndSpace(input);
    expect(result).toBe('/path/to/file-with-illegal-chars---.txt');
  });

  it('should handle Windows path with illegal characters', () => {
    const input = 'C:\\Users\\Documents\\file:name*with?illegal"chars<>|.txt';
    const result = replaceIllegalPathCharsAndSpace(input);
    expect(result).toBe(
      'C-\\Users\\Documents\\file-name-with-illegal-chars---.txt',
    );
  });

  it('should handle empty string', () => {
    const input = '';
    const result = replaceIllegalPathCharsAndSpace(input);
    expect(result).toBe('');
  });

  it('should handle string with only illegal characters', () => {
    const input = ':*?"<>| ';
    const result = replaceIllegalPathCharsAndSpace(input);
    expect(result).toBe('--------');
  });

  it('should handle string with only path separators', () => {
    const input = '/\\//\\';
    const result = replaceIllegalPathCharsAndSpace(input);
    expect(result).toBe('/\\//\\');
  });

  it('should handle complex real-world scenario', () => {
    const input =
      '/Users/test/Documents/My Project: "Important File" <2024>|backup*.txt';
    const result = replaceIllegalPathCharsAndSpace(input);
    expect(result).toBe(
      '/Users/test/Documents/My-Project---Important-File---2024--backup-.txt',
    );
  });

  it('should handle task title with illegal characters', () => {
    const input = 'Task: "Test File" <Important>|Special*';
    const result = replaceIllegalPathCharsAndSpace(input);
    expect(result).toBe('Task---Test-File---Important--Special-');
  });

  it('should handle cache ID with mixed characters', () => {
    const input = 'cache-id:with*special?chars"and<spaces>|';
    const result = replaceIllegalPathCharsAndSpace(input);
    expect(result).toBe('cache-id-with-special-chars-and-spaces--');
  });
});
