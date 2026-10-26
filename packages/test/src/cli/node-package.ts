import type { Awaitable } from '../engine/types';
import type { MidsceneUIAgent } from '../midscene';
import type { NodeExecutionContext } from '../node/types';

/** Options passed to an external package's synchronous createMidsceneTestNodes() factory. */
export interface NodePackageOptions<TContext, TAgent = MidsceneUIAgent> {
  /** Access runtime resources only from a Node's execute() handler. */
  getAgent(
    execution: NodeExecutionContext<unknown, TContext>,
  ): Awaitable<TAgent>;
}
