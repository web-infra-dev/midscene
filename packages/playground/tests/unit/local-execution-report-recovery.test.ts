import { Agent } from '@midscene/core/agent' with { rstest: 'importActual' };
import { describe, expect, it, rs } from '@rstest/core';
import { LocalExecutionAdapter } from '../../src/adapters/local-execution';

describe('Local execution cancellation recovery with real Agents', () => {
  it.each(['device', 'report'] as const)(
    'recreates the Agent after %s destruction fails',
    async (failure) => {
      const createAgent = () =>
        new Agent(
          {
            interfaceType: 'puppeteer',
            actionSpace: () => [],
            destroy: async () => {},
          } as any,
          {
            generateReport: false,
            autoPrintReportMsg: false,
            modelConfig: {
              MIDSCENE_MODEL_NAME: 'test',
              MIDSCENE_MODEL_API_KEY: 'test',
            },
          },
        );
      const previous = createAgent();
      const fresh = createAgent();
      const error = new Error(`${failure} cleanup failed`);
      if (failure === 'device')
        rs.spyOn(previous.interface, 'destroy').mockRejectedValue(error);
      else rs.spyOn(previous, 'finalizeReport').mockRejectedValue(error);
      rs.spyOn(previous, 'reportHTMLString').mockReturnValue('previous report');
      rs.spyOn(fresh, 'reportHTMLString').mockReturnValue('fresh report');
      rs.spyOn(fresh, 'aiAsk').mockResolvedValue('recovered');
      const factory = rs.fn(async () => fresh);
      const adapter = new LocalExecutionAdapter(previous, factory);
      try {
        const cancelled = await adapter.cancelTask('cancelled');
        expect(cancelled.error).toBe(`Failed to cancel: ${error.message}`);
        expect(cancelled.reportHTML).toBe('previous report');
        expect(previous.destroyed).toBe(true);
        await expect(previous.resetDump()).rejects.toThrow('destroyed Agent');
        const reset = rs.spyOn(fresh, 'resetDump');
        expect(
          await adapter.executeAction(
            'aiAsk',
            { type: 'aiAsk', prompt: 'next run' },
            {},
          ),
        ).toMatchObject({ result: 'recovered', error: null });
        expect(factory).toHaveBeenCalledOnce();
        expect(reset).toHaveBeenCalledOnce();
        expect(fresh.destroyed).toBe(false);
      } finally {
        await fresh.destroy();
      }
    },
  );
});
