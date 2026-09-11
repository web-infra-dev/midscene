import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { NodeRegistry, runWorkflowDocument } from '../src';
import { createAgentTestRunnerNodes } from '../src/midscene';

describe('Agent-owned Node report integration', () => {
  it.each([false, true])(
    'preserves execution traces when failure=%s',
    async (fail) => {
      const listeners = new Set<
        (dump: string, execution?: { id?: string }) => void
      >();
      const agent = {
        addDumpUpdateListener(
          listener: (dump: string, execution?: { id?: string }) => void,
        ) {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
      };
      const nodes = createAgentTestRunnerNodes(
        [
          {
            name: 'platformAction',
            stringInputKey: 'uri',
            inputSchema: z.object({ uri: z.string() }),
            execute(actualAgent, input) {
              expect(actualAgent).toBe(agent);
              expect(input).toEqual({ uri: 'app://example' });
              for (const listener of listeners) {
                listener('{}', { id: 'execution-1' });
                listener('{}', { id: 'execution-1' });
              }
              if (fail) throw new Error('action failed');
              return { summary: 'launched' };
            },
          },
        ],
        () => agent,
      );
      const registry = new NodeRegistry(nodes);
      const result = await runWorkflowDocument(
        {
          documentId: 'document',
          projectId: 'project',
          sourcePath: 'workflow.yaml',
          lifecycle: {
            beforeAll: [],
            beforeEach: [],
            afterEach: [],
            afterAll: [],
          },
          cases: [
            {
              caseId: 'case',
              projectId: 'project',
              sourcePath: 'workflow.yaml',
              caseIndex: 0,
              definition: {
                name: 'case',
                steps: [
                  {
                    node: 'platformAction',
                    input: { uri: 'app://example' },
                    meta: { continueOnError: false },
                  },
                ],
              },
            },
          ],
        },
        { resolveNode: registry.require.bind(registry) },
      );
      const step = result.cases[0].run!.steps[0];
      expect(step.status).toBe(fail ? 'failed' : 'success');
      expect(step.report?.traces).toEqual([
        { type: 'midscene-execution', executionId: 'execution-1' },
      ]);
      expect(listeners.size).toBe(0);
    },
  );
});
