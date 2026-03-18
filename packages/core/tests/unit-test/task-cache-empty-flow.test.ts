import { TaskCache } from '@/agent';
import { uuid } from '@midscene/shared/utils';
import { describe, expect, it } from 'vitest';

/**
 * Access internal cache state for testing
 */
function getTaskCacheInternal(taskCache: TaskCache) {
  return taskCache as unknown as {
    cache: { caches: any[] };
    cacheOriginalLength: number;
  };
}

describe('matchPlanCache empty flow guard', () => {
  function createCacheWithPlan(yamlWorkflow: string) {
    const cache = new TaskCache(uuid(), true);
    const internal = getTaskCacheInternal(cache);
    internal.cache.caches.push({
      type: 'plan',
      prompt: 'test prompt',
      yamlWorkflow,
    });
    internal.cacheOriginalLength = 1;
    return cache;
  }

  it('should mark cache as unusable when yamlWorkflow has tasks with empty flow', () => {
    const yamlWorkflow = `tasks:
  - name: test prompt
    flow: []
`;
    const cache = createCacheWithPlan(yamlWorkflow);
    const result = cache.matchPlanCache('test prompt');
    expect(result).toBeDefined();
    expect(result?.cacheUsable).toBe(false);
  });

  it('should mark cache as unusable when yamlWorkflow is empty string', () => {
    const cache = createCacheWithPlan('');
    const result = cache.matchPlanCache('test prompt');
    expect(result).toBeDefined();
    expect(result?.cacheUsable).toBe(false);
  });

  it('should mark cache as unusable when yamlWorkflow is whitespace only', () => {
    const cache = createCacheWithPlan('   \n\t  ');
    const result = cache.matchPlanCache('test prompt');
    expect(result).toBeDefined();
    expect(result?.cacheUsable).toBe(false);
  });

  it('should mark cache as unusable when yamlWorkflow has no flow field', () => {
    const yamlWorkflow = `tasks:
  - name: test prompt
`;
    const cache = createCacheWithPlan(yamlWorkflow);
    const result = cache.matchPlanCache('test prompt');
    expect(result).toBeDefined();
    expect(result?.cacheUsable).toBe(false);
  });

  it('should return cache when yamlWorkflow has non-empty flow', () => {
    const yamlWorkflow = `tasks:
  - name: test prompt
    flow:
      - aiTap: submit button
  `;
    const cache = createCacheWithPlan(yamlWorkflow);
    const result = cache.matchPlanCache('test prompt');
    expect(result).toBeDefined();
    expect(result?.cacheUsable).toBe(true);
    expect(result?.cacheContent.yamlWorkflow).toBe(yamlWorkflow);
  });

  it('should mark cache as unusable when yamlWorkflow is invalid YAML', () => {
    const cache = createCacheWithPlan(': : : invalid yaml [[[');
    const result = cache.matchPlanCache('test prompt');
    expect(result).toBeDefined();
    expect(result?.cacheUsable).toBe(false);
  });

  it('should update the matched invalid cache record instead of appending a new one', () => {
    const cache = createCacheWithPlan(`tasks:
  - name: test prompt
    flow: []
`);
    const matched = cache.matchPlanCache('test prompt');

    cache.updateOrAppendCacheRecord(
      {
        type: 'plan',
        prompt: 'test prompt',
        yamlWorkflow: `tasks:
  - name: test prompt
    flow:
      - aiTap: submit button
`,
      },
      matched,
    );

    const internal = getTaskCacheInternal(cache);
    expect(internal.cache.caches).toHaveLength(1);
    expect((internal.cache.caches[0] as any).yamlWorkflow).toContain(
      'aiTap: submit button',
    );
  });
});
