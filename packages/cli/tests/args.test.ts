import { findOnlyItemInArgs, parse } from '@/args';
import { describe, expect, test } from 'vitest';

describe('args', () => {
  test('should parse arguments', async () => {
    const input = [
      '--url',
      'https://example.com',
      '--width',
      '500',
      '--action',
      'click',
      '--assert',
      'this is an assertion',
      '--query-output',
      'output.json',
      '--query',
      'title',
      '--query',
      'content',
      '--prefer-cache',
    ];

    const result = parse(input);

    expect(result).toMatchSnapshot();

    expect(findOnlyItemInArgs(result, 'url')).toBe('https://example.com');
    expect(findOnlyItemInArgs(result, 'prefer-cache')).toBe(true);
    expect(() => {
      findOnlyItemInArgs(result, 'query');
    }).toThrowError('Multiple values found for query');
  });

  test('should ignore the node script name', async () => {
    const input = [
      'node',
      '/path/to/bin.js',
      '--url',
      'https://example.com',
      '--action',
    ];

    const result = parse(input);

    expect(result).toEqual([
      {
        name: 'url',
        value: 'https://example.com',
      },
      {
        name: 'action',
        value: true,
      },
    ]);
  });
});
