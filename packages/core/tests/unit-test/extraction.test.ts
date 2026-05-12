import { parseXMLExtractionResponse } from '@/ai-model/prompt/extraction';
import { describe, expect, it } from 'vitest';

describe('parseXMLExtractionResponse', () => {
  it('should parse complete XML response with all fields', () => {
    const xml = `
<thought>According to the screenshot, I can see a user profile with name, age, and admin status</thought>
<data-json>
{
  "name": "John",
  "age": 30,
  "isAdmin": true
}
</data-json>
<errors>[]</errors>
    `.trim();

    const result = parseXMLExtractionResponse<{
      name: string;
      age: number;
      isAdmin: boolean;
    }>(xml);

    expect(result).toEqual({
      thought:
        'According to the screenshot, I can see a user profile with name, age, and admin status',
      data: {
        name: 'John',
        age: 30,
        isAdmin: true,
      },
    });
  });

  it('should parse XML response with only required data field', () => {
    const xml = `
<data-json>
{
  "title": "Todo List"
}
</data-json>
    `.trim();

    const result = parseXMLExtractionResponse<{ title: string }>(xml);

    expect(result).toEqual({
      data: {
        title: 'Todo List',
      },
    });
  });

  it('should parse XML response with array data', () => {
    const xml = `
<thought>I found three todo items in the list</thought>
<data-json>
["todo 1", "todo 2", "todo 3"]
</data-json>
    `.trim();

    const result = parseXMLExtractionResponse<string[]>(xml);

    expect(result).toEqual({
      thought: 'I found three todo items in the list',
      data: ['todo 1', 'todo 2', 'todo 3'],
    });
  });

  it('should parse XML response with string data', () => {
    const xml = `
<thought>The page title is "todo list"</thought>
<data-json>
"todo list"
</data-json>
    `.trim();

    const result = parseXMLExtractionResponse<string>(xml);

    expect(result).toEqual({
      thought: 'The page title is "todo list"',
      data: 'todo list',
    });
  });

  it('should parse XML response with boolean data', () => {
    const xml = `
<thought>This is the SMS page</thought>
<data-json>
{ "result": true }
</data-json>
    `.trim();

    const result = parseXMLExtractionResponse<{ result: boolean }>(xml);

    expect(result).toEqual({
      thought: 'This is the SMS page',
      data: { result: true },
    });
  });

  it('should parse XML response with errors', () => {
    const xml = `
<thought>Failed to extract some data</thought>
<data-json>
{
  "name": "John"
}
</data-json>
<errors>
["Age field not found", "Admin status unclear"]
</errors>
    `.trim();

    const result = parseXMLExtractionResponse<{ name: string }>(xml);

    expect(result).toEqual({
      thought: 'Failed to extract some data',
      data: {
        name: 'John',
      },
      errors: ['Age field not found', 'Admin status unclear'],
    });
  });

  it('should parse XML response with number data', () => {
    const xml = `
<data-json>
42
</data-json>
    `.trim();

    const result = parseXMLExtractionResponse<number>(xml);

    expect(result).toEqual({
      data: 42,
    });
  });

  it('should handle multiline JSON in data-json', () => {
    const xml = `
<thought>
  Extracting complex data structure
  from the screenshot
</thought>
<data-json>
{
  "users": [
    {
      "name": "Alice",
      "role": "admin"
    },
    {
      "name": "Bob",
      "role": "user"
    }
  ]
}
</data-json>
    `.trim();

    const result = parseXMLExtractionResponse<{
      users: Array<{ name: string; role: string }>;
    }>(xml);

    expect(result.data).toEqual({
      users: [
        { name: 'Alice', role: 'admin' },
        { name: 'Bob', role: 'user' },
      ],
    });
  });

  it('should throw error when data-json is missing', () => {
    const xml = `
<thought>Some thought</thought>
<errors>[]</errors>
    `.trim();

    expect(() => parseXMLExtractionResponse(xml)).toThrow(
      'Missing required field: data-json',
    );
  });

  it('should throw error when data-json is invalid JSON', () => {
    const xml = `
<thought>Some thought</thought>
<data-json>
{invalid json}
</data-json>
    `.trim();

    expect(() => parseXMLExtractionResponse(xml)).toThrow(
      'Failed to parse data-json',
    );
  });

  it('should throw error when data-json is markdown text instead of JSON', () => {
    const xml = `
<thought>根据蓝色框选中的模块，提取到两个子页面：工具入口对比页、协商工具展示页，按照要求整理每个页面的信息如下。</thought>
<data-json>
# 页面名：工具入口（BEFORE/AFTER对比）
# 页面描述：展示订单协商工具入口改造前后的界面对比，呈现不同阶段的订单列表页面样式，体现设计优化方向
# 页面操作动线：1. 进入订单列表页 查看原无协商入口界面（BEFORE区） 查看优化后带协商入口界面（AFTER区）
# 复用组件：列表卡片、操作按钮、表头导航
# 交互规则：列表滚动展示、入口按钮点击跳转至协商页面

---

# 页面名：协商工具
# 页面描述：展示订单协商工具展开后的完整侧边弹窗界面，呈现协商内容的完整布局
# 页面操作动线：点击订单入口唤起协商工具侧边栏 查看完整协商订单信息与操作选项
# 复用组件：侧边弹窗、列表卡片、操作按钮、内容区块
# 交互规则：侧边弹窗展开/收起、内容区域滚动、操作按钮跳转对应协商流程
</data-json>
<errors>[]</errors>
    `.trim();

    expect(() => parseXMLExtractionResponse(xml)).toThrow(
      'Failed to parse data-json',
    );
  });

  it('should ignore invalid errors field', () => {
    const xml = `
<data-json>
{"value": 123}
</data-json>
<errors>
invalid json array
</errors>
    `.trim();

    const result = parseXMLExtractionResponse<{ value: number }>(xml);

    expect(result).toEqual({
      data: { value: 123 },
    });
  });

  it('should handle case-insensitive tag matching', () => {
    const xml = `
<THOUGHT>Case insensitive thought</THOUGHT>
<DATA-JSON>
{"result": "success"}
</DATA-JSON>
    `.trim();

    const result = parseXMLExtractionResponse<{ result: string }>(xml);

    expect(result.thought).toBe('Case insensitive thought');
    expect(result.data).toEqual({ result: 'success' });
  });

  it('should parse nested objects correctly', () => {
    const xml = `
<thought>Extracting nested data</thought>
<data-json>
{
  "user": {
    "profile": {
      "name": "Alice",
      "settings": {
        "theme": "dark",
        "notifications": true
      }
    }
  }
}
</data-json>
    `.trim();

    const result = parseXMLExtractionResponse<{
      user: {
        profile: {
          name: string;
          settings: { theme: string; notifications: boolean };
        };
      };
    }>(xml);

    expect(result.data.user.profile.name).toBe('Alice');
    expect(result.data.user.profile.settings.theme).toBe('dark');
  });

  it('should not include errors field when errors array is empty', () => {
    const xml = `
<data-json>
{"value": 100}
</data-json>
<errors>[]</errors>
    `.trim();

    const result = parseXMLExtractionResponse<{ value: number }>(xml);

    expect(result).toEqual({
      data: { value: 100 },
    });
    expect(result.errors).toBeUndefined();
  });
});
