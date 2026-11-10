import { describe, test } from '@rstest/core';
import { execa } from 'execa';
const cliBin = require.resolve('../../bin/midscene');

const describeIf = process.env.BRIDGE_MODE ? describe : describe.skip;

describeIf(
  'bridge',
  {
    timeout: 1000 * 60 * 3,
  },
  () => {
    test('open new tab', async () => {
      const params = [
        './tests/midscene_scripts_bridge/new_tab/open-new-tab.yaml',
      ];
      await execa(cliBin, params);
    });
  },
);
