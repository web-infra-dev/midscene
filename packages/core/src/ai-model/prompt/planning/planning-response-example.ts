import type { SubGoalStatus } from '@/types';

type PlanningSubGoalExample = {
  index: number;
  status: Extract<SubGoalStatus, 'pending' | 'finished'>;
  description: string;
};

type PlanningResponseActionExample = {
  log: string;
  actionExample: string | undefined;
  complete?: never;
};

type PlanningResponseCompleteExample = {
  complete: {
    success: boolean;
    message: string;
  };
  log?: never;
  actionExample?: never;
};

type BuildPlanningResponseExampleInput = {
  planning: string;
  updateSubGoals?: PlanningSubGoalExample[];
  markSubGoalsDone?: number[];
  memory?: string;
} & (PlanningResponseActionExample | PlanningResponseCompleteExample);

export const buildPlanningResponseExample = (
  input: BuildPlanningResponseExampleInput,
) => {
  const sections = [`<planning>${input.planning}</planning>`];

  if (input.updateSubGoals?.length) {
    const subGoals = input.updateSubGoals
      .map(
        ({ index, status, description }) =>
          `  <sub-goal index="${index}" status="${status}">${description}</sub-goal>`,
      )
      .join('\n');
    sections.push(`<update-plan-content>\n${subGoals}\n</update-plan-content>`);
  }

  if (input.markSubGoalsDone?.length) {
    const subGoals = input.markSubGoalsDone
      .map((index) => `  <sub-goal index="${index}" status="finished" />`)
      .join('\n');
    sections.push(`<mark-sub-goal-done>\n${subGoals}\n</mark-sub-goal-done>`);
  }

  if (input.memory) {
    sections.push(`<memory>${input.memory}</memory>`);
  }

  if (input.complete) {
    sections.push(
      `<complete success="${input.complete.success}">${input.complete.message}</complete>`,
    );
  } else {
    if (!input.actionExample) {
      throw new Error(
        'Cannot build planning response example without an action example',
      );
    }
    sections.push(`<log>${input.log}</log>`, input.actionExample);
  }

  return sections.join('\n');
};
