import { defineReplay } from '@midscene/replay/experimental';
import addTodo from './steps/add-todo.mjs';
import completeTodo from './steps/complete-todo.mjs';

// The whole delivery is this folder. A host runs it with:
//   import replay from './replay/index.mjs';
//   await replay.run(existingAgent, { params: { todo: '买牛奶' } });
export default defineReplay({
  meta: {
    platform: 'web',
    startUrl: 'https://todomvc.com/examples/javascript-es5/dist/',
  },
  steps: [addTodo, completeTodo],
});
