# Customize Model and Provider

Midscene uses the OpenAI SDK to call AI services. You can customize the configuration using environment variables.

There are the main configs, in which `OPENAI_API_KEY` is required.

Required:

```bash
# replace by your own
export OPENAI_API_KEY="sk-abcdefghijklmnopqrstuvwxyz"
```

Optional configs:

```bash
# if you want to use a customized endpoint
export OPENAI_BASE_URL="https://..."

# if you want to use Azure OpenAI Service
export OPENAI_USE_AZURE="true"

# if you want to specify a model name other than gpt-4o
export MIDSCENE_MODEL_NAME='claude-3-opus-20240229';

# if you want to pass customized JSON data to the `init` process of OpenAI SDK
export MIDSCENE_OPENAI_INIT_CONFIG_JSON='{"baseURL":"....","defaultHeaders":{"key": "value"}}'

# if you want to use proxy. Midscene uses `socks-proxy-agent` under the hood.
export MIDSCENE_OPENAI_SOCKS_PROXY="socks5://127.0.0.1:1080"
```

Note:

- Always choose a model that supports vision input. Currently, the known supported models are:
  - OpenAI: `gpt-4o`
  - Aliyun: `qwen-vl-max-latest`
- Please follow the terms of use of each model.
