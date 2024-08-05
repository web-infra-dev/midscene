# 缓存

Midscene.js 提供了 AI 缓存能力，用于提升整个 AI 执行过程的稳定性和速度。这里得缓存主要指的是缓存 AI 识别页面的元素，在页面元素尚未发生变化时 AI 的查询结果会发生缓存。

## 使用说明

目前缓存的能力仅在 `Playwright` 上进行了支持，Midscene 能够支持测试组级别的缓存。

> 使用方式

```diff
- playwright test --config=playwright.config.ts
+ MIDSCENE_CACHE=true playwright test --config=playwright.config.ts
```

> 使用效果

效果对比图片


## 缓存内容

目前 Midscene 在 Playwright 上的缓存策略主要是以测试组为单位在每个测试组里的 ai 行为将发生缓存，目前缓存的内容主要是两类：

* AI 对于任务的规划
* AI 对于元素的识别

不会对 aiQuery 的内容进行缓存，因此可以通过 aiQuery 来确认前面 ai 的任务是否是符合预期的。

> 任务规划

```js
await ai("将鼠标移动到第二条任务后，点击任务右边的删除按钮");
```

上面的任务规划将会被拆解成：

```js
Hover: 移动鼠标到第二条任务 "今天学习 JS" 上
Click: 点击任务 "今天学习 JS" 右边的删除按钮
```

当页面的 url 地址和页面的宽高未发生变化时，开启缓存后将会直接缓存上面任务的结果。

> 元素识别

在 AI 对用户的指令进行了任务规划后，则需要针对特定的元素进行操作，那么就需要用到 AI 对于页面元素的识别能力，例如下面的任务：

```js
Hover: 移动鼠标到第二条任务 "今天学习 JS" 上
```

上面的元素识别将会转换成具体的元素识别：

```js
Text Element: "今天学习 JS"
Left: 200
Top: 300
width: 100
height: 30
```

## 缓存策略

当使用 `MIDSCENE_CACHE=true` 环境变量后，将会自动按照 `Playwright` 的测试组进行缓存：

```ts
//online-order.spec.ts
import { expect } from 'playwright/test';
import { test } from './fixture';

test.beforeEach(async ({ page }) => {
  page.setViewportSize({ width: 400, height: 905 });
  await page.goto('https://heyteavivocity.meuu.online/home');
  await page.waitForLoadState('networkidle');
});

test('online order', async ({ page, ai, aiQuery }) => {
  await ai('点击左上角语言切换按钮(英文、中文)，在弹出的下拉列表中点击中文');
  await ai('向下滚动一屏');
});

test('online order2', async ({ page, ai, aiQuery }) => {
  await ai('点击左上角语言切换按钮(英文、中文)，在弹出的下拉列表中点击中文');
  await ai('向下滚动一屏');
});
```


当上面的 `test` 将按照 `online order` 和 `online order2` 这两个维度产生缓存，分别会在项目的根目录中的 `midscene/midscene_run/cache` 中生成 `online-order.spec:5(online order).json` 和 `online-order.spec:5(online order2).json` 缓存文件。

> 缓存文件介绍

```json
{
  "pkgName": "@midscene/web",
  // 当前使用的 midscene 版本
  "pkgVersion": "0.1.2",
  // 测试文件地址和行数
  "taskFile": "ai-auto-todo.spec.ts:8",
  // 测试任务标题
  "taskTitle": "ai todo",
  "aiTasks": [
    {
      // 任务类型，目前只有 plan 和 locate
      // plan 为 AI 通过用户的任务决定
      "type": "plan",
      "pageContext": {
        // AI 执行任务时的地址
        "url": "https://todomvc.com/examples/react/dist/",
        // 页面宽高
        "size": {
          "width": 1280,
          "height": 720
        }
      },
      // 用户的 prompt 指令
      "prompt": "Enter \"Learn JS today\" in the task box, then press Enter to create",
      "response": {
        // AI 的任务
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
      // locate 为需要查找特定元素
      "type": "locate",
      "pageContext": {
        // AI 执行任务时的地址
        "url": "https://todomvc.com/examples/react/dist/",
        // 页面的宽高
        "size": {
          "width": 1280,
          "height": 720
        }
      },
      // 用户的 prompt 指令
      "prompt": "The input box with the placeholder text 'What needs to be done?'.",
      "response": {
        // 返回的元素内容
        "elements": [
          {
            // AI 为什么找到了这个元素
            "reason": "The element with ID '3530a9c1eb' is an INPUT Node. Its placeholder text is 'What needs to be done?', which matches the user's description.",
            // 元素的文本
            "text": "What needs to be done?",
            // 基于元素生成的唯一 ID（基于位置和大小生成）
            "id": "3530a9c1eb"
          }
        ],
        "errors": []
      }
    },
  ]
}
```

当使用了 `MIDSCENE_CACHE=true` 环境变量并且有缓存文件时，将会通过上面的缓存文件读取 AI 对应的结果。以下是缓存命中的条件：

1. 相同的测试文件和测试 title
2. midscene 包名、版本和上次的任务是一致的
3. 对应任务执行的页面地址、页面宽高是一致的
4. 当前页面存在和上次一模一样的元素（仅针对定位元素任务要求）


## 常见问题

### 为什么要提供缓存能力？

缓存能力主要解决了以下问题：

1. AI 响应延迟高，一个任务将会耗费几秒钟，当有几十条甚至几百条任务任务时将会有较高的耗时
2. AI 响应稳定性，通过调教和实验中我们发现 GPT 4o 在页面元素识别的任务上有 90%+ 的准确率但是尚无法达到 100% 的准确率，通过缓存能力能够有效的降低线上稳定性问题


### 未命中缓存会发生什么？

对于未命中缓存的 ai 行为将会交给 AI 重新执行任务并在整个测试组执行结束后更新缓存，可以通过查看 cache 文件来确定哪些任务是否有更新。

### 如何手动去掉缓存？

* 当删除掉对应的缓存文件时，整个测试组的缓存将会自动失效
* 当删除掉缓存文件里面特定的任务时，对应的任务将会自动失效，任务执行成功后将会更新任务，删除前面的任务不会影响后面的任务






