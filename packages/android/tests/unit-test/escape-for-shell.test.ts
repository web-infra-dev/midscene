import { describe, expect, it } from 'vitest';
import { escapeForShell } from '../../src/device';

describe('escapeForShell', () => {
  it('should return empty string for empty input', () => {
    expect(escapeForShell('')).toBe('');
  });

  it('should return plain text unchanged', () => {
    expect(escapeForShell('hello world')).toBe('hello world');
    expect(escapeForShell('abc123')).toBe('abc123');
  });

  it('should escape backslashes', () => {
    expect(escapeForShell('path\\to\\file')).toBe('path\\\\to\\\\file');
    expect(escapeForShell('\\')).toBe('\\\\');
  });

  it('should escape double quotes', () => {
    expect(escapeForShell('say "hello"')).toBe('say \\"hello\\"');
    expect(escapeForShell('"')).toBe('\\"');
  });

  it('should escape backticks', () => {
    expect(escapeForShell('`whoami`')).toBe('\\`whoami\\`');
    expect(escapeForShell('`')).toBe('\\`');
  });

  it('should escape dollar signs', () => {
    expect(escapeForShell('$HOME')).toBe('\\$HOME');
    expect(escapeForShell('${PATH}')).toBe('\\${PATH}');
    expect(escapeForShell('$')).toBe('\\$');
  });

  it('should escape newlines', () => {
    expect(escapeForShell('line1\nline2')).toBe('line1\\nline2');
    expect(escapeForShell('\n')).toBe('\\n');
    expect(escapeForShell('a\nb\nc')).toBe('a\\nb\\nc');
  });

  it('should handle multiple newlines (multiline text)', () => {
    const multiline =
      'm4kMyOGWaENoPj6FqLjd\nfxHXZsqrmnwYjXvte9pg\nf42GOjFWb2aKHogAFQSY';
    const expected =
      'm4kMyOGWaENoPj6FqLjd\\nfxHXZsqrmnwYjXvte9pg\\nf42GOjFWb2aKHogAFQSY';
    expect(escapeForShell(multiline)).toBe(expected);
  });

  it('should escape multiple special characters together', () => {
    expect(escapeForShell('say "hello $USER"\n')).toBe(
      'say \\"hello \\$USER\\"\\n',
    );
    expect(escapeForShell('`echo $HOME`')).toBe('\\`echo \\$HOME\\`');
  });

  it('should handle backslash before other special chars correctly', () => {
    // Backslash should be escaped first, then other chars
    expect(escapeForShell('\\n')).toBe('\\\\n'); // literal \n becomes \\n
    expect(escapeForShell('\\\n')).toBe('\\\\\\n'); // backslash + newline
    expect(escapeForShell('\\"')).toBe('\\\\\\"'); // backslash + quote
  });

  it('should handle unicode text (passthrough)', () => {
    expect(escapeForShell('你好世界')).toBe('你好世界');
    expect(escapeForShell('héllo wörld')).toBe('héllo wörld');
  });

  it('should handle mixed unicode and special chars', () => {
    expect(escapeForShell('你好\n世界')).toBe('你好\\n世界');
    expect(escapeForShell('"中文"')).toBe('\\"中文\\"');
  });
});
