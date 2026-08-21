import { describe, expect, it } from '@rstest/core';
import {
  APP_CONTROL_BENCH_REPORT_BASE_URL,
  APP_CONTROL_BENCH_TASKS,
} from '../theme/components/app-control-bench-data';

describe('AppControlBench report data', () => {
  it('matches the source run summary and recorded model costs', () => {
    const statusCounts = APP_CONTROL_BENCH_TASKS.reduce<Record<string, number>>(
      (counts, task) => {
        counts[task.status] = (counts[task.status] ?? 0) + 1;
        return counts;
      },
      {},
    );
    const totalUsd = APP_CONTROL_BENCH_TASKS.reduce(
      (total, task) => total + task.costUsd,
      0,
    );
    const totalCny = APP_CONTROL_BENCH_TASKS.reduce(
      (total, task) => total + task.costCny,
      0,
    );

    expect(APP_CONTROL_BENCH_TASKS).toHaveLength(60);
    expect(new Set(APP_CONTROL_BENCH_TASKS.map((task) => task.name)).size).toBe(
      60,
    );
    expect(statusCounts).toEqual({ Pass: 58, Fail: 2 });
    expect(totalUsd).toBeCloseTo(0.607738, 6);
    expect(totalCny).toBeCloseTo(4.13262, 6);
  });

  it('uses the published task report prefix', () => {
    expect(APP_CONTROL_BENCH_REPORT_BASE_URL).toBe(
      'https://lf3-static.bytednsdoc.com/obj/eden-cn/luljzkpt/ljhwZthlaukjlkulzlp/benchmark/AppControlBench/20260821/',
    );
  });
});
