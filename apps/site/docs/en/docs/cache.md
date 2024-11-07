# Cache

Midscene.js provides AI caching features to improve the stability and speed of the entire AI execution process. The cache mainly refers to caching how AI recognizes page elements. Cached AI query results are used if page elements haven't changed.

## Instructions

Currently, the caching capability is supported in all scenarios, and Midscene can support file-level caching.

**Usage**

```diff
- playwright test --config=playwright.config.ts
+ MIDSCENE_CACHE=true playwright test --config=playwright.config.ts
```

**Effect**

After enabling the cache, the execution time is significantly reduced, for example, from 1m16s to 23s.

* **before**

![](/cache/no-cache-time.png)

* **after**

![](/cache/use-cache-time.png)


## Cache Content

Currently, Midscene's caching strategy in all scenarios is mainly based on the test file unit. AI behavior in each test file will be cached. The cached content is mainly divided into two categories:

* AI's planning for tasks (Planning, i.e., the results of ai and aiAction methods)
* AI's recognition of elements

The content of `aiQuery` will not be cached, so you can use `aiQuery` to confirm whether the previous AI tasks meet expectations.

**Task Planning**

```js
await ai("Move the mouse to the second task and click the delete button on the right side of the task");
```

The above task planning will be decomposed into:

```js
Hover: Move the mouse to the second task "Learn JS today"
Click: Click the delete button on the right side of the task "Learn JS today"
```

When the URL address and page width and height have not changed, enabling the cache will directly cache the results of the above tasks.

**Element Recognition**

After the AI has planned the user's instructions into tasks, it needs to operate on specific elements, so the AI's element recognition capability is needed. For example, the following task:

```js
Hover: Move the mouse to the second task "Learn JS today"
```

The above element recognition will be converted into specific element recognition:

```js
Text Element: "Learn JS today"
Left: 200
Top: 300
Width: 100
Height: 30
```

## Cache Strategy

When using the `MIDSCENE_CACHE=true` environment variable, caching will be automatically performed according to Playwright's test groups:

```ts
// todo-mvc.spec.ts
import { expect } from 'playwright/test';
import { test } from './fixture';

test.beforeEach(async ({ page }) => {
  await page.goto("https://todomvc.com/examples/react/dist/");
});

test('ai todo', async ({ page, ai, aiQuery }) => {
  await ai("Enter \"Learn JS today\" in the task box, then press Enter to create");
});

test('ai todo2', async ({ page, ai, aiQuery }) => {
  await ai("Enter \"Learn JS today\" in the task box, then press Enter to create");
});
```

The above `test` will generate caches along the dimensions of `ai todo` and `ai todo2`, and `todo-mvc.spec.ts-1.json` and `todo-mvc.spec.ts-2.json` cache files will be generated in the `midscene/midscene_run/cache` directory in the project root.

**Cache File Introduction**

```json
{
  "pkgName": "@midscene/web",
  // The midscene version currently in use
  "pkgVersion": "0.1.2",
  // Test file address and index
  "cacheId": "tests/ai/e2e/ai-auto-todo.spec.ts-1",
  "aiTasks": [
    {
      // User's prompt instruction
      "prompt": "Enter \"Learn JS today\" in the task box, then press Enter to create",
      "tasks": [
        {
          // Task type, currently only plan and locate
          // plan is determined by AI based on user's task
          "type": "plan",
          "pageContext": {
            // Address when AI executes tasks
            "url": "https://todomvc.com/examples/react/dist/",
            // Page width and height
            "size": {
              "width": 1280,
              "height": 720
            }
          },
          // User's prompt instruction
          "prompt": "Enter \"Learn JS today\" in the task box, then press Enter to create",
          "response": {
            // AI's tasks
            "plans": [
              {
                "thought": "The user wants to input a new task in the todo list input box and then press enter to create it. The input field is identified by its placeholder text 'What needs to be done?'.",
                "type": "Locate",
                "param": {
                  "prompt": "The input box with the placeholder text 'What needs to be done?'."
                }
              },
              {
                "thought": "Once the input box is located, we need to enter the task description.",
                "type": "Input",
                "param": {
                  "value": "Learn JS today"
                }
              },
              {
                "thought": "After entering the task, we need to commit it by pressing 'Enter'.",
                "type": "KeyboardPress",
                "param": {
                  "value": "Enter"
                }
              }
            ]
          }
        },
        {
          // locate is to find a specific element
          "type": "locate",
          "pageContext": {
            // Address when AI executes tasks
            "url": "https://todomvc.com/examples/react/dist/",
            // Page width and height
            "size": {
              "width": 1280,
              "height": 720
            }
          },
          // User's prompt instruction
          "prompt": "The input box with the placeholder text 'What needs to be done?'.",
          "response": {
            // Returned element content
            "elements": [
              {
                // Why AI found this element
                "reason": "The element with ID '3530a9c1eb' is an INPUT Node. Its placeholder text is 'What needs to be done?', which matches the user's description.",
                // Element text
                "text": "What needs to be done?",
                // Unique ID generated based on the element (generated based on position and size)
                "id": "3530a9c1eb"
              }
            ],
            "errors": []
          }
        }
      ]
  ]
  //...
}
```

When the `MIDSCENE_CACHE=true` environment variable is used and there are cache files, the AI's corresponding results will be read through the above cache file. The following are the conditions for cache hit:

1. The same test file and test title
2. Midscene package name, version, and last task are consistent
3. The page address and page width and height where the corresponding task is executed are consistent
4. The current page has exactly the same elements as last time (only required for locate element tasks)

## Common Issues

### Why provide caching capability?

The caching capability mainly solves the following problems:

1. High AI response latency, a task will take several seconds, and when there are dozens or even hundreds of tasks, there will be a higher latency
2. AI response stability, through training and experiments, we found that GPT-4 has an accuracy rate of over 95% in page element recognition tasks, but it cannot reach 100% accuracy yet. The caching capability can effectively reduce online stability issues

### What happens if the cache is not hit?

For AI behaviors that do not hit the cache, they will be re-executed by AI, and the cache will be updated after the entire test group is executed. You can check the cache file to determine which tasks have been updated.

### How to manually remove the cache?

* When deleting the corresponding cache file, the cache of the entire test group will automatically become invalid
* When deleting specific tasks in the cache file, the corresponding tasks will automatically become invalid. Deleting the tasks before will not affect the tasks after. The tasks will be updated after successful execution