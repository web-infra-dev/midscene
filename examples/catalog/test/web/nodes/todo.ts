import { type NodeDefinition, defineNode, z } from '@midscene/test';
import type { Page } from 'playwright';

const NEW_TODO_SELECTOR = '.new-todo';
const TODO_ITEM_SELECTOR = '.todo-list li';
const TODO_LABEL_SELECTOR = 'label';

const todoItemSchema = z.strictObject({
  title: z.string().trim().min(1).describe('Expected Todo title.'),
  completed: z
    .boolean()
    .describe('Whether the Todo should be in the completed state.'),
});

const seedInputSchema = z.strictObject({
  items: z
    .array(z.string().trim().min(1))
    .min(1)
    .describe('Todo titles to create, in order.'),
});

const expectStateInputSchema = z.strictObject({
  items: z
    .array(todoItemSchema)
    .describe('The exact ordered Todo list expected on the page.'),
});

const emptyInputSchema = z.strictObject({});

export interface TodoItemState {
  title: string;
  completed: boolean;
}

export interface TodoState {
  items: TodoItemState[];
  total: number;
  completed: number;
  remaining: number;
}

export interface CreateTodoNodesOptions<TContext> {
  getPage(context: TContext): Page | Promise<Page>;
}

const readTodoState = async (page: Page): Promise<TodoState> => {
  const itemLocators = page.locator(TODO_ITEM_SELECTOR);
  const total = await itemLocators.count();
  const items: TodoItemState[] = [];

  for (let index = 0; index < total; index += 1) {
    const item = itemLocators.nth(index);
    const title = (
      await item.locator(TODO_LABEL_SELECTOR).textContent()
    )?.trim();
    if (!title) {
      throw new Error(
        `Todo item ${index + 1} has no readable label at ${page.url()}.`,
      );
    }
    items.push({
      title,
      completed: await item.evaluate((element) =>
        element.classList.contains('completed'),
      ),
    });
  }

  const completed = items.filter((item) => item.completed).length;
  return {
    items,
    total,
    completed,
    remaining: total - completed,
  };
};

const assertExactItems = (
  page: Page,
  expected: readonly TodoItemState[],
  actual: readonly TodoItemState[],
): void => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) return;

  throw new Error(
    [
      `Todo state does not match at ${page.url()}.`,
      `Expected: ${JSON.stringify(expected, null, 2)}`,
      `Actual: ${JSON.stringify(actual, null, 2)}`,
    ].join('\n'),
  );
};

export function createTodoNodes<TContext>(
  options: CreateTodoNodesOptions<TContext>,
): readonly NodeDefinition<any, any, TContext>[] {
  const seedTodos = defineNode<typeof seedInputSchema, TodoState, TContext>({
    name: 'todo.seed',
    title: 'Seed the Todo list',
    description:
      'Reset TodoMVC and create an ordered list of Todos through the visible input.',
    inputSchema: seedInputSchema,
    async execute({ input, context, signal }) {
      const page = await options.getPage(context);
      const currentUrl = page.url();
      if (
        !currentUrl.startsWith('http://') &&
        !currentUrl.startsWith('https://')
      ) {
        throw new Error(
          `todo.seed requires an HTTP(S) page, but the current URL is ${currentUrl}. Run gotoUrl first.`,
        );
      }

      signal.throwIfAborted();
      await page.evaluate(() => window.localStorage.clear());
      await page.reload({ waitUntil: 'domcontentloaded' });

      const inputBox = page.locator(NEW_TODO_SELECTOR);
      await inputBox.waitFor({ state: 'visible', timeout: 10_000 });
      for (const title of input.items) {
        signal.throwIfAborted();
        await inputBox.fill(title);
        await inputBox.press('Enter');
      }

      await page
        .locator(TODO_ITEM_SELECTOR)
        .nth(input.items.length - 1)
        .waitFor({ state: 'visible', timeout: 10_000 });

      const state = await readTodoState(page);
      const expected = input.items.map((title) => ({
        title,
        completed: false,
      }));
      assertExactItems(page, expected, state.items);

      return {
        summary: `Created ${state.total} Todos through the TodoMVC UI.`,
        data: state,
      };
    },
  });

  const expectTodoState = defineNode<
    typeof expectStateInputSchema,
    TodoState,
    TContext
  >({
    name: 'todo.expectState',
    title: 'Expect the exact Todo state',
    description:
      'Read TodoMVC from the DOM and require the ordered titles and completed states to match exactly.',
    inputSchema: expectStateInputSchema,
    async execute({ input, context, signal }) {
      signal.throwIfAborted();
      const page = await options.getPage(context);
      const state = await readTodoState(page);
      assertExactItems(page, input.items, state.items);

      return {
        summary: `Verified ${state.total} Todos: ${state.completed} completed and ${state.remaining} remaining.`,
        data: state,
      };
    },
  });

  const captureTodoState = defineNode<
    typeof emptyInputSchema,
    TodoState,
    TContext
  >({
    name: 'todo.captureState',
    title: 'Capture the current Todo state',
    description:
      'Read the current TodoMVC DOM without asserting it, for lifecycle diagnostics and history.',
    inputSchema: emptyInputSchema,
    async execute({ context, signal }) {
      signal.throwIfAborted();
      const page = await options.getPage(context);
      const state = await readTodoState(page);
      return {
        summary: `Captured ${state.total} Todos: ${state.completed} completed and ${state.remaining} remaining.`,
        data: state,
      };
    },
  });

  return [seedTodos, expectTodoState, captureTodoState];
}
