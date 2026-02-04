# 常见问题 FAQ

## 会有哪些信息发送到 AI 模型？

Midscene 会发送页面截图到 AI 模型。在某些场景下，例如调用 `aiAsk` 或 `aiQuery` 时传入 `domIncluded: true`，页面的 DOM 信息也会被发送。

如果你担心数据隐私问题，请参阅 [数据隐私](./data-privacy)。

## 如何配置 midscene_run 目录？

Midscene 会将运行产物（报告、日志、缓存等）保存在 `midscene_run` 目录下。默认情况下，该目录会创建在当前工作目录下。

你可以通过环境变量 `MIDSCENE_RUN_DIR` 来自定义该目录的位置，支持相对路径或绝对路径：

```bash
# 使用相对路径
export MIDSCENE_RUN_DIR="./my_custom_dir"

# 使用绝对路径
export MIDSCENE_RUN_DIR="/tmp/midscene_output"
```

该目录包含以下子目录：

- `report/` - 测试报告文件（HTML 格式）
- `log/` - 调试日志文件
- `cache/` - 缓存文件（详见 [缓存](./caching)）

更多配置选项请参阅 [模型配置](./model-config)。

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

- 使用 [Agent](/zh/api#%E6%9E%84%E9%80%A0%E5%99%A8) 上的 `waitForNetworkIdleTimeout` 和 `waitForNavigationTimeout` 参数
- 使用 [Yaml](/zh/automate-with-scripts-in-yaml#web-%E9%83%A8%E5%88%86) 脚本和 [PlaywrightAiFixture](/zh/integrate-with-playwright#%E7%AC%AC%E4%BA%8C%E6%AD%A5%E6%89%A9%E5%B1%95-test-%E5%AE%9E%E4%BE%8B) 中的 `waitForNetworkIdle` 参数

## 在 Chrome 插件中使用 Ollama 模型出现 403 错误

需要设置环境变量 `OLLAMA_ORIGINS="*"`，以允许 Chrome 插件访问 Ollama 模型。

## 元素定位出现偏移

如果在使用 Midscene 时遇到元素定位不准确的问题，可以按照以下步骤排查和解决：

### 1. 升级到最新版本

确保你使用的是最新版本的 Midscene，新版本通常包含定位准确性的优化和改进。

```bash
# Web 自动化
npm install @midscene/web@latest
# iOS 自动化
npm install @midscene/ios@latest
# CLI 工具
npm install @midscene/cli@latest
# 或者其他和你平台对应的 package
```

### 2. 使用更好的视觉模型

Midscene 的元素定位能力依赖于 AI 模型的视觉理解能力，所以请务必选择支持视觉能力的模型。

在你可以使用的模型中，选择最好的模型会有助于提升定位效果。

通常来说新版本、参数大的模型会比老版本、参数小的模型表现更好。更多模型选择建议请参考 [模型策略](./model-strategy)

### 3. 检查 Model Family 配置

确认你的模型配置中 `MIDSCENE_MODEL_FAMILY` 参数设置是否正确，`MIDSCENE_MODEL_FAMILY` 配置错误会影响 Midscene 对模型的适配逻辑。详见 [模型配置](./model-config)。

### 4. 分析定位偏移的原因

定位偏移通常有两种情况：

**情况一：模型无法识别目标元素**
- 表现：定位结果随机落在不相关的元素上，每次执行结果差异较大。
- 原因：模型可能无法理解你的描述。以 `aiTap('收藏图标')` 为例，这是一个对被定位元素的功能性描述，模型可能并不了解收藏图标具体的样式；而 `aiTap('五角星 icon')` 是一个视觉性的描述，模型可以根据其视觉特征完成元素定位。
- 解决方法：优化提示词，结合视觉特征和位置信息来描述元素。
  ```typescript
  // ❌ 仅使用功能性描述
  await agent.aiTap('收藏图标');
  
  // ✅ 使用视觉性描述
  await agent.aiTap('五角星 icon');
  
  // ✅ 结合视觉特征和位置信息
  await agent.aiTap('页面右上角的五角星收藏按钮');
  ```

这里的 `收藏图标` 只是用于举例，一般来说，模型能够理解很多常见 icon 的功能语义。但随着你在自动化领域探索的不断深入，总是可能会遇到模型不熟悉某个元素的语义的情况。因此，明确描述被定位元素的视觉特征是一个非常实用的技巧。

**情况二：模型识别准确但定位有偏差**
- 表现：定位结果落在目标元素附近，但有若干像素的偏移。
- 解决方法：开启 `deepThink` 会对定位效果有明显提升。
  ```typescript
  await agent.aiTap('登录按钮', {
    deepThink: true
  });
  ```

更多关于 `deepThink` 的说明，请参阅 [API 文档](/zh/api)。
