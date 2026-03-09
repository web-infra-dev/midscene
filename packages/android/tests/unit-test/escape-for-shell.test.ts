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

  it('should not escape backslashes (literal in single quotes)', () => {
    expect(escapeForShell('path\\to\\file')).toBe('path\\to\\file');
    expect(escapeForShell('\\')).toBe('\\');
  });

  it('should not escape double quotes (literal in single quotes)', () => {
    expect(escapeForShell('say "hello"')).toBe('say "hello"');
    expect(escapeForShell('"')).toBe('"');
  });

  it('should not escape backticks (literal in single quotes)', () => {
    expect(escapeForShell('`whoami`')).toBe('`whoami`');
    expect(escapeForShell('`')).toBe('`');
  });

  it('should not escape dollar signs (literal in single quotes)', () => {
    expect(escapeForShell('$HOME')).toBe('$HOME');
    expect(escapeForShell('${PATH}')).toBe('${PATH}');
    expect(escapeForShell('$')).toBe('$');
  });

  it('should escape single quotes', () => {
    expect(escapeForShell("it's")).toBe("it'\\''s");
    expect(escapeForShell("'")).toBe("'\\''");
    expect(escapeForShell("a'b'c")).toBe("a'\\''b'\\''c");
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

  it('should only escape single quotes and newlines in combined text', () => {
    expect(escapeForShell('say "hello $USER"\n')).toBe('say "hello $USER"\\n');
    expect(escapeForShell('`echo $HOME`')).toBe('`echo $HOME`');
  });

  it('should handle backslash before newline correctly', () => {
    // Literal backslash + n (two chars \\n in source) → unchanged (no 0x0A)
    expect(escapeForShell('\\n')).toBe('\\n');
    // Backslash + real newline (0x0A) → backslash + literal \n
    expect(escapeForShell('\\\n')).toBe('\\\\n');
  });

  it('should handle unicode text (passthrough)', () => {
    expect(escapeForShell('你好世界')).toBe('你好世界');
    expect(escapeForShell('héllo wörld')).toBe('héllo wörld');
  });

  it('should handle mixed unicode and special chars', () => {
    expect(escapeForShell('你好\n世界')).toBe('你好\\n世界');
    expect(escapeForShell('"中文"')).toBe('"中文"');
  });
});
