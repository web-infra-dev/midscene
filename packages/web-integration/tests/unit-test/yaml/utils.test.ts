import { buildYaml, flowItemBrief } from '@/yaml';
import { describe, expect, test } from 'vitest';

describe('utils', () => {
  test('build yaml', () => {
    const yaml = buildYaml({ url: 'https://www.baidu.com' }, []);
    expect(yaml).toMatchSnapshot();
  });

  test('action brief text', () => {
    expect(flowItemBrief({ ai: 'search for weather' })).toMatchSnapshot();
    expect(flowItemBrief({ sleep: 1000 })).toMatchSnapshot();
    expect(
      flowItemBrief({ aiWaitFor: 'wait for something' }),
    ).toMatchSnapshot();
  });
});
