import { vi } from 'vitest';
import type { MidsceneUIAgent } from '../src/midscene';

// Platform Node tests should fail if they unexpectedly invoke a common Agent API.
export const createMockMidsceneAgent = () => {
  const unexpectedCall = async (): Promise<never> => {
    throw new Error('Unexpected common Agent API call in a platform Node test');
  };
  return {
    aiAct: vi.fn<MidsceneUIAgent['aiAct']>(unexpectedCall),
    aiTap: vi.fn<MidsceneUIAgent['aiTap']>(unexpectedCall),
    aiAssert: vi.fn<MidsceneUIAgent['aiAssert']>(unexpectedCall),
    aiBoolean: vi.fn<MidsceneUIAgent['aiBoolean']>(unexpectedCall),
    aiNumber: vi.fn<MidsceneUIAgent['aiNumber']>(unexpectedCall),
    aiString: vi.fn<MidsceneUIAgent['aiString']>(unexpectedCall),
    aiAsk: vi.fn<MidsceneUIAgent['aiAsk']>(unexpectedCall),
    recordToReport: vi.fn<MidsceneUIAgent['recordToReport']>(unexpectedCall),
  } satisfies MidsceneUIAgent;
};
