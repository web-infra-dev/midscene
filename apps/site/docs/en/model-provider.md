# Customize Model and Provider

Midscene uses the OpenAI SDK to call AI services. You can customize the configuration using environment variables. All the configs can also be used in the [Chrome Extension](./quick-experience).

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

# if you want to use Azure OpenAI Service. See more details in the next section.
export OPENAI_USE_AZURE="true"

# if you want to specify a model name other than gpt-4o
export MIDSCENE_MODEL_NAME='qwen-vl-max-latest';

# if you want to pass customized JSON data to the `init` process of OpenAI SDK
export MIDSCENE_OPENAI_INIT_CONFIG_JSON='{"baseURL":"....","defaultHeaders":{"key": "value"}}'

# if you want to use proxy. Midscene uses `socks-proxy-agent` under the hood.
export MIDSCENE_OPENAI_SOCKS_PROXY="socks5://127.0.0.1:1080"

# if you want to specify the max tokens for the model
export OPENAI_MAX_TOKENS=2048
```

## Using Azure OpenAI Service

Use ADT token provider

```bash
# this is always true when using Azure OpenAI Service
export MIDSCENE_USE_AZURE_OPENAI=1

export MIDSCENE_AZURE_OPENAI_SCOPE="https://cognitiveservices.azure.com/.default"
export AZURE_OPENAI_ENDPOINT="..."
export AZURE_OPENAI_API_VERSION="2024-05-01-preview"
export AZURE_OPENAI_DEPLOYMENT="gpt-4o"
```

Or use keyless authentication

```bash
export MIDSCENE_USE_AZURE_OPENAI=1
export AZURE_OPENAI_ENDPOINT="..."
export AZURE_OPENAI_KEY="..."
export AZURE_OPENAI_API_VERSION="2024-05-01-preview"
export AZURE_OPENAI_DEPLOYMENT="gpt-4o"
```

## Choose a model other than `gpt-4o`

We find that `gpt-4o` performs the best for Midscene at this moment. The other known supported models are `claude-3-opus-20240229`, `gemini-1.5-pro`, `qwen-vl-max-latest`, `doubao-vision-pro-32k`

If you want to use other models, please follow these steps:

1. Choose a model that supports image input (a.k.a. multimodal model).
2. Find out how to to call it with an OpenAI SDK compatible endpoint. Usually you should set the `OPENAI_BASE_URL`, `OPENAI_API_KEY` and `MIDSCENE_MODEL_NAME`.
3. If you find it not working well after changing the model, you can try using some short and clear prompt (or roll back to the previous model). See more details in [Prompting Tips](./prompting-tips).
4. Remember to follow the terms of use of each model.

## Example: Using `claude-3-opus-20240229` from Anthropic

When configuring `MIDSCENE_USE_ANTHROPIC_SDK=1`, Midscene will use Anthropic SDK (`@anthropic-ai/sdk`) to call the model.

Configure the environment variables:

```bash
export MIDSCENE_USE_ANTHROPIC_SDK=1
export ANTHROPIC_API_KEY="....."
export MIDSCENE_MODEL_NAME="claude-3-opus-20240229"
```

## Example: Using `gemini-1.5-pro` from Google

Configure the environment variables:

```bash
export OPENAI_BASE_URL="https://generativelanguage.googleapis.com/v1beta/openai"
export OPENAI_API_KEY="....."
export MIDSCENE_MODEL_NAME="gemini-1.5-pro"
```

## Example: Using `qwen-vl-max-latest` from Aliyun

Configure the environment variables:

```bash
export OPENAI_API_KEY="sk-..."
export OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
export MIDSCENE_MODEL_NAME="qwen-vl-max-latest"
```

## Example: Using `doubao-vision-pro-32k` from Volcengine

Create a inference point first: https://console.volcengine.com/ark/region:ark+cn-beijing/endpoint

Configure the environment variables:

```bash
export OPENAI_BASE_URL="https://ark.cn-beijing.volces.com/api/v3"
export OPENAI_API_KEY="..."
export MIDSCENE_MODEL_NAME="ep-202....."
```

## Example: config request headers (like for openrouter)

```bash
export OPENAI_BASE_URL="https://openrouter.ai/api/v1"
export OPENAI_API_KEY="..."
export MIDSCENE_MODEL_NAME="..."
export MIDSCENE_OPENAI_INIT_CONFIG_JSON='{"defaultHeaders":{"HTTP-Referer":"...","X-Title":"..."}}'
```

## Troubleshooting LLM Service Connectivity Issues

If you want to troubleshoot connectivity issues, you can use the 'connectivity-test' folder in our example project: [https://github.com/web-infra-dev/midscene-example/tree/main/connectivity-test](https://github.com/web-infra-dev/midscene-example/tree/main/connectivity-test)

Put your `.env` file in the `connectivity-test` folder, and run the test with `npm i && npm run test`.
