import { defineNode, runWorkflowDocument } from '@/test-runner';
import { collectLegacyYamlDocument } from '@/yaml/test-runner-compat';
import { describe, expect, test } from '@rstest/core';

describe('document cancellation', () => {
  test('does not retry an interrupted Case or start subsequent Cases', async () => {
    const controller = new AbortController();
    let calls = 0;
    const node = defineNode({
      name: 'javascript',
      execute: async () => {
        calls += 1;
        controller.abort(new Error('stop'));
        throw new Error('interrupted action');
      },
    });
    const document = collectLegacyYamlDocument({
      tasks: [
        { name: 'first', flow: [{ javascript: 'first()' }] },
        { name: 'second', flow: [{ javascript: 'second()' }] },
      ],
    });
    const execution = await runWorkflowDocument(document, {
      resolveNode: () => node,
      retry: 3,
      signal: controller.signal,
    });
    expect(calls).toBe(1);
    expect(execution.cases[0].attempts).toHaveLength(1);
    expect(execution.cases[1]).toMatchObject({
      status: 'not-run',
      notRunReason: 'interrupted',
    });
  });
});
