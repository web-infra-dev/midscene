import { join } from 'node:path';
import { matchYamlFiles } from '@/cli-utils';
import { launchServer } from '@/yaml-runner';
import { execa } from 'execa';
import { describe, expect, test } from 'vitest';
const serverRoot = join(__dirname, 'server_root');
const cliBin = require.resolve('../bin/midscene');

const describeIf = process.env.BRIDGE_MODE ? describe : describe.skip;

describeIf(
  'bridge',
  {
    timeout: 1000 * 60 * 10,
  },
  () => {
    test('open new tab', async () => {
      // const params = ['./tests/midscene_scripts/sub/bing.yaml', '--keep-window'];
      const params = [
        './tests/midscene_scripts_bridge/new_tab/open-new-tab.yaml',
        '--keep-window',
      ];
      await execa(cliBin, params);
    });
  },
);
