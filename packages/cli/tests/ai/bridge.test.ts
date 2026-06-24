import { describe, rs, test } from '@rstest/core';
import { execa } from 'execa';
const cliBin = require.resolve('../../bin/midscene');

rs.setConfig({ testTimeout: 1000 * 60 * 3 });

const describeIf = process.env.BRIDGE_MODE ? describe : describe.skip;

describeIf('bridge', () => {
  test('open new tab', async () => {
    const params = [
      './tests/midscene_scripts_bridge/new_tab/open-new-tab.yaml',
    ];
    await execa(cliBin, params);
  });
});
