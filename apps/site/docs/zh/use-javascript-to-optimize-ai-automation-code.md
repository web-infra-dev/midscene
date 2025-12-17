# 使用 JavaScript 优化 AI 自动化代码

许多开发者喜欢使用 `aiAct` 或 `ai` 来执行自动化任务，甚至将所有长段落复杂逻辑描述在一个自然语言指令中。这是很"智能"的做法，但在实际使用中可能遇到无法稳定复现、速度偏慢的问题。

本文为你介绍一种使用 JavaScript 和结构化 API 编写自动化脚本的思路，供开发者参考。

## 使用 JavaScript 和结构化 API 编写自动化脚本

Midscene 提供了结构化 API 方法，如 `aiBoolean` `aiString` `aiNumber`，用于提取界面上的状态。结合这些方法和即时操作方法，如 `aiTap` `aiInput` `aiScroll` `aiHover` 等，开发者可将复杂逻辑拆分为多个步骤，以提升自动化代码的稳定性。

### 简单的例子

以这个原始提示词为例：

```txt
逐条点击所有记录，如果一个记录包含“已完成”，则跳过
```

通过组装结构化 API ，你可以将原始提示词转换为更可靠、更易于维护的代码：

```javascript
const recordList = await agent.aiQuery('string[], the record list')
for (const record of recordList) {
  const hasCompleted = await agent.aiBoolean(`check if the record ${record}" contains the text "completed"`)
  if (!hasCompleted) {
    await agent.aiTap(record)
  }
}
```

很显然，修改代码风格后，整个过程更可靠和易于维护，开发者可以用传统调试手段控制其中的执行流程。

### 复杂的例子

以下是修改前的代码：

```javascript
aiAct(`
1. 点击第一个未关注用户，进入用户主页
2. 点击关注按钮
3. 返回上一级
4. 如果所有用户都已关注，则向下滚动一屏
5. 重复上述步骤，直到所有用户都已关注
`)
```

使用结构化 API 后，开发者可以将这个流程固定为代码：

```javascript
let user = await agent.aiQuery('string[], 列表中所有未关注用户')
let currentUserIndex = 0

while (user.length > 0) {
  console.log('当前用户是', user[currentUserIndex])
  await agent.aiTap(user[currentUserIndex])
  try {
    await agent.aiTap('关注按钮')
  } catch (e) {
    // 忽略错误
  }
  // 返回上一级
  await agent.aiTap('返回按钮')
  
  currentUserIndex++

  // 检查是否已经遍历了当前列表中的所有用户
  if (currentUserIndex >= user.length) {
    // 向下滚动一屏
    await agent.aiScroll({
      direction: 'down',
      scrollType: 'once',
    })
    
    // 获取更新后的用户列表
    user = await agent.aiQuery('string[], 列表中所有未关注用户')
    currentUserIndex = 0
  }
}
```

## 常用的结构化 API 方法

### `aiBoolean` - 条件决策

* 适用场景：条件判断、状态检测
* 优势：将模糊描述转换为明确的布尔值

举例：
```javascript
const hasAlreadyChat = await agent.aiBoolean('当前聊天页面上，我是否给他发过消息');
if (hasAlreadyChat) {
   // ...
}
```

### `aiString` - 文本提取 

* 适用场景：文本内容获取
* 优势：规避自然语言描述的歧义性

举例：
```javascript
const username = await agent.aiString('用户列表里的第一个用户昵称');
console.log('username is', username);
```

### `aiNumber` - 数值提取

* 适用场景：计数、数值比较、循环控制
* 优势：保证返回标准数字类型

举例：
```javascript
const unreadCount = await agent.aiNumber('消息图标上的未读数字');
for (let i = 0; i < unreadCount; i++) {
   // ...
}
``` 

### `aiQuery` - 通用数据提取

* 适用场景：提取任意数据类型
* 优势：灵活的数据类型处理

举例：
```javascript
const userList = await agent.aiQuery('string[], 用户列表');
```

### 即时操作方法

Midscene 提供了一些即时操作方法，如 `aiTap` `aiInput` `aiScroll` `aiHover` 等，它们也常用于自动化代码中。你可以在 [API](./api.mdx) 页面查看。


## 选用 `aiAct` 与结构化代码，哪个才是最优解？

没有标准答案。这取决于模型的能力、实际业务的复杂度。

一般来说，如果出现了以下现象，你应该考虑放弃 `aiAct` 方法：

- `aiAct` 在多次重放后，成功率不满足需求
- 反复调优 `aiAct` 的 prompt 已经让你感到疲惫、耗费了太多时间
- 需要对脚本进行单步调试

## 想要轻松编写结构化代码？

如果你觉得上述 javascript 代码很难写，那么现在是时候使用 AI IDE 了。

使用你的 AI IDE 索引我们的文档即可：

- https://midscenejs.com/use-javascript-to-optimize-ai-automation-code.md
- https://midscenejs.com/api.md

关于如何将 Midscene 文档添加到 AI IDE，请参考 [这篇文章](./llm-txt.mdx#usage)。
