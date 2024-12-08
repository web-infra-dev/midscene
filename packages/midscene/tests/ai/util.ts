import { preferCozeModel } from '@/ai-model/coze';
import type { PlanningAction } from '@/types';

export function makePlanResultStable(plans: PlanningAction[]) {
  return plans.map((plan) => {
    // Removing thinking makes the results stable for snapshot testing
    plan.thought = undefined;
    if (plan.param?.prompt) {
      plan.param.prompt = '';
    }
    if (plan.quickAnswer) {
      plan.quickAnswer.reason = '';
      plan.quickAnswer.text = '';
    }
    return plan;
  });
}

export const modelList: Array<'openAI' | 'coze'> = preferCozeModel('coze')
  ? ['openAI', 'coze']
  : ['openAI'];

export const repeatTime = 4;
