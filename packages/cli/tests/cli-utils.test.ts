import { matchYamlFiles, parseArgsIntoYamlScript } from '@/cli-utils';
import { describe, expect, test } from 'vitest';

describe('cli utils', () => {
  test('match exact file', async () => {
    const files = await matchYamlFiles('./tests/midscene_scripts/foo.yml');
    expect(files.sort()).toMatchSnapshot();
  });

  let files: string[];
  test('match folder', async () => {
    files = await matchYamlFiles('./tests/midscene_scripts/');
    expect(files.sort()).toMatchSnapshot();
  });

  test('match folder 2', async () => {
    const files2 = await matchYamlFiles('./tests/midscene_scripts');
    expect(files2.sort()).toEqual(files.sort());
  });

  test('match folder with star', async () => {
    const files2 = await matchYamlFiles('./tests/midscene_scripts/**');
    expect(files2.sort()).toEqual(files.sort());
  });

  test('match files', async () => {
    const files3 = await matchYamlFiles('./tests/midscene_scripts/**/*.yml');
    expect(files3.sort()).toMatchSnapshot();
  });
});
