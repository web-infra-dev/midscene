# 常见问题 FAQ

## 各平台常见问题

以下平台的常见问题已整合到各自的文档中：

- [Web 浏览器 - Playwright](./integrate-with-playwright#faq)
- [Web 浏览器 - Puppeteer](./integrate-with-puppeteer#faq)
- [Web 浏览器 - Chrome 插件](./quick-experience#faq)
- [Web 浏览器 - 桥接模式](./bridge-mode#faq)
- [Android](./android#常见问题)
- [iOS](./ios#常见问题)
- [HarmonyOS](./harmony#常见问题)
- [PC 桌面](./computer#常见问题)

## 会有哪些信息发送到 AI 模型？

Midscene 会发送页面截图到 AI 模型。在某些场景下，例如调用 `aiAsk` 或 `aiQuery` 时传入 `domIncluded: true`，页面的 DOM 信息也会被发送。

如果你担心数据隐私问题，请参阅 [数据隐私](./data-privacy)。

## 我的模型服务商需要在请求中添加指定的 header

你可以通过环境变量 `MIDSCENE_MODEL_INIT_CONFIG_JSON` 中的 `defaultHeaders` 来指定请求时附带的 header，例如：

```bash
# 在请求头中添加 key 为 "foo"，值为 "bar" 的 header
MIDSCENE_MODEL_INIT_CONFIG_JSON='{"defaultHeaders":{"foo":"bar"}}'
```

如果你的模型服务商文档里把这个字段写成 `extra_headers` 或 `extraHeaders`，Midscene 也会兼容这两种别名，并自动归一化到 `defaultHeaders`。多个别名同时存在时，优先级为：`defaultHeaders` > `extra_headers` > `extraHeaders`。

你可以通过 JSON 序列化来生成这个 JSON 的文本以避免手动拼接出错：

```javascript
JSON.stringify({ defaultHeaders: { foo: 'bar' } })
```

## 如何使用 Azure OpenAI Service？

使用 Azure OpenAI Service 时，请先按 [模型配置](./model-common-config) 选择并填写对应模型的常规配置。Azure 只需要把模型服务地址和 API Key 换成 Azure 的写法：

```bash
MIDSCENE_MODEL_BASE_URL="https://<your-resource>.services.ai.azure.com/openai/v1" # 或 https://<your-resource>.openai.azure.com/openai/v1
MIDSCENE_MODEL_API_KEY="<your-azure-api-key>"
```

也就是说，`MIDSCENE_MODEL_NAME`、`MIDSCENE_MODEL_FAMILY` 等其他配置仍然按 [模型配置](./model-common-config) 中对应模型的说明填写；Azure 只是鉴权方式有所差异的模型供应商，而非一种特殊模型。

这会走普通 OpenAI-compatible 路径，以 `Authorization: Bearer ...` 请求头发送 `POST /openai/v1/chat/completions`。`MIDSCENE_MODEL_BASE_URL` 不要追加 `/chat/completions`。大多数 `/openai/v1` 端点不需要 `api-version`。

如果你的资源仍然以 `400 Missing required query parameter: api-version` 报错，说明该资源的 `/openai/v1` surface 尚未 GA。可以通过 `defaultQuery` 注入这个查询参数：

```bash
MIDSCENE_MODEL_INIT_CONFIG_JSON='{"defaultQuery":{"api-version":"preview"}}'
```

`api-version` 的值按你的资源要求填写（`preview`，或 Azure 门户里显示的带日期版本，如 `2025-01-01-preview`）。这样每个请求都会变成 `.../openai/v1/chat/completions?api-version=preview`。

如果某个 Azure-compatible 网关只接受 `api-key` 请求头，可以额外添加下面的配置，通过 header 发送真实 API Key：

```bash
MIDSCENE_MODEL_API_KEY="placeholder"
MIDSCENE_MODEL_INIT_CONFIG_JSON='{"defaultHeaders":{"api-key":"<your-azure-api-key>"}}'
```

这里的 `MIDSCENE_MODEL_API_KEY="placeholder"` 只是为了满足 OpenAI SDK 的初始化要求，真实 API Key 会通过 `defaultHeaders.api-key` 发送。

当某个资源同时需要 `api-version` 和 `api-key` 请求头时，可以把两种兜底配置合并：

```bash
MIDSCENE_MODEL_API_KEY="placeholder"
MIDSCENE_MODEL_INIT_CONFIG_JSON='{"defaultQuery":{"api-version":"preview"},"defaultHeaders":{"api-key":"<your-azure-api-key>"}}'
```

Azure AD / keyless 鉴权（`DefaultAzureCredential`）的方式现在已经不再支持，请使用 API Key 的方式。

## 使用 Azure OpenAI 时点击坐标偏移

在使用 GPT-5 系列模型时，你可能会发现：同一份脚本在 OpenAI 官方 API 上点击位置正确，但切到 Azure OpenAI 后点击位置出现固定比例的偏移。这个偏移和分辨率相关：截图较大时（如 `1920x1080`）出现，截图较小时（如 `1280x600`）则正常。

原因在于 Azure 端的图片处理。GPT-5 返回的是基于它实际看到的截图尺寸的绝对坐标，而 Midscene 发送图片时带上了 `"detail": "original"`，让模型看到原始分辨率的图片（参见 [GPT-5 说明](./model-common-config#gpt-5-4)）。Azure 没有正确处理 `"detail": "original"`，会在服务端对大图进行缩放（短边被压缩到 768）。于是模型在缩放后的坐标系里作答，而 Midscene 仍按原始分辨率还原坐标，最终产生按比例的偏移。可以通过 token 消耗来验证 `original` 是否生效：如果 `original` 生效，图片的 token 消耗会明显更高。

有两种规避办法：

1. 使用 OpenAI 官方的 GPT-5，或配置其他模型单独用于定位，而只把 Azure 平台的 GPT-5 作为规划模型。
2. 通过 Agent 参数 `screenshotShrinkFactor` 把截图预先缩放到较小尺寸，使图片不触发 Azure 的服务端缩放阈值。详见 [`screenshotShrinkFactor`](./api)。

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

## 如何通过链接控制报告中播放器的默认回放样式？

在报告页面的链接后添加查询参数即可覆盖 **Focus on cursor** 和 **Show element markers** 开关的默认值，决定是否在报告中聚焦鼠标位置和元素标记。使用 `focusOnCursor` 和 `showElementMarkers`，参数值支持 `true`、`false`、`1` 或 `0`，例如：`...?focusOnCursor=false&showElementMarkers=true`。

## 如何把报告以纯播放器的形式嵌入其它页面?

当你需要把报告嵌入到别的页面(例如放进 `iframe`)时,在报告链接后添加 `player-only=1` 查询参数,即可隐藏所有外围界面(顶部栏、侧边栏、时间线和详情面板),只保留回放播放器。另外两个参数用来调整播放器:

- `play-control=1` —— 在 player-only 模式下显示底部播放控制条(默认隐藏)。仅接受 `=1` 开启。
- `auto-play` —— 是否在加载后自动播放。它独立于 `player-only`,对所有报告播放器都生效。**默认开启**;添加 `auto-play=0` 可关闭自动播放。

典型的嵌入形如 `...?player-only=1&play-control=1`。它同样可以和 `#task-<id>` 锚点组合使用,从而深链到某一具体步骤并只展示该步骤的播放器:`...?player-only=1#task-0-5`。若想让任意报告(无论是否嵌入)打开时不自动播放,使用 `...?auto-play=0`。

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

通常来说新版本、参数大的模型会比老版本、参数小的模型表现更好。比如 Qwen3-VL 会好于 Qwen2.5-VL，它的 plus 版本会好于 flash 版本。

更多模型选择建议请参考 [模型策略](./model-strategy)。

### 3. 检查 Model Family 配置

确认你的模型配置中 `MIDSCENE_MODEL_FAMILY` 参数设置是否正确，`MIDSCENE_MODEL_FAMILY` 配置错误会影响 Midscene 对模型的适配逻辑。详见 [模型配置](./model-config)。

### 4. 优化提示词，结合视觉特征和位置信息

如果定位结果随机落在不相关的元素上，而且每次执行结果差异较大，通常说明模型无法理解图标按钮背后的语义。

以 `aiTap('个人中心')` 为例，这是一个功能性描述，模型可能并不了解个人中心图标具体的样式；而 `aiTap('人形头像 icon')` 是一个视觉性的描述，模型可以根据其视觉特征完成元素定位。

解决方法：优化提示词，结合视觉特征和位置信息来描述元素。

```typescript
// ❌ 仅使用功能性描述
await agent.aiTap('个人中心');

// ✅ 使用视觉性描述
await agent.aiTap('人形头像 icon');

// ✅ 结合视觉特征和位置信息
await agent.aiTap('页面右上角的人形头像图标');
```

### 5. 开启 `deepLocate`

如果定位结果落在目标元素附近，但有若干像素的偏移，说明模型大概率已经识别对了目标，只是在定位时仍有偏差。

解决方法：开启 `deepLocate` 会对定位效果有明显提升。

```typescript
await agent.aiTap('登录按钮', {
  deepLocate: true
});
```

更多关于 `deepLocate` 的说明，请参阅 [API 文档](/zh/api)。

### 6. 在 web 浏览器中将 dpr 提高到 2

如果你是在 web 浏览器里运行 Midscene，可以尝试将 dpr 提高到 `2`。一般 CI 环境中的默认 dpr 往往是 `1`，提高到 `2` 后页面会更清晰，对小元素的定位效果通常会更好。

需要注意的是，这会消耗更多 token。

## 豆包手机是否使用了 Midscene 作为底层方案？

没有。
