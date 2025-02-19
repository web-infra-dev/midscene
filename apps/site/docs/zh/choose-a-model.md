# 选择 AI 模型

在这篇文章中，我们将讨论如何为 Midscene.js 选择 AI 模型。所有这些配置都可以同时在浏览器插件和 SDK 中使用。

如果你想了解更多关于模型服务的配置项，请查看 [配置模型和服务商](./model-provider)。

:::info 先说结论
Midscene.js 推荐使用的三种模型是 GPT-4o，Qwen2.5-VL-72B-Instruct 和 UI-TARS。任选一个你最容易获取的模型开始使用即可。你也可以使用其他模型，但需要按照文章中的步骤去配置。
:::

## 推荐模型

Midscene.js 推荐使用的三种模型是 GPT-4o，Qwen2.5-VL-72B-Instruct 和 UI-TARS。

### GPT-4o

GPT-4o 是 OpenAI 提供的通用 LLM 模型，支持图像输入。这是 Midscene.js 的默认模型。

我们推荐在 GPT-4o 中使用逐步指令（step-by-step）的提示词。

**特性**

- **易于上手**：OpenAI 提供了非常友好的 API 接入，你只需要获取 API 密钥即可。
- **表现平稳**：它在交互（Action）、断言（Assertion）和查询（Query）方面表现均比较良好。

**限制**

- **成本较高**：Midscene 需要将截图和 DOM 树一起发送给模型，这会导致 token 消耗较高。例如，在 1280x800 分辨率下，eBay 首页需要 6000 个 token 输入，搜索结果页面则需要 9000 个 token 输入。因此，它的成本会显著高于其他模型。
- **内容限制**：它无法处理跨域的 `<iframe />` 或 `<canvas />` 标签中的内容。
- **分辨率限制**：它无法处理分辨率超过 2048x768 的图像。超尺寸输入会导致输出质量下降。
- **小图标识别能力较差**：它可能无法准确定位小图标。

**配置**

```bash
OPENAI_API_KEY="......"
OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1" # 可选，如果你想要使用一个不同于 OpenAI 官方的接入点
MIDSCENE_MODEL_NAME="gpt-4o-2024-11-20" # 可选，默认是 "gpt-4o"。
```

### Qwen 2.5 VL

Qwen 2.5 VL 是一个专为图像识别设计的开源模型，由阿里巴巴开发。在大多数情况下，它的表现与 GPT-4o 相当，甚至更好。

Qwen 2.5 VL 确实有内置的操作规划（action planning）功能来控制应用程序，但我们仍然推荐开发者使用详细的提示词来驱动，以获得更稳定和可靠的结果。

**特性**

- **低成本**：Midscene 不需要发送 DOM 树给模型。和 `gpt-4o` 相比，它可以节省 30% 到 50% 的 token 消耗，复杂场景下甚至更多。
- **高分辨率支持**：Qwen 2.5 VL 支持更高的分辨率输入，足以满足大多数情况。
- **开源**：这是一个开源模型，因此你可以选择使用云提供商已经部署好的版本，或者自己部署到你自己的服务器上。
- **速度更快**：在大多数情况下，Qwen 2.5 VL 可以比 `gpt-4o` 更快。但阿里云的 API 服务似乎不太稳定，不时会有些长耗时、影响体验的案例出现，有条件的开发者不妨尝试私有化部署。

**限制**

- **小图标识别能力较差**：和 `gpt-4o` 一样，它可能无法准确定位小图标。
- **断言能力一般**：在某些情况下，Qwen 2.5 VL 的断言能力可能不如 `gpt-4o`。
- **无法使用缓存**：目前在 Qwen 2.5 VL 中无法使用 Midscene.js 的缓存功能。

**配置**

除了常规配置，你还需要包含 `MIDSCENE_USE_QWEN_VL=1` 配置来启用 Qwen 2.5 模式。否则，它将使用默认的 `gpt-4o` 模式（这将使用更多的 token）。

```bash
OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1" # 或任何其他提供商的接入点。
OPENAI_API_KEY="......"
MIDSCENE_MODEL_NAME="qwen2.5-vl-72b-instruct"
MIDSCENE_USE_QWEN_VL=1 # 别忘了配置这项用于 Qwen 2.5 模式！
```

**资源**

- [Qwen 2.5 on 🤗 HuggingFace](https://huggingface.co/Qwen/Qwen2.5-VL-72B-Instruct)
- [Qwen 2.5 on Github](https://github.com/QwenLM/Qwen2.5-VL)
- [Qwen 2.5 - 阿里云百炼](https://bailian.console.aliyun.com/#/model-market/detail/qwen2.5-vl-72b-instruct)

### UI-TARS

UI-TARS 是一个专为 UI 自动化设计的开源模型。它仅以截图作为输入，并执行人类常用的交互（如键盘和鼠标操作），在 10 多个 GUI 基准测试中取得了顶尖性能。UI-TARS 是一个开源模型，并提供了不同大小的版本。

我们推荐在 UI-TARS 中使用目标驱动的提示词（target-driven prompt），如“使用用户名 foo 和密码 bar 登录”，它会逐步完成动作规划并执行。

**特性**

- **速度**：一个私有化的 UI-TARS 模型可以比通用 LLM 快 5 倍。当部署在性能良好的 GPU 服务器上时，每次 `.ai` 中的步骤可以在 1-2 秒内完成。
- **原生图像识别**：UI-TARS 可以识别截图中的图像，和 Qwen 2.5 VL 一样，在使用 UI-TARS 时， Midscene.js 不需要发送 DOM 树。
- **开源**：UI-TARS 是一个开源模型，因此你可以选择部署到你自己的服务器上，你的数据将不再发送到云端。
- **更稳定的短提示**：UI-TARS 针对 UI 自动化进行了优化，并能够处理更复杂的目标驱动的任务。在使用更短的提示词时，UI-TARS 的表现比通用 LLM 更好。

**限制**

- **断言能力较差**：在某些情况下，UI-TARS 的断言能力可能不如 `gpt-4o`。

**配置**

除了常规配置，你还需要包含 `MIDSCENE_USE_VLM_UI_TARS=1` 配置来启用 UI-TARS 模式。否则，你会遇到一些 JSON 解析错误。

```bash
OPENAI_BASE_URL="....."
OPENAI_API_KEY="......" 
MIDSCENE_MODEL_NAME="ui-tars-7b-sft"
MIDSCENE_USE_VLM_UI_TARS=1 # 别忘了配置这项用于 UI-TARS 模式！
```

**资源**

- [UI-TARS on 🤗 HuggingFace](https://huggingface.co/bytedance-research/UI-TARS-72B-SFT)
- [UI-TARS on Github](https://github.com/bytedance/ui-tars)
- [UI-TARS - 模型部署指南](https://juniper-switch-f10.notion.site/UI-TARS-Model-Deployment-Guide-17b5350241e280058e98cea60317de71)

:::info 我究竟从哪个模型开始使用？
选择你最容易获取的模型开始使用即可。当你写好脚本后，可以再尝试使用其他模型，看看是否可以有更好的表现。
:::

## 选择其他通用 LLM 模型

Midscene 也支持其他通用 LLM 模型。Midscene 会使用和 `gpt-4o` 模式下相同的提示词和策略来驱动这些模型。如果你想要选用其他模型，请按照以下步骤操作：
1. 必须使用多模态模型，也就是支持图像输入的模型。
1. 模型越大，效果表现越好。当然，这也意味着需要更多的 GPU 资源（或更贵的 API 服务）。
1. 找出如何使用与 OpenAI SDK 兼容的方式调用它，服务商一般都会提供这样的接入点，你需要配置的是 `OPENAI_BASE_URL`, `OPENAI_API_KEY` 和 `MIDSCENE_MODEL_NAME`。
1. 如果发现使用新模型后效果不佳，可以尝试使用一些简短且清晰的提示词（或回滚到之前的模型）。更多详情请参阅 [编写提示词（指令）的技巧](./prompting-tips)。
1. 请遵守各模型和服务商的使用条款。
1. 不要包含 `MIDSCENE_USE_VLM_UI_TARS` 和 `MIDSCENE_USE_QWEN_VL` 配置，除非你知道自己在做什么。

### 已知支持的通用 LLM 模型

我们已知支持以下模型，它们在不同场景下可能表现各异：

- `claude-3-opus-20240229`
- `gemini-1.5-pro`
- `qwen-vl-max-latest`（千问）
- `doubao-vision-pro-32k`（豆包）

### 配置

```bash
MIDSCENE_MODEL_NAME="....."
OPENAI_BASE_URL="......"
OPENAI_API_KEY="......"
```

更多详情请参阅 [配置模型和服务商](./model-provider)。

## 常见问题

### 如何确认模型的 token 使用情况？

通过设置 `MIDSCENE_DEBUG_AI_PROFILE=1` 环境变量，你可以打印模型的使用情况和响应时间。

## 更多

* [配置模型和服务商](./model-provider)
* [Github - UI-TARS](https://github.com/bytedance/ui-tars)