import { join } from 'node:path';
import { matchYamlFiles, parseArgsIntoYamlScript } from '@/cli-utils';
import { launchServer } from '@/yaml-runner';
import { describe, expect, test } from 'vitest';
const serverRoot = join(__dirname, 'server_root');

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

describe('launch server', () => {
  test('launch server', async () => {
    const serverResult = await launchServer(serverRoot);
    expect(serverResult).toBeDefined();

    const serverAddress = serverResult.server.address();
    const staticServerUrl = `http://${serverAddress?.address}:${serverAddress?.port}`;

    const contents = await fetch(`${staticServerUrl}/index.html`);
    expect(contents.status).toBe(200);

    await serverResult.server.close();
  });
});
