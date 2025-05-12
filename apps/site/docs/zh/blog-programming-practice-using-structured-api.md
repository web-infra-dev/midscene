# 自动化稳定性的关键：使用结构化 API 的编程实践

## 当 AI 自动化遇到瓶颈

许多开发者在使用`aiAction`时陷入了一个误区——试图用单个自然语言指令描述所有复杂逻辑。虽然这看起来很"智能"，但实际上会带来一系列问题！

## 常见反模式：两个错误案例

### ❌ 错误示例: 大段逻辑风暴

```javascript
aiAction(`
1. 点击第一个用户
2. 点击主页右侧的聊天气泡
3. 如果我曾经给他发过消息，就返回上一级
4. 如果我没有发过消息，就输入一段打招呼文本，并点击发送
`)
```
* 问题：单点故障 - 任何步骤出错将导致整个流程失败，难以调试

### ❌ 错误示例: 碎片化指令
```javascript
aiAction(`点击第一个用户`)
aiAction(`点击主页右侧的聊天气泡`) 
aiAction(`如果我曾经给他发过消息，就返回上一级`)
aiAction(`如果我没有发过消息，就输入一段打招呼文本，并点击发送`)
```
* 问题：失去上下文关联 - 每个 action 都是独立决策，缺乏上下文关联

## 问题本质分析

1. **AI 幻觉放大效应**：长提示词中的错误会累积传播
2. **调试黑洞**：开发者陷入反复调整自然语言的怪圈
3. **结构缺失**：逻辑分支缺乏程序化控制流，导致难以维护
4. **高估 AI 能力**：高估 LLM 的连续推理能力，导致回放准确性下降

## 解决方案：结构化 AI 查询方法

为了解决上述问题，我们引入了三个基于 [`aiQuery`](./API.mdx#agentaiquery) 的语法糖方法：

### 1. `aiBoolean` - 条件决策
```javascript
const hasAlreadyChat = await agent.aiBoolean('当前聊天页面上，我是否给他发过消息');
```
* 适用场景：条件判断、状态检测
* 优势：将模糊描述转换为明确的布尔值

### 2. `aiString` - 文本提取 
```javascript
const username = await agent.aiString('用户列表里的第一个用户昵称');
```
* 适用场景：文本内容获取
* 优势：规避自然语言描述的歧义性

### 3. `aiNumber` - 数值处理
```javascript
const unreadCount = await agent.aiNumber('消息图标上的未读数字');
``` 
* 适用场景：计数、数值比较
* 优势：保证返回标准数字类型

## 对比：长提示词 vs 结构化编程

### ❌ 错误示例: 脆弱的长提示词
```javascript
// 需要处理所有可能的执行路径
await agent.aiAction(`如果 A 则 B 否则 C...`)
```

### ✅ 正确示例: 结构化编程
```javascript
// 分步骤明确控制流
if (await agent.aiBoolean('条件 A')) {
    await agent.aiAction('执行 B')
} else {
    await agent.aiAction('执行 C') 
}
```

## 真实案例重构

### ❌ 错误示例: 碎片化指令
```javascript
aiAction(`如果我曾经给他发过消息，就返回上一级`)
aiAction(`如果我没有发过消息，就输入一段打招呼文本，并点击发送`)
```

### ✅ 正确示例: 结构化编程

```javascript
// 使用aiBoolean进行条件判断
const hasAlreadyChat = await agent.aiBoolean(
    '当前聊天页面上，我是否给他发过消息'
);

// 明确的条件分支
if (hasAlreadyChat) {
    await agent.aiAction('返回上一级')
} else {
    await agent.aiAction('输入一段打招呼文本，并点击发送')
}
```

## 为什么这些方法更优秀？

1. **可调试性**：每个方法产生明确类型的返回值
2. **可组合性**：与常规编程逻辑无缝结合
3. **确定性**：减少对自然语言描述的依赖
4. **性能优化**：避免重复解析长提示词

## 升级建议

1. 将复杂逻辑拆分为多个 `aiBoolean` 判断
2. 用 `aiString`/`aiNumber` 获取决策所需数据
3. 保留 `aiAction` 仅用于具体动作执行
4. 结合 `try-catch` 处理边界情况

## 语法糖背后的实现：aiQuery

所有语法糖方法（`aiBoolean`/`aiString`/`aiNumber`）本质上都是`aiQuery`的封装，因此你可以使用 aiQuery 来实现语法糖方法的相同功能：

```javascript
const data = await agent.aiQuery({
  hasAlreadyChat: "boolean, 当前聊天页面上，我是否给他发过消息",
  userName: "string, 用户列表里的第一个用户昵称",
  unreadCount: "number, 消息图标上的未读数字"
});
```

### 何时需要直接使用 aiQuery？
1. **复杂数据结构**：需要嵌套 JSON 时
   ```javascript
   await agent.aiQuery('{name: string, friends: string[]}, 用户社交数据')
   ```
2. **自定义类型**：语法糖未覆盖的类型（如对象和数组）
3. **批量获取**：减少 AI 调用次数提升性能

## 知悉 `aiAction` 的能力边界

虽然 `aiAction` 非常强大，但必须清醒认识它的局限性：

### 适用场景
✅ 线性操作流程（A → B → C）
✅ 明确的页面导航（返回上一页）
✅ 基础元素交互（点击/输入）

### 不适用场景
❌ **复杂条件分支**
```javascript
// 不推荐：AI 可能误解嵌套逻辑
await agent.aiAction('如果 A 则 B 否则如果 C 则 D...')
```

❌ **上下文丢失**
```javascript
// 不推荐：两个 action 之间没有上下文关联，各自独立判断，导致无法可靠地执行
aiAction(`如果我曾经给他发过消息，就返回上一级`)
aiAction(`如果我没有发过消息，就输入一段打招呼文本，并点击发送`)
```

❌ **跨页面数据关联**
```javascript
// 不推荐：无法可靠地在多个页面间传递复杂状态
await agent.aiAction('获取商品列表页的所有价格，然后去到购物车页面，选择价格最低的那个商品')
```

❌ **精细的控制需求**
```javascript
// 不推荐：像素级操作应该用传统自动化
await agent.aiAction('从 (x1,y1) 拖动到 (x2,y2)')
```

## 最佳实践

### 原则
1. **控制流用 JS 代码**：`if/for` 等逻辑控制
2. **数据获取用 aiBoolean/aiString/aiNumber/aiQuery **：提取决策所需数据
3. **动作执行用 aiTap/aiHover/aiInput/aiKeyboardPress/aiScroll/aiAction **：处理明确操作步骤

### 示例对比

❌ 错误示例：全部使用自然语言控制
```javascript
await agent.aiAction(`
  如果积分大于 100 则点击 VIP 按钮...
`)
```

✅ 正确示例: 结构化控制
```javascript
const credits = await agent.aiNumber('积分数字')

if (credits > 100) {
  await agent.aiTap('VIP 按钮')
}
```

## 拥抱结构化 AI 编程，智能与精确的平衡

1. **善用语法糖方法**：
   - 本质是类型安全的 `aiQuery`包装
   - 覆盖 80% 基础场景（布尔/字符/数值）
   - 复杂需求仍需原始 `aiQuery`

2. **认清 aiAction 的定位**：
   - 不是"万能 AI 魔法"
   - 最适合线性操作流
   - 复杂逻辑应拆分为原子操作

3. **结构化编程**：
```
自然语言 --> 结构化查询 --> 程序化控制
```

这些新方法不是限制，而是赋予开发者更精细的控制能力，记住：

**稳定的自动化 = 明确的控制流 + 适度的 AI**

当遇到边界情况时，不妨回归传统自动化方法与 AI 相结合的模式，从而获得更稳定的自动化效果。
