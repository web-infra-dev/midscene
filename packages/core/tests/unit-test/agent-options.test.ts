import { Agent } from '@/agent';
import {
  normalizeAgentOptions,
  withAgentDefaults,
} from '@/agent/agent-options';
import { normalizeAgentCacheConfig } from '@/agent/cache-config';
import type { AgentOpt } from '@/types';
import { describe, expect, it, rs } from '@rstest/core';

describe('Agent option normalization', () => {
  it('preserves defaults, explicit undefined, and caller-owned context objects', () => {
    const contexts = { aiAct: '', default: 'shared' };
    const input: AgentOpt = {
      generateReport: undefined,
      aiContexts: contexts,
      aiActContext: 'legacy',
    };
    const options = withAgentDefaults(input);
    const warn = rs.fn();
    normalizeAgentOptions(options, warn);
    expect(options).toMatchObject({
      generateReport: undefined,
      persistExecutionDump: false,
      autoPrintReportMsg: true,
      groupName: 'Midscene Report',
      groupDescription: '',
      aiContexts: { aiAct: '', default: 'shared' },
      aiActContext: '',
      aiActionContext: '',
    });
    expect(options).not.toBe(input);
    expect(options.aiContexts).not.toBe(contexts);
    expect(input).toEqual({
      generateReport: undefined,
      aiContexts: contexts,
      aiActContext: 'legacy',
    });
    expect(warn).toHaveBeenCalledOnce();
  });

  it.each([
    {
      input: { aiActContext: 'act', aiActionContext: 'action' },
      expected: 'act',
    },
    { input: { aiActionContext: 'action' }, expected: 'action' },
    {
      input: { aiActContext: 'act', aiContexts: { aiAct: 'new' } },
      expected: 'new',
    },
  ])(
    'retains deprecated context precedence: $expected',
    ({ input, expected }) => {
      const options = withAgentDefaults(input);
      normalizeAgentOptions(options, rs.fn());
      expect(options.aiContexts?.aiAct).toBe(expected);
      expect(options.aiActContext).toBe(expected);
      expect(options.aiActionContext).toBe(expected);
    },
  );

  it.each([null, [], 'context'])(
    'rejects an invalid context map (%s)',
    (aiContexts) => {
      const options = withAgentDefaults({ aiContexts } as unknown as AgentOpt);
      expect(() => normalizeAgentOptions(options, rs.fn())).toThrow(
        'opts.aiContexts must be a plain object',
      );
    },
  );

  it.each([
    {
      aiContexts: { unsupported: 'value' },
      message: 'Unknown Agent context key: unsupported',
    },
    {
      aiContexts: { aiAct: 123 },
      message: 'Agent context "aiAct" must be a string',
    },
  ])(
    'preserves context validation errors: $message',
    ({ aiContexts, message }) => {
      expect(() =>
        normalizeAgentOptions(
          withAgentDefaults({ aiContexts } as unknown as AgentOpt),
          rs.fn(),
        ),
      ).toThrow(message);
    },
  );

  it('emits the deprecation warning before rejecting an invalid model config', () => {
    const warn = rs.fn();
    expect(() =>
      normalizeAgentOptions(
        withAgentDefaults({
          aiActContext: 'legacy',
          modelConfig: [],
        } as unknown as AgentOpt),
        warn,
      ),
    ).toThrow('opts.modelConfig must be a plain object map');
    expect(warn).toHaveBeenCalledOnce();
  });

  it('retains constructor validation order before context normalization', () => {
    const device = { interfaceType: 'puppeteer', actionSpace: () => [] } as any;
    const invalid = {
      waitForActionReady: true,
      aiContexts: null,
    } as unknown as AgentOpt;
    expect(
      () =>
        new Agent(device, {
          ...invalid,
          generateReport: false,
          persistExecutionDump: true,
        }),
    ).toThrow('persistExecutionDump cannot be true');
    expect(() => new Agent(device, invalid)).toThrow(
      'waitForActionReady must be a function',
    );
  });

  it.each(['read-only', 'read-write', 'write-only'] as const)(
    'preserves cache normalization for %s',
    (strategy) => {
      const input = {
        cache: { id: 'cache-id', strategy, cacheDir: '  ./cache  ' },
      };
      expect(normalizeAgentCacheConfig(input)).toEqual({
        id: 'cache-id',
        enabled: strategy !== 'write-only',
        readOnly: strategy === 'read-only',
        writeOnly: strategy === 'write-only',
        cacheDir: './cache',
      });
      expect(input.cache.cacheDir).toBe('  ./cache  ');
    },
  );

  it('retains disabled cache behavior', () => {
    expect(normalizeAgentCacheConfig({ cache: false })).toBeNull();
  });
});
