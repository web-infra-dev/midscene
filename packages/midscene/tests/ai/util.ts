import { useCozeModel } from '@/ai-model/coze';
import type { PlanningAction } from '@/types';

export function makePlanResultStable(plans: PlanningAction[]) {
  return plans.map((plan) => {
    // Removing thinking makes the results stable for snapshot testing
    plan.thought = undefined;
    if (plan.param?.prompt) {
      plan.param.prompt = '';
    }
    return plan;
  });
}

export const modelList: Array<'openAI' | 'coze'> = useCozeModel('coze')
  ? ['openAI', 'coze']
  : ['openAI'];

export const repeatTime = process.env.GITHUB_ACTIONS ? 2 : 1;
