import { buildYaml } from '@/yaml';
import { describe, expect, test } from 'vitest';

describe('utils', () => {
  test('build yaml', () => {
    const yaml = buildYaml({ url: 'https://www.baidu.com' }, []);
    expect(yaml).toMatchSnapshot();
  });
});
