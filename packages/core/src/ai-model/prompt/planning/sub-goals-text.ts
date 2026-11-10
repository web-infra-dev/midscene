import type { SubGoal } from '@/types';

export const buildSubGoalsText = (subGoals: readonly SubGoal[]): string => {
  if (subGoals.length === 0) {
    return '';
  }

  const lines = subGoals.map(
    (goal) => `${goal.index}. ${goal.description} (${goal.status})`,
  );

  // Running goal takes priority, otherwise show the first pending goal.
  const currentGoal =
    subGoals.find((goal) => goal.status === 'running') ||
    subGoals.find((goal) => goal.status === 'pending');

  let currentGoalText = '';
  if (currentGoal) {
    currentGoalText = `\nCurrent sub-goal is: ${currentGoal.description}`;
    if (currentGoal.logs?.length) {
      const logLines = currentGoal.logs.map((log) => `- ${log}`).join('\n');
      currentGoalText += `\nActions performed for current sub-goal:\n${logLines}`;
    }
  }

  return `Sub-goals:\n${lines.join('\n')}${currentGoalText}`;
};
