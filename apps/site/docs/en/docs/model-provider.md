# Customize model provider

Midscene uses the OpenAI SDK as the default AI service. You can customize the configuration using environment variables.

There are the main configs, in which `OPENAI_API_KEY` is required.

Required:

```bash
# replace by your own
export OPENAI_API_KEY="sk-abcdefghijklmnopqrstuvwxyz"
```

Optional:

```bash
# optional, if you want to use a customized endpoint
export OPENAI_BASE_URL="https://..."

# optional, if you want to use Azure OpenAI Service
export OPENAI_USE_AZURE="true"

# optional, if you want to specify a model name other than gpt-4o
export MIDSCENE_MODEL_NAME='claude-3-opus-20240229';

# optional, if you want to pass customized JSON data to the `init` process of OpenAI SDK
export MIDSCENE_OPENAI_INIT_CONFIG_JSON='{"baseURL":"....","defaultHeaders":{"key": "value"}}'
```
