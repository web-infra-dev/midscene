import type { NodeDefinition } from '@midscene/core/internal/test-runner';
import { runWithConsoleLogScope } from '@midscene/shared/logger';

/** Bind logs to the Node that emitted them, rather than the latest live row. */
export function scopeNodeConsole<TInput, TData, TContext>(
  node: NodeDefinition<TInput, TData, TContext>,
): NodeDefinition<TInput, TData, TContext> {
  return {
    ...node,
    execute(ctx) {
      const position = ctx.scope === 'case' ? ctx.case : ctx.document;
      const scope = {
        projectName: position.projectName,
        sourcePath: position.sourcePath,
        ...(ctx.scope === 'case'
          ? {
              caseId: ctx.case.caseId,
              caseName: ctx.case.name,
              runId: ctx.case.runId,
            }
          : { runId: ctx.document.documentRunId }),
        phase: position.phase,
        stepIndex: position.stepIndex,
        node: node.name,
      };
      return runWithConsoleLogScope(scope, () =>
        node.execute({
          ...ctx,
          onTeardown(teardown) {
            ctx.onTeardown(() =>
              runWithConsoleLogScope(
                { ...scope, phase: 'teardown', stepIndex: undefined },
                teardown,
              ),
            );
          },
        }),
      );
    },
  };
}
