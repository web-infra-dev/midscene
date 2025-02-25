# FAQ

## Midscene 能否根据一句话指令实现智能规划？比如执行 "发一条微博"

Midscene 是一个辅助 UI 自动化的 SDK，运行时稳定性很关键——即保证每次运行都能运行相同的动作。为了保持这种稳定性，我们希望你提供详细的指令，以帮助 AI 清晰地理解并执行。

如果你需要一个 '目标到任务' 的 AI 规划工具，不妨基于 Midscene 自行开发一个。

关联文档: [编写提示词的技巧](./prompting-tips)

## 局限性

Midscene 存在一些局限性，我们仍在努力改进。

1. 交互类型有限：目前仅支持点击、拖拽、输入、键盘和滚动操作。
2. 稳定性风险：AI 模型的返回值不是 100% 准确的。遵循 [编写提示词的技巧](./prompting-tips) 可以帮助提高 SDK 稳定性。
3. 使用 GPT-4o 时，无法与跨域 iframe 、canvas 元素交互。使用 Qwen 、UI-TARS 模型时无此问题。
4. 无法访问 Chrome 原生元素：无法访问右键菜单、文件上传对话框等。
5. 无法绕过验证码：有些 LLM 服务会拒绝涉及验证码解决的请求（例如 OpenAI），而有些验证码页面的 DOM 无法通过常规的网页抓取方法访问。因此，使用 Midscene 绕过验证码不是一个可靠的方法。

## 能否选用 `gpt-4o` 以外的其他模型？

当然可以。你可以按需[选择 AI 模型](./choose-a-model)。

## 会有哪些信息发送到 AI 模型？

Midscene 会发送页面截图到 AI 模型。在使用了 GPT-4o 时，你的页面 DOM 信息也会被发送。

如果你担心数据隐私问题，请参阅 [数据隐私](./data-privacy)。

## 脚本运行偏慢？

在 Midscene.js 中使用通用大模型时，由于每次进行规划（Planning）和查询（Query）时都会调用 AI，其运行耗时可能比传统 Playwright 用例增加 3 到 10 倍，比如从 5 秒变成 20秒。为了让结果更可靠，token 和时间成本是不可避免的。

有两种方法可以提高运行效率：
1. 使用专用的模型并自行部署，比如 UI-TARS。这是推荐的做法。更多详情请参阅 [选择 AI 模型](./choose-a-model)。
2. 使用缓存来减少 token 消耗。更多详情请参阅 [缓存](./caching)。

## 浏览器界面持续闪动

一般是 viewport `deviceScaleFactor` 参数与系统环境不匹配造成的。如果你在 Mac 系统下运行，可以把它设成 2 来解决。

```typescript
await page.setViewport({
  deviceScaleFactor: 2,
});
```

## Midscene 的运行原理

简单来讲，Midscene 提取了用户界面的结构信息并发送到多模态 AI 服务进行推理。这个流程图展示了 Midscene 和 AI 的交互流程。

![](/flow.png)
