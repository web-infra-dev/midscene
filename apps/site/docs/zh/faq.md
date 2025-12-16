# 常见问题 FAQ

## 会有哪些信息发送到 AI 模型？

Midscene 会发送页面截图到 AI 模型。在某些场景下，例如调用 `aiAsk` 或 `aiQuery` 时传入 `domIncluded: true`，页面的 DOM 信息也会被发送。

如果你担心数据隐私问题，请参阅 [数据隐私](./data-privacy)。

## 如何提升运行效率？

有几种方法可以提高运行效率：
1. 使用即时操作接口，如 `agent.aiTap('Login Button')` 代替 `agent.ai('Click Login Button')`。
2. 尽量使用较低的分辨率，降低输入 token 成本。
3. 更换更快的模型服务。
4. 使用缓存来加速调试过程。更多详情请参阅 [缓存](./caching)。

## 浏览器界面持续闪动

一般是 viewport `deviceScaleFactor` 参数与系统环境不匹配造成的。如果你在 Mac 系统下运行，可以把它设成 2 来解决。

```typescript
await page.setViewport({
  deviceScaleFactor: 2,
});
```

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

## 在 Chrome 插件中使用 Ollama 模型出现 403 错误

需要设置环境变量 `OLLAMA_ORIGINS="*"`，以允许 Chrome 插件访问 Ollama 模型。
