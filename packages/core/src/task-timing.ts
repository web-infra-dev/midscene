import type { ExecutionTask } from '@/types';
import { getDebug } from '@midscene/shared/logger';

const debugTiming = getDebug('task-timing');

type ExecutionTaskTiming = NonNullable<ExecutionTask['timing']>;

type NumericTimingField = {
  [K in keyof ExecutionTaskTiming]-?: ExecutionTaskTiming[K] extends
    | number
    | undefined
    ? K
    : never;
}[keyof ExecutionTaskTiming];

export type TimingSettableField = Exclude<
  NumericTimingField,
  'start' | 'end' | 'cost'
>;

export function setTimingFieldOnce(
  timing: ExecutionTaskTiming | undefined,
  field: TimingSettableField,
): void {
  if (!timing) {
    debugTiming(`[warning] timing object missing, skip set. field=${field}`);
    return;
  }

  const value = Date.now();
  const existingValue = timing[field];
  if (existingValue !== undefined) {
    debugTiming(
      `[warning] duplicate timing field set ignored. field=${field}, existing=${existingValue}, incoming=${value}`,
    );
    return;
  }

  timing[field] = value;
}
