import { findOnlyItemInArgs, orderMattersParse } from '@/args';
import { describe, expect, test } from 'vitest';

describe('args', () => {
  test('should parse arguments', async () => {
    expect(
      findOnlyItemInArgs({ url: 'https://example.com', _: [] }, 'url'),
    ).toBe('https://example.com');
    expect(() => {
      findOnlyItemInArgs(
        { url: 'https://example.com', _: [], query: [1, 2] },
        'query',
      );
    }).toThrowError('Multiple values found for query');
  });

  test('should ignore the node script name', async () => {
    const input = [
      'node',
      '/path/to/bin.js',
      '--url',
      'https://example.com',
      '--action',
      '--sleep',
      '20',
      '--sleep',
      '10',
    ];

    const result = orderMattersParse(input);

    expect(result).toEqual([
      {
        name: 'url',
        value: 'https://example.com',
      },
      {
        name: 'action',
        value: true,
      },
      {
        name: 'sleep',
        value: 20,
      },
      {
        name: 'sleep',
        value: 10,
      },
    ]);
  });
});
