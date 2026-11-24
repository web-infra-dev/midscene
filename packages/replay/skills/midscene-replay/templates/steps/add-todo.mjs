import { defineStep } from '@midscene/replay';

const field = {
  candidates: [
    { xpath: '//header//input[@placeholder="What needs to be done?"]' },
  ],
  // Identity guard: re-finds the field without a model if the XPath breaks.
  guard: { tag: 'input', attr: { placeholder: 'What needs to be done?' } },
  fallback: 'guard',
};
const todoText = (params) => params.todo ?? '买牛奶';

// 1. 添加任务
export default defineStep({
  ready: (rp) =>
    rp.waitFor(() => Boolean(document.querySelector('.todoapp')), {
      timeoutMs: 5000,
    }),
  async run(rp, { params }) {
    const text = todoText(params);
    await rp.input('新任务输入框', { ...field, value: text });
    await rp.keyPress('在新任务输入框按 Enter', {
      candidates: [{ xpath: '//input[@placeholder="What needs to be done?"]' }],
      keyName: 'Enter',
    });
    return text;
  },
  done: (rp, { params }) =>
    rp.waitFor(
      (text) =>
        [...document.querySelectorAll('.todo-list label')].some(
          (label) => label.textContent.trim() === text,
        ),
      { args: [todoText(params)], timeoutMs: 3000 },
    ),
});
