import { describe, expect, it } from '@rstest/core';
import {
  APP_CONTROL_BENCH_REPORT_BASE_URL,
  APP_CONTROL_BENCH_RUNS,
  getAppControlBenchReportUrl,
} from '../theme/components/app-control-bench-data';

const EXPECTED_SUMMARIES = {
  'doubao-20260825': {
    averageDurationSeconds: 51.982133,
    passAt1: 96.67,
    passCount: 58,
    partialCount: 1,
    failCount: 1,
    totalUsd: 1.563245,
    totalCny: 10.630066,
  },
  'qwen-20260825': {
    averageDurationSeconds: 53.990117,
    passAt1: 93.33,
    passCount: 56,
    partialCount: 4,
    failCount: 0,
    totalUsd: 0.580031,
    totalCny: 3.944211,
  },
  'deepseek-20260825': {
    averageDurationSeconds: 86.360417,
    passAt1: 86.67,
    passCount: 52,
    partialCount: 4,
    failCount: 4,
    totalUsd: 0.271932,
    totalCny: 1.849138,
  },
} as const;

describe('AppControlBench report data', () => {
  it('matches all three run summaries and recorded model costs', () => {
    expect(APP_CONTROL_BENCH_RUNS).toHaveLength(3);

    for (const run of APP_CONTROL_BENCH_RUNS) {
      const statusCounts = run.tasks.reduce<Record<string, number>>(
        (counts, task) => {
          counts[task.status] = (counts[task.status] ?? 0) + 1;
          return counts;
        },
        {},
      );
      const totalUsd = run.tasks.reduce(
        (total, task) => total + task.costUsd,
        0,
      );
      const totalCny = run.tasks.reduce(
        (total, task) => total + task.costCny,
        0,
      );
      const expected = EXPECTED_SUMMARIES[run.id];

      expect(run.tasks).toHaveLength(60);
      expect(new Set(run.tasks.map((task) => task.name)).size).toBe(60);
      expect(statusCounts.Pass ?? 0).toBe(expected.passCount);
      expect(statusCounts.Partial ?? 0).toBe(expected.partialCount);
      expect(statusCounts.Fail ?? 0).toBe(expected.failCount);
      expect(run.summary).toEqual(expected);
      expect(totalUsd).toBeCloseTo(expected.totalUsd, 6);
      expect(totalCny).toBeCloseTo(expected.totalCny, 5);
    }
  });

  it('uses the published AppControlBench CDN prefix', () => {
    expect(APP_CONTROL_BENCH_REPORT_BASE_URL).toBe(
      'https://lf3-static.bytednsdoc.com/obj/eden-cn/luljzkpt/ljhwZthlaukjlkulzlp/benchmark/AppControlBench',
    );
  });

  it('builds the published Doubao element-05 report URL', () => {
    const doubaoRun = APP_CONTROL_BENCH_RUNS[0];
    const element05Index = doubaoRun.tasks.findIndex(
      (task) => task.name === 'element-05',
    );
    const element05 = doubaoRun.tasks[element05Index];

    expect(
      getAppControlBenchReportUrl(doubaoRun, element05, element05Index),
    ).toBe(
      'https://lf3-static.bytednsdoc.com/obj/eden-cn/luljzkpt/ljhwZthlaukjlkulzlp/benchmark/AppControlBench/doubao-20260825/Task-35-element-05__group-0-39e22f33-4039-4891-854c-009333ade66f-Pass.html',
    );
  });
});
