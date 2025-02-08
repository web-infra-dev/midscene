import type { PlanningAction } from '@/types';

export const repeatTime = 1;
export function makePlanResultStable(plans: PlanningAction[]) {
  return plans.map((plan) => {
    // Removing thinking makes the results stable for snapshot testing
    plan.thought = undefined;
    if (plan.param?.prompt) {
      plan.param.prompt = '';
    }
    if ('quickAnswer' in plan && plan.quickAnswer) {
      plan.quickAnswer = {
        reason: '',
        text: '',
      };
    }
    return plan;
  });
}
