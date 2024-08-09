# 自定义模型服务

Midscene 默认集成了 OpenAI SDK 调用 AI 服务，你也可以通过环境变量来自定义配置。

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
export MIDSCENE_MODEL_NAME='claude-3-opus-20240229';

# 可选, 如果你想变更 SDK 的初始化参数
export MIDSCENE_OPENAI_INIT_CONFIG_JSON='{"baseURL":"....","defaultHeaders":{"key": "value"}}'
```
