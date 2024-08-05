# Cache

Midscene.js provides AI caching capabilities to enhance the stability and speed of the entire AI execution process. The cache here mainly refers to caching the elements recognized by AI on the page. When the page elements have not changed, the AI's query results will be cached.

## Instructions

Currently, the caching capability is only supported on `Playwright`, and Midscene can support caching at the test suite level.

**Usage**

```diff
- playwright test --config=playwright.config.ts
+ MIDSCENE_CACHE=true playwright test --config=playwright.config.ts
```

**Effect**

* **before**

![](/cache/no-cache-time.png)
  

* **after**

![](/cache/use-cache-time.png)

  

## Cache Content

Currently, Midscene's caching strategy on Playwright is mainly based on test suites, and AI behaviors within each test suite will be cached. The cache content mainly includes two types:

* AI task planning
* AI element recognition

The content of `aiQuery` will not be cached, so `aiQuery` can be used to verify whether the previous AI tasks meet expectations.

**Task Planning**

```js
await ai("Move the mouse to the second task, then click the delete button on the right of the task");
```

The above task planning will be broken down into:

```js
Hover: Move the mouse to the second task "Learn JS today"
Click: Click the delete button on the right of the task "Learn JS today"
```

When the page URL and dimensions have not changed, the results of the above tasks will be directly cached when caching is enabled.

**Element Recognition**

After AI has planned the tasks based on the user's instructions, it needs to operate on specific elements, which requires AI's ability to recognize page elements. For example, the following task:

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

## Caching Strategy

When using the `MIDSCENE_CACHE=true` environment variable, caching will automatically be performed according to the test suites in `Playwright`:

```ts
// todo-mvc.spec.ts
import { expect } from 'playwright/test';
import { test } from './fixture';

test.beforeEach(async ({ page }) => {
  await page.goto("https://todomvc.com/examples/react/dist/");
});

test('ai todo', async ({ page, ai, aiQuery }) => {
  await ai("Enter 'Learn JS today' in the task box, then press Enter");
});

test('ai todo2', async ({ page, ai, aiQuery }) => {
  await ai("Enter 'Learn JS today' in the task box, then press Enter");
});
```

The above `test` will generate caches according to the dimensions of `ai todo` and `ai todo2`, and cache files `todo-mvc.spec:10(ai todo).json` and `todo-mvc.spec:13(ai todo2).json` will be generated in the `midscene/midscene_run/cache` directory at the root of the project.

**Cache File Description**

```json
{
  "pkgName": "@midscene/web",
  // Current midscene version
  "pkgVersion": "0.1.2",
  // Test file address and line number
  "taskFile": "todo-mvc.spec.ts:10",
  // Test task title
  "taskTitle": "ai todo",
  "aiTasks": [
    {
      // Task type, currently only plan and locate
      // plan is determined by AI based on user's task
      "type": "plan",
      "pageContext": {
        // URL when AI executes the task
        "url": "https://todomvc.com/examples/react/dist/",
        // Page dimensions
        "size": {
          "width": 1280,
          "height": 720
        }
      },
      // User's prompt instruction
      "prompt": "Enter 'Learn JS today' in the task box, then press Enter to create",
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
      // locate is for finding specific elements
      "type": "locate",
      "pageContext": {
        // URL when AI executes the task
        "url": "https://todomvc.com/examples/react/dist/",
        // Page dimensions
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
            // Unique ID generated based on the element (based on position and size)
            "id": "3530a9c1eb"
          }
        ],
        "errors": []
      }
    }
  ]
  //...
}
```

When the `MIDSCENE_CACHE=true` environment variable is used and there are cache files, the corresponding AI results will be read from the above cache files. The conditions for cache hits are as follows:

1. The same test file and test title
2. The same Midscene package name, version, and previous tasks
3. The same page URL and dimensions when executing the task
4. The current page contains the exact same elements as last time (only required for element locating tasks)

## Frequently Asked Questions

### Why provide caching capabilities?

Caching capabilities mainly solve the following problems:

1. High AI response latency: A task can take several seconds. When there are dozens or even hundreds of tasks, it can be very time-consuming.
2. AI response stability: Through tuning and experimentation, we found that GPT-4 has over 90% accuracy in page element recognition tasks, but it still cannot reach 100% accuracy. Caching capabilities can effectively reduce online stability issues.

### What happens if the cache is not hit?

For AI behaviors that do not hit the cache, AI will re-execute the task, and the cache will be updated after the entire test suite execution is completed. You can check the cache files to determine which tasks have been updated.

### How to manually remove the cache?

* Deleting the corresponding cache files will automatically invalidate the entire test suite's cache.
* Deleting specific tasks in the cache file will automatically invalidate the corresponding tasks. After the task is successfully executed, the task will be updated. Deleting previous tasks will not affect subsequent tasks.


