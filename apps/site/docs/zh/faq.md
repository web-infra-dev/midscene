# 常见问题 FAQ

## Midscene 能否根据一句话指令实现智能规划？比如执行 "发一条微博"

我们只建议你在使用 *UI-TARS* 等 GUI Agent 模型时使用这种目标导向的 Prompt。

## 业界的 AI Agent 都在演示“自主规划”，为什么 Midscene 还要开发者提供详细操作步骤？这是一种落后的做法吗？

Midscene 有相当多的工具类、测试类开发者，他们更关注 UI 自动化工具的稳定性和性能。为了确保 Agent 能够在复杂系统中精准运行，准确清晰的 Prompt 依然是眼下的最优解。

为了进一步提高稳定性，我们还提供了即时操作接口（Instant Action）、回放报告、Playground 等工具。他们虽然看似有些“传统”、不太“AI”，但在大量实践后，我们有信心这些实用工具才是提升效率的利器。

如果你对“智能 GUI Agent”感兴趣，不妨看看 [UI-TARS](https://github.com/bytedance/ui-tars) 模型，Midscene 也内置了对它的支持。

相关文档: 
* [选择 AI 模型](./choose-a-model)
* [编写提示词的技巧](./prompting-tips)

## 局限性

Midscene 存在一些局限性，我们仍在努力改进。

1. 交互类型有限：目前仅支持点击、拖拽(只在 UI-TARS 模型中支持)、输入、键盘和滚动操作。
2. 稳定性风险：AI 模型的返回值不是 100% 准确的。遵循 [编写提示词的技巧](./prompting-tips) 可以帮助提高 SDK 稳定性。
3. 使用 GPT-4o 时，无法与跨域 iframe 、canvas 元素交互。使用 Qwen 、UI-TARS 模型时无此问题。
4. 无法访问 Chrome 原生元素：无法访问右键菜单、文件上传对话框等。
5. 无法绕过验证码：有些 LLM 服务会拒绝涉及验证码解决的请求（例如 OpenAI），而有些验证码页面的 DOM 无法通过常规的网页抓取方法访问。因此，使用 Midscene 绕过验证码不是一个可靠的方法。

## 支持哪些 AI 模型

你可以按需[选择 AI 模型](./choose-a-model)。

## 会有哪些信息发送到 AI 模型？

Midscene 会发送页面截图到 AI 模型。在使用了 GPT-4o 时，你的页面 DOM 信息也会被发送。

如果你担心数据隐私问题，请参阅 [数据隐私](./data-privacy)。

## 脚本运行偏慢？

在 Midscene.js 中使用通用大模型时，由于每次进行规划（Planning）和查询（Query）时都会调用 AI，其运行耗时可能比传统 Playwright 用例增加 3 到 10 倍，比如从 5 秒变成 20秒。为了让结果更可靠，token 和时间成本是不可避免的。

有几种方法可以提高运行效率：
1. 使用即时操作接口，如 `agent.aiTap('Login Button')` 代替 `agent.ai('Click Login Button')`。更多详情请参阅 [API](./api.mdx)。
2. 使用专用的模型并自行部署，比如 UI-TARS。这是推荐的做法。更多详情请参阅 [选择 AI 模型](./choose-a-model)。
3. 使用较低的分辨率。
4. 使用缓存来加速调试过程。更多详情请参阅 [缓存](./caching)。

## 浏览器界面持续闪动

一般是 viewport `deviceScaleFactor` 参数与系统环境不匹配造成的。如果你在 Mac 系统下运行，可以把它设成 2 来解决。

```typescript
await page.setViewport({
  deviceScaleFactor: 2,
});
```

## 如何了解 Midscene 的运行原理？

在运行脚本后，通过查看报告文件，你可以了解 Midscene 的大致运行原理。

## 如何通过链接控制报告中播放器的默认回放样式？

在报告页面的链接后添加查询参数即可覆盖 **Focus on cursor** 和 **Show element markers** 开关的默认值，决定是否在报告中聚焦鼠标位置和元素标记。使用 `focusOnCursor` 和 `showElementMarkers`，参数值支持 `true`、`false`、`1` 或 `0`，例如：`...?focusOnCursor=false&showElementMarkers=true`。

## 自定义网络超时

当在网页上执行某个操作后，Midscene 会自动等待网络空闲。这是为了确保自动化过程的稳定性。如果等待超时，不会发生任何事情。

默认的超时时间配置如下：

1. 如果是页面跳转，则等待页面加载完成，默认超时时间为 5000ms
2. 如果是点击、输入等操作，则等待网络空闲，默认超时时间为 2000ms

当然，你可以通过配置参数修改默认超时时间，或者关闭这个功能：

- 使用 [Agent](/zh/api.html#%E6%9E%84%E9%80%A0%E5%99%A8) 上的 `waitForNetworkIdleTimeout` 和 `waitForNavigationTimeout` 参数
- 使用 [Yaml](/zh/automate-with-scripts-in-yaml.html#web-%E9%83%A8%E5%88%86) 脚本和 [PlaywrightAiFixture](/zh/integrate-with-playwright.html#%E7%AC%AC%E4%BA%8C%E6%AD%A5%E6%89%A9%E5%B1%95-test-%E5%AE%9E%E4%BE%8B) 中的 `waitForNetworkIdle` 参数