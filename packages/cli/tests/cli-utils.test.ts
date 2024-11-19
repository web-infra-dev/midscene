import { matchYamlFiles, parseArgsIntoYamlScript } from '@/cli-utils';
import { describe, expect, test } from 'vitest';

describe('cli utils', () => {
  test('match exact file', async () => {
    const files = await matchYamlFiles('./tests/midscene_scripts/foo.yml');
    expect(files).toMatchSnapshot();
  });

  let files: string[];
  test('match folder', async () => {
    files = await matchYamlFiles('./tests/midscene_scripts/');
    expect(files).toMatchSnapshot();
  });

  test('match folder 2', async () => {
    const files2 = await matchYamlFiles('./tests/midscene_scripts');
    expect(files2).toEqual(files);
  });

  test('match folder with star', async () => {
    const files2 = await matchYamlFiles('./tests/midscene_scripts/**');
    expect(files2).toEqual(files);
  });

  test('match files', async () => {
    const files3 = await matchYamlFiles('./tests/midscene_scripts/**/*.yml');
    expect(files3).toMatchSnapshot();
  });
});

describe('cli parse args', () => {
  test('basic', async () => {
    const script = await parseArgsIntoYamlScript([
      'node',
      'bin.js',
      '--url',
      'https://www.baidu.com/',
    ]);
    expect(script).toMatchSnapshot();
  });

  test('error order', async () => {
    await expect(async () => {
      await parseArgsIntoYamlScript([
        'node',
        'bin.js',
        '--query',
        'something',
        '--url',
      ]);
    }).rejects.toThrowError();
  });

  test('error unknown arg', async () => {
    await expect(async () => {
      await parseArgsIntoYamlScript(['node', 'bin.js', '--unknown']);
    }).rejects.toThrowError();
  });

  test('removed args', async () => {
    await expect(async () => {
      await parseArgsIntoYamlScript(['node', 'bin.js', '--action']);
    }).rejects.toThrowError();
  });

  test('all args', async () => {
    const script = await parseArgsIntoYamlScript([
      'node',
      'bin.js',
      '--url',
      'https://www.baidu.com/',
      '--viewport-width',
      '1024',
      '--viewport-height',
      '768',
      '--viewport-scale',
      '2',
      '--user-agent',
      'Cli',
      '--output',
      './midscene_run/cache/cli_result.json',
      '--aiAction',
      'the title of the page',
      '--aiQuery',
      'the title of the page',
      '--aiAssert',
      'the title is "百度"',
      '--sleep',
      '1000',
      '--aiWaitFor',
      'the title is "百度"',
    ]);
    expect(script).toMatchSnapshot();
  });
});
