import { defineStep } from '@midscene/replay/experimental';

const rowOf = (text) => {
  const normalized = text.trim().replace(/\s+/g, ' ');
  const parts = normalized.split('"').map((part) => `"${part}"`);
  const literal =
    parts.length === 1 ? parts[0] : `concat(${parts.join(`, '"', `)})`;
  return `//ul[contains(@class,"todo-list")]/li[.//label[normalize-space(.)=${literal}]]`;
};
// Prefer the previous step's result; fall back to params when started here.
const todoText = ({ results, params }) =>
  results['add-todo'] ?? params.todo ?? '买牛奶';
const checkbox = (ctx) => ({
  within: { xpath: rowOf(todoText(ctx)) },
  candidates: [{ xpath: './/div//input[@type="checkbox"]' }],
  guard: { tag: 'input', attr: { type: 'checkbox' } },
  fallback: 'guard',
});
const isComplete = (text, expected) => {
  const rows = [...document.querySelectorAll('.todo-list li')].filter(
    (row) => row.querySelector('label')?.textContent.trim() === text,
  );
  return (
    rows.length === 1 && rows[0].classList.contains('completed') === expected
  );
};

// 2. 勾选完成该任务
export default defineStep({
  id: 'complete-todo',
  title: '勾选完成该任务',
  // Toggling twice would undo it: never repeat after dispatch.
  retry: 'before-dispatch',
  // Entry check: required to start a run at this step.
  ready: (rp, ctx) =>
    rp.waitFor(isComplete, {
      args: [todoText(ctx), false],
      timeoutMs: 3000,
    }),
  run: (rp, ctx) => rp.tap('该任务行的完成勾选框', checkbox(ctx)),
  async done(rp, ctx) {
    await rp.waitFor(isComplete, {
      args: [todoText(ctx), true],
      timeoutMs: 3000,
    });
    await rp.checkpoint(
      '剩余任务数',
      () => document.querySelector('.todo-count')?.textContent.trim(),
      { expect: '0 items left', screenshot: true },
    );
  },
});
