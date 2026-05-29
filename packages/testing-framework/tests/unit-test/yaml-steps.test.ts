import { describe, expect, it, vi } from 'vitest';
import {
  normalizeYamlCase,
  runBuiltinYamlCase,
  runYamlFlowWithCustomSteps,
} from '../../src/runtime/yaml';
import type { CustomYamlStepHandler, FrameworkAgent } from '../../src/types';

const fakeAgent = () => {
  const calls: string[] = [];
  const agent: FrameworkAgent = {
    runYaml: vi.fn(async (yamlScriptContent: string) => {
      calls.push(yamlScriptContent);
      return { result: {} };
    }),
  };
  return { agent, calls };
};

describe('normalizeYamlCase', () => {
  it('wraps a top-level flow into a named case', () => {
    const normalized = normalizeYamlCase(
      'flow:\n  - aiAct: open page\n',
      '/p/e2e/checkout.yaml',
    );
    expect(normalized.name).toBe('checkout');
    expect(normalized.flow).toEqual([{ aiAct: 'open page' }]);
  });

  it('rejects full tasks documents', () => {
    expect(() =>
      normalizeYamlCase('tasks:\n  - name: a\n    flow: []\n', '/p/a.yaml'),
    ).toThrow(/top-level "flow"/);
  });

  it('rejects documents without flow', () => {
    expect(() => normalizeYamlCase('foo: bar\n', '/p/a.yaml')).toThrow(
      /top-level "flow"/,
    );
  });
});

describe('runYamlFlowWithCustomSteps', () => {
  it('forwards built-in steps (including multi-key steps) to runYaml', async () => {
    const { agent, calls } = fakeAgent();
    await runYamlFlowWithCustomSteps({
      agent,
      filePath: '/p/e2e/case.yaml',
      caseName: 'case',
      flow: [
        { aiInput: 'Search products input', value: 'hoodie' },
        { aiKeyboardPress: 'Search products input', keyName: 'Enter' },
      ],
      state: {},
    });
    expect(agent.runYaml).toHaveBeenCalledTimes(2);
    expect(calls[0]).toContain('aiInput');
    expect(calls[0]).toContain('hoodie');
    expect(calls[1]).toContain('aiKeyboardPress');
    expect(calls[1]).toContain('Enter');
  });

  it('runs built-in and custom steps in authored order', async () => {
    const { agent } = fakeAgent();
    const order: string[] = [];
    (agent.runYaml as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      order.push('builtin');
      return { result: {} };
    });
    const yamlSteps: Record<string, CustomYamlStepHandler> = {
      seedOrder: async () => {
        order.push('seedOrder');
      },
      assertOrderStatus: async () => {
        order.push('assertOrderStatus');
      },
    };

    await runYamlFlowWithCustomSteps({
      agent,
      filePath: '/p/e2e/order.yaml',
      caseName: 'order',
      flow: [
        { seedOrder: { orderId: 'E2E-1' } },
        { aiAct: 'open orders' },
        { assertOrderStatus: { orderId: 'E2E-1', status: 'paid' } },
      ],
      yamlSteps,
      state: {},
    });

    expect(order).toEqual(['seedOrder', 'builtin', 'assertOrderStatus']);
  });

  it('passes value and context to custom handlers', async () => {
    const { agent } = fakeAgent();
    const handler = vi.fn<CustomYamlStepHandler>(async () => undefined);
    await runYamlFlowWithCustomSteps({
      agent,
      filePath: '/p/e2e/order.yaml',
      caseName: 'order',
      flow: [{ seedOrder: { orderId: 'E2E-1' } }],
      yamlSteps: { seedOrder: handler },
      state: { existing: true },
    });

    expect(handler).toHaveBeenCalledTimes(1);
    const [value, context] = handler.mock.calls[0];
    expect(value).toEqual({ orderId: 'E2E-1' });
    expect(context).toMatchObject({
      filePath: '/p/e2e/order.yaml',
      stepIndex: 0,
      stepName: 'seedOrder',
    });
    expect(context.state).toEqual({ existing: true });
  });

  it('shares state across steps', async () => {
    const { agent } = fakeAgent();
    const yamlSteps: Record<string, CustomYamlStepHandler> = {
      seedOrder: async (_value, ctx) => {
        ctx.state.lastOrderId = 'E2E-9';
      },
      assertOrderStatus: async (_value, ctx) => {
        expect(ctx.state.lastOrderId).toBe('E2E-9');
      },
    };
    await runYamlFlowWithCustomSteps({
      agent,
      filePath: '/p/e2e/order.yaml',
      caseName: 'order',
      flow: [{ seedOrder: {} }, { assertOrderStatus: {} }],
      yamlSteps,
      state: {},
    });
  });

  it('throws on unknown steps', async () => {
    const { agent } = fakeAgent();
    await expect(
      runYamlFlowWithCustomSteps({
        agent,
        filePath: '/p/e2e/order.yaml',
        caseName: 'order',
        flow: [{ frobnicate: 1 }],
        yamlSteps: { seedOrder: async () => undefined },
        state: {},
      }),
    ).rejects.toThrow(/unknown step "frobnicate"/);
  });
});

describe('runBuiltinYamlCase', () => {
  it('runs the whole flow in a single runYaml call', async () => {
    const { agent, calls } = fakeAgent();
    await runBuiltinYamlCase({
      agent,
      normalizedCase: {
        name: 'checkout',
        flow: [{ aiAct: 'open page' }, { aiAssert: 'visible' }],
        raw: {},
      },
    });
    expect(agent.runYaml).toHaveBeenCalledTimes(1);
    expect(calls[0]).toContain('checkout');
    expect(calls[0]).toContain('aiAct');
    expect(calls[0]).toContain('aiAssert');
  });
});
