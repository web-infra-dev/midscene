import type { NodeDefinition } from '@midscene/core/internal/test-runner';
import { getDebug, runWithConsoleLogHandler } from '@midscene/shared/logger';
import type { ConsoleLogEntry } from '@midscene/shared/logger';
import { describe, expect, it } from 'vitest';
import { scopeNodeConsole } from '../src/cli/console-scope';

describe('Node console scope', () => {
  it('attributes concurrent Case, document, and teardown warnings to their actual owner', async () => {
    const entries: ConsoleLogEntry[] = [];
    const teardowns: Array<() => unknown> = [];
    const log = getDebug('test:scope', { console: true });
    const node = scopeNodeConsole<unknown, unknown, undefined>({
      name: 'aiAct',
      async execute(ctx) {
        await Promise.resolve();
        log('warning inside a Node');
        ctx.onTeardown(() => log('warning inside teardown'));
      },
    });
    const common = {
      input: {},
      $: { continueOnError: false },
      signal: new AbortController().signal,
      context: undefined,
      report: { addTrace() {}, onSnapshot() {} },
      onTeardown: (callback: () => unknown) => {
        teardowns.push(callback);
      },
    };
    await runWithConsoleLogHandler(
      (entry) => entries.push(entry),
      async () => {
        await Promise.all(
          ['first', 'second'].map((name) =>
            node.execute({
              ...common,
              scope: 'case',
              case: {
                caseId: name,
                runId: `${name}-attempt`,
                caseIndex: 0,
                projectName: name,
                attemptIndex: 0,
                name: `${name} case`,
                sourcePath: `cases/${name}.yaml`,
                phase: 'steps',
                stepIndex: 1,
              },
            }),
          ),
        );
        await node.execute({
          ...common,
          scope: 'document',
          document: {
            documentId: 'doc',
            documentRunId: 'doc-attempt',
            projectId: 'mobile',
            projectName: 'mobile',
            sourcePath: 'cases/mobile.yaml',
            phase: 'beforeAll',
            stepIndex: 0,
          },
        });
        for (const callback of teardowns) await callback();
        log('outside a Node');
      },
    );
    expect(entries.slice(0, 3).map((entry) => entry.scope)).toEqual([
      expect.objectContaining({
        projectName: 'first',
        caseName: 'first case',
        node: 'aiAct',
        phase: 'steps',
        stepIndex: 1,
      }),
      expect.objectContaining({
        projectName: 'second',
        caseName: 'second case',
        node: 'aiAct',
        phase: 'steps',
        stepIndex: 1,
      }),
      expect.objectContaining({
        projectName: 'mobile',
        sourcePath: 'cases/mobile.yaml',
        phase: 'beforeAll',
        node: 'aiAct',
      }),
    ]);
    expect(entries.slice(3, 6).map((entry) => entry.scope)).toEqual([
      expect.objectContaining({
        projectName: 'first',
        caseName: 'first case',
        phase: 'teardown',
      }),
      expect.objectContaining({
        projectName: 'second',
        caseName: 'second case',
        phase: 'teardown',
      }),
      expect.objectContaining({ projectName: 'mobile', phase: 'teardown' }),
    ]);
    expect(entries[6].scope).toBeUndefined();
  });
});
