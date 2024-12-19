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

使用 Azure OpenAI 服务时的配置：

```bash
export MIDSCENE_USE_AZURE_OPENAI=1
export MIDSCENE_AZURE_OPENAI_SCOPE="https://cognitiveservices.azure.com/.default"
export MIDSCENE_AZURE_OPENAI_INIT_CONFIG_JSON='{"apiVersion": "2024-11-01-preview", "endpoint": "...", "deployment": "..."}'
```

说明：

- 务必选择一个支持视觉输入的模型。目前我们已知支持的模型有：`gpt-4o`, `qwen-vl-max-latest` (千问), `gemini-1.5-pro`
- 请遵守各项模型的使用条款

## 示例：使用部署在阿里云的 `qwen-vl-max-latest` 模型

配置环境变量：

```bash
export OPENAI_API_KEY="sk-..."
export OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
export MIDSCENE_MODEL_NAME="qwen-vl-max-latest"
```
