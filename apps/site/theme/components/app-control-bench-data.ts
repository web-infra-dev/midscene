export type AppControlBenchStatus = 'Pass' | 'Partial' | 'Fail';

export interface AppControlBenchTask {
  name: string;
  status: AppControlBenchStatus;
  reportStatus?: AppControlBenchStatus;
  costUsd: number;
  costCny: number;
}

export function getAppControlBenchReportStatus(task: AppControlBenchTask) {
  return task.reportStatus ?? task.status;
}

export const APP_CONTROL_BENCH_REPORT_BASE_URL =
  'https://lf3-static.bytednsdoc.com/obj/eden-cn/luljzkpt/ljhwZthlaukjlkulzlp/benchmark/AppControlBench/20260825/';

export const APP_CONTROL_BENCH_TASKS = [
  { name: 'bsky-01', status: 'Pass', costUsd: 0.003691, costCny: 0.025099 },
  { name: 'bsky-02', status: 'Pass', costUsd: 0.005979, costCny: 0.040657 },
  { name: 'bsky-03', status: 'Pass', costUsd: 0.0079, costCny: 0.05372 },
  { name: 'bsky-04', status: 'Pass', costUsd: 0.005914, costCny: 0.040215 },
  { name: 'bsky-05', status: 'Pass', costUsd: 0.00392, costCny: 0.026656 },
  { name: 'bsky-06', status: 'Pass', costUsd: 0.004095, costCny: 0.027846 },
  { name: 'bsky-07', status: 'Pass', costUsd: 0.003701, costCny: 0.025167 },
  { name: 'bsky-08', status: 'Pass', costUsd: 0.012646, costCny: 0.085993 },
  { name: 'bsky-09', status: 'Pass', costUsd: 0.008158, costCny: 0.055474 },
  { name: 'bsky-10', status: 'Pass', costUsd: 0.005948, costCny: 0.040446 },
  { name: 'bsky-11', status: 'Pass', costUsd: 0.003833, costCny: 0.026064 },
  { name: 'bsky-12', status: 'Pass', costUsd: 0.003785, costCny: 0.025738 },
  { name: 'bsky-13', status: 'Pass', costUsd: 0.003803, costCny: 0.02586 },
  { name: 'bsky-14', status: 'Pass', costUsd: 0.01045, costCny: 0.07106 },
  { name: 'bsky-15', status: 'Pass', costUsd: 0.010268, costCny: 0.069822 },
  { name: 'bsky-16', status: 'Pass', costUsd: 0.024228, costCny: 0.16475 },
  { name: 'bsky-17', status: 'Pass', costUsd: 0.00589, costCny: 0.040052 },
  { name: 'bsky-18', status: 'Pass', costUsd: 0.003817, costCny: 0.025956 },
  { name: 'bsky-19', status: 'Pass', costUsd: 0.008063, costCny: 0.054828 },
  { name: 'bsky-20', status: 'Pass', costUsd: 0.008084, costCny: 0.054971 },
  { name: 'bsky-21', status: 'Pass', costUsd: 0.00589, costCny: 0.040052 },
  { name: 'bsky-22', status: 'Pass', costUsd: 0.003624, costCny: 0.024643 },
  { name: 'bsky-23', status: 'Pass', costUsd: 0.006014, costCny: 0.040895 },
  { name: 'bsky-24', status: 'Pass', costUsd: 0.008769, costCny: 0.059629 },
  { name: 'bsky-25', status: 'Fail', costUsd: 0.00792, costCny: 0.053856 },
  { name: 'bsky-26', status: 'Pass', costUsd: 0.015029, costCny: 0.102197 },
  { name: 'bsky-27', status: 'Pass', costUsd: 0.01787, costCny: 0.121516 },
  { name: 'bsky-28', status: 'Pass', costUsd: 0.007984, costCny: 0.054291 },
  { name: 'bsky-29', status: 'Pass', costUsd: 0.008061, costCny: 0.054815 },
  { name: 'bsky-30', status: 'Pass', costUsd: 0.008167, costCny: 0.055536 },
  { name: 'element-01', status: 'Pass', costUsd: 0.003759, costCny: 0.025561 },
  { name: 'element-02', status: 'Pass', costUsd: 0.003846, costCny: 0.026153 },
  { name: 'element-03', status: 'Pass', costUsd: 0.010228, costCny: 0.06955 },
  { name: 'element-04', status: 'Pass', costUsd: 0.005737, costCny: 0.039012 },
  { name: 'element-05', status: 'Pass', costUsd: 0.005944, costCny: 0.040419 },
  { name: 'element-06', status: 'Fail', costUsd: 0.164932, costCny: 1.121538 },
  { name: 'element-07', status: 'Pass', costUsd: 0.005957, costCny: 0.040508 },
  { name: 'element-08', status: 'Pass', costUsd: 0.010123, costCny: 0.068836 },
  { name: 'element-09', status: 'Pass', costUsd: 0.00397, costCny: 0.026996 },
  { name: 'element-10', status: 'Pass', costUsd: 0.013151, costCny: 0.089427 },
  { name: 'element-11', status: 'Pass', costUsd: 0.005852, costCny: 0.039794 },
  { name: 'element-12', status: 'Pass', costUsd: 0.00585, costCny: 0.03978 },
  { name: 'element-13', status: 'Pass', costUsd: 0.010601, costCny: 0.072087 },
  { name: 'element-14', status: 'Pass', costUsd: 0.006018, costCny: 0.040922 },
  { name: 'element-15', status: 'Pass', costUsd: 0.008062, costCny: 0.054822 },
  { name: 'element-16', status: 'Pass', costUsd: 0.008285, costCny: 0.056338 },
  { name: 'element-17', status: 'Pass', costUsd: 0.00799, costCny: 0.054332 },
  { name: 'element-18', status: 'Pass', costUsd: 0.008144, costCny: 0.055379 },
  { name: 'element-19', status: 'Pass', costUsd: 0.015909, costCny: 0.108181 },
  { name: 'element-20', status: 'Pass', costUsd: 0.003783, costCny: 0.025724 },
  { name: 'element-21', status: 'Pass', costUsd: 0.009052, costCny: 0.061554 },
  { name: 'element-22', status: 'Pass', costUsd: 0.010728, costCny: 0.07295 },
  { name: 'element-23', status: 'Pass', costUsd: 0.008065, costCny: 0.054842 },
  {
    name: 'element-24',
    status: 'Pass',
    reportStatus: 'Partial',
    costUsd: 0.012886,
    costCny: 0.087625,
  },
  { name: 'element-25', status: 'Pass', costUsd: 0.005847, costCny: 0.03976 },
  { name: 'element-26', status: 'Pass', costUsd: 0.003806, costCny: 0.025881 },
  { name: 'element-27', status: 'Pass', costUsd: 0.015991, costCny: 0.108739 },
  { name: 'element-28', status: 'Pass', costUsd: 0.010031, costCny: 0.068211 },
  { name: 'element-29', status: 'Pass', costUsd: 0.010102, costCny: 0.068694 },
  { name: 'element-30', status: 'Pass', costUsd: 0.010073, costCny: 0.068496 },
] as const satisfies readonly AppControlBenchTask[];
