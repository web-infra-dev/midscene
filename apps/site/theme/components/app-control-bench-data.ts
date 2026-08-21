export type AppControlBenchStatus = 'Pass' | 'Partial' | 'Fail';

export interface AppControlBenchTask {
  name: string;
  status: AppControlBenchStatus;
  costUsd: number;
  costCny: number;
}

export const APP_CONTROL_BENCH_REPORT_BASE_URL =
  'https://lf3-static.bytednsdoc.com/obj/eden-cn/luljzkpt/ljhwZthlaukjlkulzlp/benchmark/AppControlBench/20260821/';

export const APP_CONTROL_BENCH_TASKS = [
  { name: 'bsky-01', status: 'Pass', costUsd: 0.003531, costCny: 0.024011 },
  { name: 'bsky-02', status: 'Pass', costUsd: 0.003629, costCny: 0.024677 },
  { name: 'bsky-03', status: 'Pass', costUsd: 0.007626, costCny: 0.051857 },
  { name: 'bsky-04', status: 'Pass', costUsd: 0.003696, costCny: 0.025133 },
  { name: 'bsky-05', status: 'Pass', costUsd: 0.003642, costCny: 0.024766 },
  { name: 'bsky-06', status: 'Pass', costUsd: 0.008092, costCny: 0.055026 },
  { name: 'bsky-07', status: 'Pass', costUsd: 0.003569, costCny: 0.024269 },
  { name: 'bsky-08', status: 'Pass', costUsd: 0.011374, costCny: 0.077343 },
  { name: 'bsky-09', status: 'Pass', costUsd: 0.007767, costCny: 0.052816 },
  { name: 'bsky-10', status: 'Pass', costUsd: 0.005506, costCny: 0.037441 },
  { name: 'bsky-11', status: 'Pass', costUsd: 0.003677, costCny: 0.025004 },
  { name: 'bsky-12', status: 'Pass', costUsd: 0.00359, costCny: 0.024412 },
  { name: 'bsky-13', status: 'Pass', costUsd: 0.00371, costCny: 0.025228 },
  { name: 'bsky-14', status: 'Pass', costUsd: 0.009726, costCny: 0.066137 },
  { name: 'bsky-15', status: 'Pass', costUsd: 0.009867, costCny: 0.067096 },
  { name: 'bsky-16', status: 'Pass', costUsd: 0.015284, costCny: 0.103931 },
  { name: 'bsky-17', status: 'Pass', costUsd: 0.005456, costCny: 0.037101 },
  { name: 'bsky-18', status: 'Pass', costUsd: 0.003682, costCny: 0.025038 },
  { name: 'bsky-19', status: 'Pass', costUsd: 0.007605, costCny: 0.051714 },
  { name: 'bsky-20', status: 'Pass', costUsd: 0.007522, costCny: 0.05115 },
  { name: 'bsky-21', status: 'Pass', costUsd: 0.005447, costCny: 0.03704 },
  { name: 'bsky-22', status: 'Pass', costUsd: 0.003594, costCny: 0.024439 },
  { name: 'bsky-23', status: 'Pass', costUsd: 0.005488, costCny: 0.037318 },
  { name: 'bsky-24', status: 'Pass', costUsd: 0.007723, costCny: 0.052516 },
  { name: 'bsky-25', status: 'Fail', costUsd: 0.007586, costCny: 0.051585 },
  { name: 'bsky-26', status: 'Pass', costUsd: 0.012874, costCny: 0.087543 },
  { name: 'bsky-27', status: 'Pass', costUsd: 0.014686, costCny: 0.099865 },
  { name: 'bsky-28', status: 'Pass', costUsd: 0.007516, costCny: 0.051109 },
  { name: 'bsky-29', status: 'Pass', costUsd: 0.007542, costCny: 0.051286 },
  { name: 'bsky-30', status: 'Pass', costUsd: 0.0103, costCny: 0.07004 },
  { name: 'element-01', status: 'Pass', costUsd: 0.003456, costCny: 0.023501 },
  { name: 'element-02', status: 'Pass', costUsd: 0.003565, costCny: 0.024242 },
  { name: 'element-03', status: 'Pass', costUsd: 0.009645, costCny: 0.065586 },
  { name: 'element-04', status: 'Pass', costUsd: 0.005503, costCny: 0.03742 },
  { name: 'element-05', status: 'Pass', costUsd: 0.005671, costCny: 0.038563 },
  { name: 'element-06', status: 'Fail', costUsd: 0.132054, costCny: 0.897967 },
  { name: 'element-07', status: 'Pass', costUsd: 0.006366, costCny: 0.043289 },
  { name: 'element-08', status: 'Pass', costUsd: 0.009557, costCny: 0.064988 },
  { name: 'element-09', status: 'Pass', costUsd: 0.00377, costCny: 0.025636 },
  { name: 'element-10', status: 'Pass', costUsd: 0.011454, costCny: 0.077887 },
  { name: 'element-11', status: 'Pass', costUsd: 0.005503, costCny: 0.03742 },
  { name: 'element-12', status: 'Pass', costUsd: 0.00572, costCny: 0.038896 },
  { name: 'element-13', status: 'Pass', costUsd: 0.009667, costCny: 0.065736 },
  { name: 'element-14', status: 'Pass', costUsd: 0.005643, costCny: 0.038372 },
  { name: 'element-15', status: 'Pass', costUsd: 0.007733, costCny: 0.052584 },
  { name: 'element-16', status: 'Pass', costUsd: 0.007687, costCny: 0.052272 },
  { name: 'element-17', status: 'Pass', costUsd: 0.052733, costCny: 0.358584 },
  { name: 'element-18', status: 'Pass', costUsd: 0.007588, costCny: 0.051598 },
  { name: 'element-19', status: 'Pass', costUsd: 0.013745, costCny: 0.093466 },
  { name: 'element-20', status: 'Pass', costUsd: 0.003576, costCny: 0.024317 },
  { name: 'element-21', status: 'Pass', costUsd: 0.008158, costCny: 0.055474 },
  { name: 'element-22', status: 'Pass', costUsd: 0.014079, costCny: 0.095737 },
  { name: 'element-23', status: 'Pass', costUsd: 0.007588, costCny: 0.051598 },
  { name: 'element-24', status: 'Pass', costUsd: 0.011894, costCny: 0.080879 },
  { name: 'element-25', status: 'Pass', costUsd: 0.005549, costCny: 0.037733 },
  { name: 'element-26', status: 'Pass', costUsd: 0.003667, costCny: 0.024936 },
  { name: 'element-27', status: 'Pass', costUsd: 0.005574, costCny: 0.037903 },
  { name: 'element-28', status: 'Pass', costUsd: 0.009652, costCny: 0.065634 },
  { name: 'element-29', status: 'Pass', costUsd: 0.009865, costCny: 0.067082 },
  { name: 'element-30', status: 'Pass', costUsd: 0.009769, costCny: 0.066429 },
] as const satisfies readonly AppControlBenchTask[];
