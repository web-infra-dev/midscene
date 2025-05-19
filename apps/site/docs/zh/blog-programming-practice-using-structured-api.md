# 使用结构化 API 优化自动化代码

许多开发者在使用 `aiAction` 时会陷入一个误区：试图用单个自然语言指令描述所有复杂逻辑。虽然这看起来很"智能"，但实际上会带来一系列问题。

最常见的错误是编写大段逻辑风暴，如：

```javascript
aiAction(`
1. 点击第一个用户
2. 点击主页右侧的聊天气泡
3. 如果我曾经给他发过消息，就返回上一级
4. 如果我没有发过消息，就输入一段打招呼文本，并点击发送
`)
```

```javascript
await agent.aiAction('获取商品列表页的所有价格，然后去到购物车页面，选择价格最低的那个商品')
```

这种写法会把所有操作指令都汇总在一个 Prompt 中，实际运行时，它对 AI 模型的理解力、稳定性有极高要求，任何步骤出错都可能导致流程失败。开发者可能也会迷失在 Prompt 反复调优的怪圈中。

另一个误区是，将代码拆分成多个 `aiAction` 方法，虽然降低了单个 Prompt 的复杂度，但多个 `aiAction` 方法之间仍然存在上下文关系，而 `aiAction` 又无法将上下文传递给下一个 `aiAction`，从而导致一样的问题。

```javascript
aiAction('点击第一个用户')
aiAction('点击主页右侧的聊天气泡')
aiAction('如果我曾经给他发过消息，就返回上一级')
aiAction('如果我没有发过消息，就输入一段打招呼文本，并点击发送')
```

## 使用结构化 API 优化代码

Midscene 提供了 `aiBoolean` `aiString` `aiNumber` 等数据提取方法，利用这些方法，你可以将复杂逻辑拆分为多个步骤，以提升自动化代码的稳定性。

以上面几个案例为例，可以将自然语言转换为这种代码形式：

```javascript
aiAction('点击第一个用户')
aiAction('点击主页右侧的聊天气泡')

const hasAlreadyChat = await agent.aiBoolean('当前聊天页面上，我是否给他发过消息');

if (hasAlreadyChat) {
  aiAction(`返回上一级`)
} else {
  aiAction(`输入一段打招呼文本，并点击发送`)
}
```

使用这种方式编写的自动化代码，可以将对 AI 模型的依赖降到最低，从而提升流程的稳定性。

再举一个例子：

```javascript
aiAction(`
1. 点击列表里的第一个用户，进入用户主页
2. 点击关注按钮
3. 返回上一级
4. 如果所有用户都已关注，则往下滚动一屏
5. 重复上述步骤，直到所有用户都已关注
`)
```

可以转换为：

```javascript
let user = await agent.aiQuery('string[], 列表中的用户名');
let currentUserIndex = 0;

while (true) {
  await agent.aiAction(
    `点击列表里的「${user[currentUserIndex]}」用户名，进入用户主页`,
  );
  await agent.aiTap('关注按钮');
  await agent.aiAction('返回上一级');

  if (currentUserIndex === user.length - 1) {
    await agent.aiAction('往下滚动一屏');
    user = await agent.aiQuery('string[], 列表中的用户名');
    currentUserIndex = 0;
  } else {
    currentUserIndex++;
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
