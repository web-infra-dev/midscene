import {
  getSummary,
  parseActionFromVlm,
} from '@/ai-model/prompt/ui-tars-planning';
import { describe, expect, it } from 'vitest';

describe('parse action from vlm', () => {
  it('should parse action with Thought format', () => {
    const text = `Thought: 点击登录按钮
Action: click(start_box='(200,300,400,500)')`;

    const actions = parseActionFromVlm(text);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toEqual({
      reflection: null,
      thought: '点击登录按钮',
      action_type: 'click',
      action_inputs: {
        start_box: '[0.2,0.3,0.4,0.5]',
      },
    });
  });

  it('should parse action with Reflection format', () => {
    const text = `Action_Summary: 输入用户名
Action: type(content='username')`;

    const actions = parseActionFromVlm(text);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toEqual({
      thought: '输入用户名',
      action_type: 'type',
      reflection: null,
      action_inputs: {
        content: 'username',
      },
    });
  });

  it('should parse multiple actions', () => {
    const text = `Thought: 完成操作
Action: click(start_box='(100,200,300,400)')

type(content='test')`;

    const actions = parseActionFromVlm(text);
    expect(actions).toHaveLength(2);
    expect(actions[0].action_type).toBe('click');
    expect(actions[1].action_type).toBe('type');
  });

  it('should parse finished action', () => {
    const text = `Thought: 任务完成
Action: finished()`;

    const actions = parseActionFromVlm(text);
    expect(actions).toHaveLength(1);
    expect(actions[0].action_type).toBe('finished');
    expect(actions[0].action_inputs).toEqual({});
  });
});

describe('getSummary', () => {
  it('should extract summary from prediction text', () => {
    const text = `Reflection: Previous steps completed
Action_Summary: Click submit button
Action: click(start_box='(100,200,300,400)')`;

    const summary = getSummary(text);
    expect(summary).toBe(
      "Action_Summary: Click submit button\nAction: click(start_box='(100,200,300,400)')",
    );
  });

  it('should handle text without reflection', () => {
    const text = `Action_Summary: Type username
Action: type(content='user')`;

    const summary = getSummary(text);
    expect(summary).toBe(text);
  });
});
