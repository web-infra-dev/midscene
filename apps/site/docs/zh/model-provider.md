# 自定义模型和服务商

Midscene 默认集成了 OpenAI SDK 调用 AI 服务。使用这个 SDK 限定了 AI 服务出入参的形式，但并不意味着你只能使用 OpenAI 的模型，你可以使用任何兼容此类接口的模型服务（绝大多数平台或工具都支持）。

在本文中，我们将展示如何配置 AI 服务提供商，以及如何选择不同的模型。

## 配置

你可以通过环境变量来自定义配置。这些配置同样可以在 [Chrome 插件](./quick-experience) 中使用。

常用的主要配置项如下，其中 `OPENAI_API_KEY` 是必选项。

| 名称 | 描述 |
|------|-------------|
| `OPENAI_API_KEY` | 必选项。你的 OpenAI API Key (如 "sk-abcdefghijklmnopqrstuvwxyz") |
| `OPENAI_BASE_URL` | 可选。API 的接入 URL。常用于切换到其他模型服务|
| `MIDSCENE_MODEL_NAME` | 可选。指定一个不同的模型名称 (默认是 gpt-4o)。常用于切换到其他模型服务|

还有一些高级配置项，通常不需要使用。

| 名称 | 描述 |
|------|-------------|
| `OPENAI_USE_AZURE` | 可选。设置为 "true" 以使用 Azure OpenAI Service。更多详情请参阅后文 |
| `MIDSCENE_OPENAI_INIT_CONFIG_JSON` | 可选。OpenAI SDK 的初始化配置 JSON |
| `MIDSCENE_OPENAI_SOCKS_PROXY` | 可选。代理配置 (如 "socks5://127.0.0.1:1080") |
| `OPENAI_MAX_TOKENS` | 可选。模型响应的 max_tokens 数 |

## 两种配置环境变量的方式

选择其中一种方式来配置环境变量。

### 方法一：在系统中设置环境变量

```bash
# 替换为你自己的 API Key
export OPENAI_API_KEY="sk-abcdefghijklmnopqrstuvwxyz"
```

### 方法二：使用 dotenv 配置环境变量

我们的 [demo 项目](https://github.com/web-infra-dev/midscene-example) 使用了这种方式。

[Dotenv](https://www.npmjs.com/package/dotenv) 是一个零依赖的 npm 包，用于将环境变量从 `.env` 文件加载到环境变量 `process.env` 中。

```bash
# 安装 dotenv
npm install dotenv --save
```

在项目根目录下创建一个 `.env` 文件，并添加以下内容。注意，这里不需要在每一行前添加 `export`。

```bash
OPENAI_API_KEY="sk-abcdefghijklmnopqrstuvwxyz"
```

在脚本中导入 dotenv 模块，导入后它会自动读取 `.env` 文件中的环境变量。

```typescript
import 'dotenv/config';
```

## 选用 `gpt-4o` 以外的其他模型

我们发现 `gpt-4o` 是目前表现最佳的模型。其他已知支持的模型有：`claude-3-opus-20240229`, `gemini-1.5-pro`, `qwen-vl-max-latest`（千问）, `doubao-vision-pro-32k`（豆包）

如果你想要使用其他模型，请遵循以下步骤：

1. 选择一个支持视觉输入的模型（也就是“多模态模型”）。
2. 找出如何使用 OpenAI SDK 兼容的方式调用它，模型提供商一般都会提供这样的接入点，你需要配置的是 `OPENAI_BASE_URL`, `OPENAI_API_KEY` 和 `MIDSCENE_MODEL_NAME`。
3. 如果发现使用新模型后效果不佳，可以尝试使用一些简短且清晰的提示词（或回滚到之前的模型）。更多详情请参阅 [Prompting Tips](./prompting-tips)。
4. 请遵守各模型的使用条款。


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

在推理点界面中，寻找一个如 `ep-202...` 形式的 ID 作为模型名称。

配置环境变量：

```bash
export OPENAI_BASE_URL="https://ark.cn-beijing.volces.com/api/v3"
export OPENAI_API_KEY="..."
export MIDSCENE_MODEL_NAME="ep-202....."
```

## 调试 LLM 服务连接问题

如果你想要调试 LLM 服务连接问题，可以使用示例项目中的 `connectivity-test` 目录：[https://github.com/web-infra-dev/midscene-example/tree/main/connectivity-test](https://github.com/web-infra-dev/midscene-example/tree/main/connectivity-test)

将你的 `.env` 文件放在 `connectivity-test` 文件夹中，然后运行 `npm i && npm run test` 来查看问题。
