# 自定义模型和服务商

Midscene 默认集成了 OpenAI SDK 调用 AI 服务，你可以通过环境变量来自定义配置。这些配置同样可以在 [Chrome 插件](./quick-experience.html) 中使用。

主要配置项如下，其中 `OPENAI_API_KEY` 是必选项：

必选项:

```bash
# 替换为你自己的 API Key
export OPENAI_API_KEY="sk-abcdefghijklmnopqrstuvwxyz"
```

可选项:

```bash
# 可选, 如果你想更换 base URL
export OPENAI_BASE_URL="https://..."

# 可选, 如果你想指定模型名称
export MIDSCENE_MODEL_NAME='qwen-vl-max-lates';

# 可选, 如果你想变更 SDK 的初始化参数
export MIDSCENE_OPENAI_INIT_CONFIG_JSON='{"baseURL":"....","defaultHeaders":{"key": "value"}}'

# 可选, 如果你想使用代理。Midscene 使用 `socks-proxy-agent` 作为底层库。
export MIDSCENE_OPENAI_SOCKS_PROXY="socks5://127.0.0.1:1080"
```

## 使用 Azure OpenAI 服务时的配置

```bash
export MIDSCENE_USE_AZURE_OPENAI=1
export MIDSCENE_AZURE_OPENAI_SCOPE="https://cognitiveservices.azure.com/.default"
export MIDSCENE_AZURE_OPENAI_INIT_CONFIG_JSON='{"apiVersion": "2024-11-01-preview", "endpoint": "...", "deployment": "..."}'
```

## 选用 `gpt-4o` 以外的其他模型

我们发现 `gpt-4o` 是目前表现最佳的模型。其他已知支持的模型有：`qwen-vl-max-latest` (千问), `gemini-1.5-pro`, `doubao-vision-pro-32k` (豆包)

如果你想要使用其他模型，请遵循以下步骤：

1. 选择一个支持视觉输入的模型（也就是“多模态模型”）。
2. 找出如何使用 OpenAI SDK 兼容的方式调用它，模型提供商一般都会提供这样的接入点，你需要配置的是 `OPENAI_BASE_URL`, `OPENAI_API_KEY` 和 `MIDSCENE_MODEL_NAME`。
3. 如果发现使用新模型后效果不佳，可以尝试使用一些简短且清晰的提示词（或回滚到之前的模型）。更多详情请参阅 [Prompting Tips](./prompting-tips.html)。
4. 请遵守各模型的使用条款。

## 示例：使用 Google 的 `gemini-1.5-pro` 模型

配置环境变量：

```bash
export OPENAI_BASE_URL="https://generativelanguage.googleapis.com/v1beta/openai"
export OPENAI_API_KEY="....."
export MIDSCENE_MODEL_NAME="gemini-1.5-pro"
```

## 示例：使用阿里云的 `qwen-vl-max-latest` 模型

配置环境变量：

```bash
export OPENAI_API_KEY="sk-..."
export OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
export MIDSCENE_MODEL_NAME="qwen-vl-max-latest"
```

## 示例：使用火山云的豆包 `doubao-vision-pro-32k` 模型

调用前需要配置推理点：https://console.volcengine.com/ark/region:ark+cn-beijing/endpoint

配置环境变量：

```bash
export OPENAI_BASE_URL="https://ark.cn-beijing.volces.com/api/v3"
export OPENAI_API_KEY="..."
export MIDSCENE_MODEL_NAME="ep-202....."
```
