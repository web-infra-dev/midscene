import { buildPlanningResponseExample } from '@/ai-model/prompt/planning';
import { describe, expect, it } from '@rstest/core';

describe('buildPlanningResponseExample', () => {
  it('builds a planning response with sub-goal state and an action', () => {
    expect(
      buildPlanningResponseExample({
        planning: 'Continue filling the registration form.',
        updateSubGoals: [
          {
            index: 1,
            status: 'finished',
            description: 'Fill the Name field',
          },
          {
            index: 2,
            status: 'pending',
            description: 'Fill the Email field',
          },
        ],
        markSubGoalsDone: [1],
        memory: 'The Name field contains John.',
        log: 'Type the email address',
        actionOutputExample: `<action-type>Input</action-type>
<action-param-json>
{
  "value": "john@example.com"
}
</action-param-json>`,
      }),
    ).toBe(`<planning>Continue filling the registration form.</planning>
<update-plan-content>
  <sub-goal index="1" status="finished">Fill the Name field</sub-goal>
  <sub-goal index="2" status="pending">Fill the Email field</sub-goal>
</update-plan-content>
<mark-sub-goal-done>
  <sub-goal index="1" status="finished" />
</mark-sub-goal-done>
<memory>The Name field contains John.</memory>
<log>Type the email address</log>
<action-type>Input</action-type>
<action-param-json>
{
  "value": "john@example.com"
}
</action-param-json>`);
  });

  it('builds a terminal planning response', () => {
    expect(
      buildPlanningResponseExample({
        planning: 'The task is complete.',
        markSubGoalsDone: [2, 3],
        complete: {
          success: true,
          message: 'john@example.com',
        },
      }),
    ).toBe(`<planning>The task is complete.</planning>
<mark-sub-goal-done>
  <sub-goal index="2" status="finished" />
  <sub-goal index="3" status="finished" />
</mark-sub-goal-done>
<complete success="true">john@example.com</complete>`);
  });

  it('prepends a response prefix', () => {
    expect(
      buildPlanningResponseExample({
        prefix: '<response-prefix>reasoning</response-prefix>',
        planning: 'Continue the task.',
        actionOutputExample: '<custom-action />',
      }),
    ).toBe(`<response-prefix>reasoning</response-prefix>
<planning>Continue the task.</planning>
<custom-action />`);
  });

  it('throws when no action output example is provided', () => {
    expect(() =>
      buildPlanningResponseExample({
        planning: 'Run an action.',
        log: 'Run the action',
        actionOutputExample: undefined,
      }),
    ).toThrow(
      'Cannot build planning response example without an action output example',
    );
  });
});
