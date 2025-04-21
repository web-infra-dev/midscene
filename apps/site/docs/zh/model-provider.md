# 配置模型和服务商

Midscene 默认集成了 OpenAI SDK 调用 AI 服务。使用这个 SDK 限定了 AI 服务出入参的形式，但并不意味着你只能使用 OpenAI 的模型，你可以使用任何兼容此类接口的模型服务（绝大多数平台或工具都支持）。

在本文中，我们将展示如何配置 AI 提供商，以及如何选择不同的模型。你可以先阅读 [选择 AI 模型](./choose-a-model) 来了解如何选择模型。

## 配置

### 通用配置

你可以通过环境变量来自定义配置。这些配置同样可以在 [Chrome 插件](./quick-experience) 中使用。

常用的主要配置项如下，其中 `OPENAI_API_KEY` 是必选项：

| 名称 | 描述 |
|------|-------------|
| `OPENAI_API_KEY` | 必选项。你的 OpenAI API Key (如 "sk-abcdefghijklmnopqrstuvwxyz") |
| `OPENAI_BASE_URL` | 可选。API 的接入 URL。常用于切换到其他模型服务，如 `https://some_service_name.com/v1` |
| `MIDSCENE_MODEL_NAME` | 可选。指定一个不同的模型名称 (默认是 gpt-4o)。常用于切换到其他模型服务|

使用 `Qwen 2.5 VL` 模型：

| 名称 | 描述 |
|------|-------------|
| `MIDSCENE_USE_QWEN_VL` | 可选。设置为 "1" 以使用 Qwen 2.5 VL 模型 |

使用 `UI-TARS` 模型：

| 名称 | 描述 |
|------|-------------|
| `MIDSCENE_USE_VLM_UI_TARS` | 可选。设置为 "1" 以使用 UI-TARS 模型 |

关于模型的更多信息，请参阅 [选择 AI 模型](./choose-a-model)。

### 高级配置

还有一些高级配置项，通常不需要使用。

| 名称 | 描述 |
|------|-------------|
| `OPENAI_USE_AZURE` | 可选。设置为 "true" 以使用 Azure OpenAI Service。更多详情请参阅后文 |
| `MIDSCENE_OPENAI_INIT_CONFIG_JSON` | 可选。OpenAI SDK 的初始化配置 JSON |
| `MIDSCENE_OPENAI_SOCKS_PROXY` | 可选。代理配置 (如 "socks5://127.0.0.1:1080") |
| `OPENAI_MAX_TOKENS` | 可选。模型响应的 max_tokens 数 |

### 调试配置

通过设置以下配置，可以打印更多日志用于调试。这些日志也会打印到 `./midscene_run/log` 文件夹中。

| 名称 | 描述 |
|------|-------------|
| `DEBUG=midscene:ai:profile:stats` | 可选。设置此项，可以打印 AI 服务消耗的时间、token 使用情况，用逗号分隔，便于分析 |
| `DEBUG=midscene:ai:profile:detail` | 可选。设置此项，可以打印 AI token 消耗信息的详情 |
| `DEBUG=midscene:ai:call` | 可选。设置此项，可以打印 AI 响应详情 |
| `DEBUG=midscene:android:adb` | 可选。设置此项，可以打印 Android adb 命令调用详情 |

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

## 使用 Azure OpenAI 服务时的配置

### 使用 ADT token provider

此种模式无法运行在浏览器插件中。

```bash
# 使用 Azure OpenAI 服务时，配置为 1
export MIDSCENE_USE_AZURE_OPENAI=1

export MIDSCENE_AZURE_OPENAI_SCOPE="https://cognitiveservices.azure.com/.default"
export AZURE_OPENAI_ENDPOINT="..."
export AZURE_OPENAI_API_VERSION="2024-05-01-preview"
export AZURE_OPENAI_DEPLOYMENT="gpt-4o"
```

### 使用 keyless 模式

```bash
export MIDSCENE_USE_AZURE_OPENAI=1
export AZURE_OPENAI_ENDPOINT="..."
export AZURE_OPENAI_KEY="..."
export AZURE_OPENAI_API_VERSION="2024-05-01-preview"
export AZURE_OPENAI_DEPLOYMENT="gpt-4o"
```

## 使用 Javascript 配置 AI 服务

你也可以在运行 Midscene 代码之前，使用 Javascript 来配置 AI 服务。

```typescript
import { overrideAIConfig } from "@midscene/core/env";

overrideAIConfig({
  MIDSCENE_MODEL_NAME: "...",
  // ...
});
```

## 示例：使用 OpenAI 的 `gpt-4o` 模型

配置环境变量：

```bash
export OPENAI_API_KEY="sk-..."
export OPENAI_BASE_URL="https://endpoint.some_other_provider.com/v1" # 可选，如果你想要使用一个不同于 OpenAI 官方的接入点
export MIDSCENE_MODEL_NAME="gpt-4o-2024-11-20" # 可选，默认是 "gpt-4o"
```

## 示例：使用阿里云官方的 `qwen-vl-max-latest` 模型

配置环境变量：

```bash
export OPENAI_API_KEY="sk-..."
export OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
export MIDSCENE_MODEL_NAME="qwen-vl-max-latest"
export MIDSCENE_USE_QWEN_VL=1
```

## 示例：使用 UI-TARS 模型

配置环境变量：

```bash
export OPENAI_BASE_URL="http://localhost:1234/v1"
export MIDSCENE_MODEL_NAME="ui-tars-72b-sft"
export MIDSCENE_USE_VLM_UI_TARS=1
```

## 示例：使用 Anthropic 的 `claude-3-opus-20240229` 模型

当配置 `MIDSCENE_USE_ANTHROPIC_SDK=1` 时，Midscene 会使用 Anthropic SDK (`@anthropic-ai/sdk`) 来调用模型。

配置环境变量：

```bash
export MIDSCENE_USE_ANTHROPIC_SDK=1
export ANTHROPIC_API_KEY="....."
export MIDSCENE_MODEL_NAME="claude-3-opus-20240229"
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

## 示例：使用 Google 的 `gemini-1.5-pro` 模型

配置环境变量：

```bash
export OPENAI_BASE_URL="https://generativelanguage.googleapis.com/v1beta/openai"
export OPENAI_API_KEY="....."
export MIDSCENE_MODEL_NAME="gemini-1.5-pro"
```

## 调试 LLM 服务连接问题

如果你想要调试 LLM 服务连接问题，可以使用示例项目中的 `connectivity-test` 目录：[https://github.com/web-infra-dev/midscene-example/tree/main/connectivity-test](https://github.com/web-infra-dev/midscene-example/tree/main/connectivity-test)

将你的 `.env` 文件放在 `connectivity-test` 文件夹中，然后运行 `npm i && npm run test` 来查看问题。
