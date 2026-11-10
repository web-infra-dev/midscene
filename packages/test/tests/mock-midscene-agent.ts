import { rs } from '@rstest/core';
import type { MidsceneUIAgent } from '../src/midscene';

// Platform Node tests should fail if they unexpectedly invoke a common Agent API.
export const createMockMidsceneAgent = () => {
  const unexpectedCall = async (): Promise<never> => {
    throw new Error('Unexpected common Agent API call in a platform Node test');
  };
  return {
    aiAct: rs.fn<MidsceneUIAgent['aiAct']>(unexpectedCall),
    aiTap: rs.fn<MidsceneUIAgent['aiTap']>(unexpectedCall),
    aiAssert: rs.fn<MidsceneUIAgent['aiAssert']>(unexpectedCall),
    aiBoolean: rs.fn<MidsceneUIAgent['aiBoolean']>(unexpectedCall),
    aiNumber: rs.fn<MidsceneUIAgent['aiNumber']>(unexpectedCall),
    aiString: rs.fn<MidsceneUIAgent['aiString']>(unexpectedCall),
    aiAsk: rs.fn<MidsceneUIAgent['aiAsk']>(unexpectedCall),
    recordToReport: rs.fn<MidsceneUIAgent['recordToReport']>(unexpectedCall),
  } satisfies MidsceneUIAgent;
};
