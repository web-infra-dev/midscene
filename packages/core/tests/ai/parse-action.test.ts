import { getSummary } from '@/ai-model/prompt/ui-tars-planning';
import { actionParser } from '@ui-tars/action-parser';
import { describe, expect, it } from 'vitest';

describe('parse action from vlm', () => {
  it('should parse action with no Thought format', () => {
    const text = `点击登录按钮
  Action: click(start_box='(200,300,400,500)')`;

    const { parsed } = actionParser({
      prediction: text,
      factor: 1000,
    });
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchInlineSnapshot(`
      {
        "action_inputs": {
          "start_box": "[0.2,0.3,0.4,0.5]",
        },
        "action_type": "click",
        "reflection": null,
        "thought": "",
      }
    `);
  });

  it('should parse action with Thought format', () => {
    const text = `Thought: 点击登录按钮
  Action: click(start_box='(200,300,400,500)')`;

    const { parsed } = actionParser({
      prediction: text,
      factor: 1000,
    });
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchInlineSnapshot(`
      {
        "action_inputs": {
          "start_box": "[0.2,0.3,0.4,0.5]",
        },
        "action_type": "click",
        "reflection": null,
        "thought": "点击登录按钮",
      }
    `);
  });

  it('should parse action with Thought format2', () => {
    const text = `Thought: To proceed with the task of opening Twitter and posting a tweet, I need to first access the Google search page. The highlighted "Google 搜索" button is the appropriate element to interact with, as it will allow me to search for Twitter and navigate to its website.
   Click on the "Google 搜索" button to initiate a search for Twitter.
Action: click(start_box='(460,452)')`;

    const { parsed } = actionParser({
      prediction: text,
      factor: 1000,
    });
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchInlineSnapshot(`
      {
        "action_inputs": {
          "start_box": "[0.46,0.452,0.46,0.452]",
        },
        "action_type": "click",
        "reflection": null,
        "thought": "To proceed with the task of opening Twitter and posting a tweet, I need to first access the Google search page. The highlighted "Google 搜索" button is the appropriate element to interact with, as it will allow me to search for Twitter and navigate to its website.
         Click on the "Google 搜索" button to initiate a search for Twitter.",
      }
    `);
  });
  //
  it('should parse action with Reflection format', () => {
    const text = `Action_Summary: 输入用户名
Action: type(content='username')`;

    const { parsed } = actionParser({
      prediction: text,
      factor: 1000,
    });
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchInlineSnapshot(`
      {
        "action_inputs": {
          "content": "username",
        },
        "action_type": "type",
        "reflection": null,
        "thought": "输入用户名",
      }
    `);
  });

  it('should parse multiple actions', () => {
    const text = `Thought: 完成操作
Action: click(start_box='(100,200,300,400)')

type(content='test')`;

    const { parsed } = actionParser({
      prediction: text,
      factor: 1000,
    });
    expect(parsed).toHaveLength(2);
    expect(parsed[0].action_type).toBe('click');
    expect(parsed[1].action_type).toBe('type');
  });

  it('should parse finished action', () => {
    const text = `Thought: 任务完成
Action: finished()`;

    const { parsed } = actionParser({
      prediction: text,
      factor: 1000,
    });
    expect(parsed).toHaveLength(1);
    expect(parsed[0].action_type).toBe('finished');
    expect(parsed[0].action_inputs).toEqual({});
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
