# 自定义模型和服务商

Midscene 默认集成了 OpenAI SDK 调用 AI 服务，你可以通过环境变量来自定义配置。这些配置同样可以在 [Chrome 插件](./quick-experience) 中使用。

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
export MIDSCENE_MODEL_NAME='qwen-vl-max-latest';

# 可选, 如果你想变更 SDK 的初始化参数
export MIDSCENE_OPENAI_INIT_CONFIG_JSON='{"baseURL":"....","defaultHeaders":{"key": "value"}}'

# 可选, 如果你想使用代理。Midscene 使用 `socks-proxy-agent` 作为底层库。
export MIDSCENE_OPENAI_SOCKS_PROXY="socks5://127.0.0.1:1080"

# 可选, 如果你想指定模型 max_tokens
export OPENAI_MAX_TOKENS=2048
```

## 使用 Azure OpenAI 服务时的配置

使用 ADT token provider

```bash
# 使用 Azure OpenAI 服务时，配置为 1
export MIDSCENE_USE_AZURE_OPENAI=1

export MIDSCENE_AZURE_OPENAI_SCOPE="https://cognitiveservices.azure.com/.default"
export AZURE_OPENAI_ENDPOINT="..."
export AZURE_OPENAI_API_VERSION="2024-05-01-preview"
export AZURE_OPENAI_DEPLOYMENT="gpt-4o"
```

使用 keyless 模式

```bash
export MIDSCENE_USE_AZURE_OPENAI=1
export AZURE_OPENAI_ENDPOINT="..."
export AZURE_OPENAI_KEY="..."
export AZURE_OPENAI_API_VERSION="2024-05-01-preview"
export AZURE_OPENAI_DEPLOYMENT="gpt-4o"
```

## 选用 `gpt-4o` 以外的其他模型

我们发现 `gpt-4o` 是目前表现最佳的模型。其他已知支持的模型有：`claude-3-opus-20240229`, `gemini-1.5-pro`, `qwen-vl-max-latest`（千问）, `doubao-vision-pro-32k`（豆包）

如果你想要使用其他模型，请遵循以下步骤：

1. 选择一个支持视觉输入的模型（也就是“多模态模型”）。
2. 找出如何使用 OpenAI SDK 兼容的方式调用它，模型提供商一般都会提供这样的接入点，你需要配置的是 `OPENAI_BASE_URL`, `OPENAI_API_KEY` 和 `MIDSCENE_MODEL_NAME`。
3. 如果发现使用新模型后效果不佳，可以尝试使用一些简短且清晰的提示词（或回滚到之前的模型）。更多详情请参阅 [Prompting Tips](./prompting-tips)。
4. 请遵守各模型的使用条款。

## 示例：使用阿里云的 `qwen-vl-max-latest` 模型

配置环境变量：

```bash
export OPENAI_API_KEY="sk-..."
export OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
export MIDSCENE_MODEL_NAME="qwen-vl-max-latest"
```

## 示例：使用 Anthropic 的 `claude-3-opus-20240229` 模型

当配置 `MIDSCENE_USE_ANTHROPIC_SDK=1` 时，Midscene 会使用 Anthropic SDK (`@anthropic-ai/sdk`) 来调用模型。

配置环境变量：

```bash
export MIDSCENE_USE_ANTHROPIC_SDK=1
export ANTHROPIC_API_KEY="....."
export MIDSCENE_MODEL_NAME="claude-3-opus-20240229"
```

## 示例：使用 Google 的 `gemini-1.5-pro` 模型

配置环境变量：

```bash
export OPENAI_BASE_URL="https://generativelanguage.googleapis.com/v1beta/openai"
export OPENAI_API_KEY="....."
export MIDSCENE_MODEL_NAME="gemini-1.5-pro"
```

## 示例：使用火山云的豆包 `doubao-vision-pro-32k` 模型

调用前需要配置推理点：https://console.volcengine.com/ark/region:ark+cn-beijing/endpoint

配置环境变量：

```bash
export OPENAI_BASE_URL="https://ark.cn-beijing.volces.com/api/v3"
export OPENAI_API_KEY="..."
export MIDSCENE_MODEL_NAME="ep-202....."
```

## 调试 LLM 服务连接问题

如果你想要调试 LLM 服务连接问题，可以使用示例项目中的 `connectivity-test` 目录：[https://github.com/web-infra-dev/midscene-example/tree/main/connectivity-test](https://github.com/web-infra-dev/midscene-example/tree/main/connectivity-test)

将你的 `.env` 文件放在 `connectivity-test` 文件夹中，然后运行 `npm i && npm run test` 来查看问题。
