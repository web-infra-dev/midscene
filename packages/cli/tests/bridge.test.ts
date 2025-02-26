import { execa } from 'execa';
import { describe, test } from 'vitest';
const cliBin = require.resolve('../bin/midscene');

const describeIf = process.env.BRIDGE_MODE ? describe : describe.skip;

describeIf(
  'bridge',
  {
    timeout: 1000 * 60 * 3,
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
