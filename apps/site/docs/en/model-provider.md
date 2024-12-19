# Customize Model and Provider

Midscene uses the OpenAI SDK to call AI services. You can customize the configuration using environment variables. All the configs can also be used in the [Chrome Extension](./quick-experience.html).

These are the main configs, in which `OPENAI_API_KEY` is required.

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
export MIDSCENE_MODEL_NAME='qwen-vl-max-lates';

# if you want to pass customized JSON data to the `init` process of OpenAI SDK
export MIDSCENE_OPENAI_INIT_CONFIG_JSON='{"baseURL":"....","defaultHeaders":{"key": "value"}}'

# if you want to use proxy. Midscene uses `socks-proxy-agent` under the hood.
export MIDSCENE_OPENAI_SOCKS_PROXY="socks5://127.0.0.1:1080"
```

Note:

- Always choose a model that supports vision input. 
- Currently, the known supported models are: `gpt-4o`, `qwen-vl-max-latest`, `gemini-1.5-pro`
- Please follow the terms of use of each model.

## Example: Using `qwen-vl-max-latest` service from Aliyun

Configure the environment variables:

```bash
export OPENAI_API_KEY="sk-..."
export OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
export MIDSCENE_MODEL_NAME="qwen-vl-max-latest"
```
