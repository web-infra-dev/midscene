import type { SubGoalStatus } from '@/types';

type PlanningSubGoalExample = {
  index: number;
  status: Extract<SubGoalStatus, 'pending' | 'finished'>;
  description: string;
};

type PlanningResponseActionOutputExample = {
  log?: string;
  actionOutputExample: string | undefined;
  complete?: never;
};

type PlanningResponseCompleteExample = {
  complete: {
    success: boolean;
    message: string;
  };
  log?: never;
  actionOutputExample?: never;
};

type BuildPlanningResponseExampleInput = {
  planning?: string;
  updateSubGoals?: PlanningSubGoalExample[];
  markSubGoalsDone?: number[];
  memory?: string;
} & (PlanningResponseActionOutputExample | PlanningResponseCompleteExample);

export const buildPlanningResponseExample = (
  input: BuildPlanningResponseExampleInput,
) => {
  const sections = input.planning
    ? [`<planning>${input.planning}</planning>`]
    : [];

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
    if (!input.actionOutputExample) {
      throw new Error(
        'Cannot build planning response example without an action output example',
      );
    }
    if (input.log) {
      sections.push(`<log>${input.log}</log>`);
    }
    sections.push(input.actionOutputExample);
  }

  return sections.join('\n');
};
