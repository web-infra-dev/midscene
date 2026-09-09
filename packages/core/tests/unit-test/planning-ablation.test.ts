import { getModelRuntime } from '@/ai-model/models';
import {
  PLANNING_ABLATION_PARTS,
  parsePlanningAblation,
  readPlanningAblation,
  resolvePlanningFeatures,
  validatePlanningAblation,
} from '@/ai-model/workflows/planning/ablation';
import { ConversationHistory } from '@/ai-model/workflows/planning/conversation-history';
import { filterPlanningReplay } from '@/ai-model/workflows/planning/planning-replay';
import { MIDSCENE_PLANNING_DISABLE_PARTS } from '@midscene/shared/env';
import { afterEach, describe, expect, it, rs } from '@rstest/core';

const runtime = () =>
  getModelRuntime({
    modelName: 'test-model',
    modelDescription: 'test',
    modelFamily: 'qwen2.5-vl',
    intent: 'planning',
    slot: 'planning',
  });

afterEach(() => {
  rs.unstubAllEnvs();
});

describe('Planning ablation configuration', () => {
  it('keeps the empty baseline and expands, trims, deduplicates and freezes CSV parts', () => {
    expect(parsePlanningAblation()).toEqual([]);
    expect(parsePlanningAblation(' , ')).toEqual([]);
    const parts = parsePlanningAblation(
      ' memory, examples,subGoals,memory,ruleExamples ',
    );
    expect(parts).toEqual([
      'subGoals',
      'memory',
      'ruleExamples',
      'subGoalExample',
      'actionExamples',
      'multiTurnExample',
    ]);
    expect(Object.isFrozen(parts)).toBe(true);
    expect(
      parsePlanningAblation('taskSemantics,uiCases,actionStrategies'),
    ).toEqual([
      'taskScope',
      'durableCompletion',
      'processEvidence',
      'scrollableOptions',
      'inputVerification',
      'assertionTiming',
      'recoveryGuidance',
      'adbPreference',
      'sliderSwipe',
      'incrementalEdit',
      'navigationRestriction',
    ]);
    expect(
      parsePlanningAblation(PLANNING_ABLATION_PARTS.join(',')),
    ).toHaveLength(23);
  });

  it('reads the registered environment key and rejects typos', () => {
    rs.stubEnv(MIDSCENE_PLANNING_DISABLE_PARTS, 'memory,log');
    expect(readPlanningAblation()).toEqual(['memory', 'log']);
    expect(() => parsePlanningAblation('memroy')).toThrow(
      'Unknown MIDSCENE_PLANNING_DISABLE_PARTS part: "memroy"',
    );
    expect(() => parsePlanningAblation('toString')).toThrow('Unknown');
  });

  it('keeps memory and thought independent of sub-goals and distinguishes fast logs from no logs', () => {
    expect(resolvePlanningFeatures('deepThink', ['subGoals'])).toMatchObject({
      includeSubGoals: false,
      includeMemory: true,
      includeThought: true,
      logSource: 'model',
      useSubGoalHistory: true,
    });
    expect(resolvePlanningFeatures('fast', [])).toMatchObject({
      includeThought: false,
      logSource: 'action',
    });
    expect(resolvePlanningFeatures('fast', ['log'])).toMatchObject({
      logSource: 'none',
    });
  });

  it('rejects unfilterable adapters only for active experiments', () => {
    const model = runtime();
    model.adapter = {
      ...model.adapter,
      planning: { ...model.adapter.planning, kind: 'custom', planFn: rs.fn() },
    };
    expect(() => validatePlanningAblation([], model)).not.toThrow();
    expect(() => validatePlanningAblation(['memory'], model)).toThrow(
      'standard planning adapter',
    );
    const replayModel = runtime();
    replayModel.adapter = {
      ...replayModel.adapter,
      chatCompletion: {
        ...replayModel.adapter.chatCompletion,
        replayRawAssistantMessage: true,
      },
    };
    expect(() => validatePlanningAblation(['memory'], replayModel)).toThrow(
      'verbatim assistant replay',
    );
    expect(() =>
      validatePlanningAblation(['multiTurnExample'], replayModel),
    ).not.toThrow();
  });

  it('binds the experiment to a fresh history and rejects changes until reset', () => {
    const history = new ConversationHistory();
    history.configurePlanningAblation(['memory']);
    history.append({ role: 'assistant', content: 'test' });
    history.configurePlanningAblation(['memory']);
    expect(() => history.configurePlanningAblation([])).toThrow(
      'cannot change',
    );
    history.reset();
    history.configurePlanningAblation([]);
    const seeded = new ConversationHistory({
      initialMessages: [{ role: 'assistant', content: '<memory>old</memory>' }],
    });
    expect(() => seeded.configurePlanningAblation(['memory'])).toThrow(
      'fresh conversation',
    );
  });
});

describe('Planning assistant replay projection', () => {
  const action = `<action-type>Input</action-type>\n<action-param-json>\n${JSON.stringify(
    {
      value:
        'Literal <memory>user text</memory>, </action-param-json>, <log>text</log>, "quoted"',
    },
  )}\n</action-param-json>`;

  it('preserves action JSON, terminal messages and all-on response bytes', () => {
    const content = `<planning>think</planning><memory>remember</memory><log>next</log>${action}`;
    expect(filterPlanningReplay(content, [])).toBe(content);
    expect(
      filterPlanningReplay(content, ['memory', 'log', 'planningText']),
    ).toBe(action);
    for (const terminal of ['<complete success="true">', '<error>']) {
      const close = terminal.startsWith('<complete')
        ? '</complete>'
        : '</error>';
      const message = `${terminal}Literal <memory>user text</memory>${close}`;
      expect(filterPlanningReplay(message, ['memory'])).toBe(message);
    }
  });

  it('handles half-open action tags without replaying later disabled fields', () => {
    const content =
      '<action-type>Input<log>secret</log><action-param-json>{"value":"hello"}<memory>secret</memory>';
    expect(filterPlanningReplay(content, ['memory', 'log'])).toBe(
      '<action-type>Input<action-param-json>{"value":"hello"}',
    );
    expect(() =>
      filterPlanningReplay(
        '<action-param-json>{"value":"unterminated<memory>secret</memory>',
        ['memory'],
      ),
    ).toThrow('unterminated action-param-json');
  });

  it('removes repeated, mixed-case, nested, half-open and self-closing disabled fields', () => {
    const content = `<MEMORY>one</MEMORY><memory>two<memory>nested</memory>tail</memory><memory /><memory>unfinished${action}<memory>trailing`;
    expect(filterPlanningReplay(content, ['memory'])).toBe(action);
    expect(
      filterPlanningReplay('<memory>outer<log>nested note</log>tail</memory>', [
        'memory',
      ]),
    ).toBe('');
    const goals =
      '<update-plan-content><sub-goal index="1" status="pending">one</sub-goal></update-plan-content>' +
      '<mark-sub-goal-done><sub-goal index="1" status="finished" /></mark-sub-goal-done>';
    expect(filterPlanningReplay(goals + action, ['subGoals'])).toBe(action);
  });
});
