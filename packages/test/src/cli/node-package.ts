import type { Awaitable } from '../engine/types';
import type { MidsceneUIAgent } from '../midscene';
import type { NodeExecutionContext } from '../node/types';
import type { TestPlatform } from './test-project';

/** Options passed to an external package's synchronous createMidsceneTestNodes() factory. */
export interface NodePackageOptions<TContext, TAgent = MidsceneUIAgent> {
  platform: TestPlatform;
  /** Access runtime resources only from a Node's execute() handler. */
  getAgent(ctx: NodeExecutionContext<unknown, TContext>): Awaitable<TAgent>;
}
