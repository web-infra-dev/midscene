# Config Model and Provider

Midscene uses the OpenAI SDK to call AI services. Using this SDK limits the input and output schema of AI services, but it doesn't mean you can only use OpenAI's services. You can use any model service that supports the same interface (most platforms or tools support this).

In this article, we will show you how to config AI service provider and how to choose a different model. You may read [Choose a model](./choose-a-model) first to learn more about how to choose a model.

## Configs

### Common configs
These are the most common configs, in which `OPENAI_API_KEY` is required.

| Name | Description |
|------|-------------|
| `OPENAI_API_KEY` | Required. Your OpenAI API key (e.g. "sk-abcdefghijklmnopqrstuvwxyz") |
| `OPENAI_BASE_URL` | Optional. Custom endpoint URL for API endpoint. Use it to switch to a provider other than OpenAI (e.g. "https://some_service_name.com/v1") |
| `MIDSCENE_MODEL_NAME` | Optional. Specify a different model name other than `gpt-4o` |

Extra configs to use `Qwen 2.5 VL` model:

| Name | Description |
|------|-------------|
| `MIDSCENE_USE_QWEN_VL` | Set to "1" to use the adapter of Qwen 2.5 VL model |

Extra configs to use `UI-TARS` model:

| Name | Description |
|------|-------------|
| `MIDSCENE_USE_VLM_UI_TARS` | Version of UI-TARS model, supported values are `1.0` `1.5` `DOUBAO` (volcengine version) |

Extra configs to use `Gemini 2.5 Pro` model:

| Name | Description |
|------|-------------|
| `MIDSCENE_USE_GEMINI` | Set to "1" to use the adapter of Gemini 2.5 Pro model |

For more information about the models, see [Choose a model](./choose-a-model).

### Advanced configs

Some advanced configs are also supported. Usually you don't need to use them.

| Name | Description |
|------|-------------|
| `OPENAI_USE_AZURE` | Optional. Set to "true" to use Azure OpenAI Service. See more details in the following section. |
| `MIDSCENE_OPENAI_INIT_CONFIG_JSON` | Optional. Custom JSON config for OpenAI SDK initialization |
| `MIDSCENE_OPENAI_SOCKS_PROXY` | Optional. Proxy configuration (e.g. "socks5://127.0.0.1:1080") |
| `OPENAI_MAX_TOKENS` | Optional. Maximum tokens for model response |

### Debug configs

By setting the following configs, you can see more logs for debugging. And also, they will be printed into the `./midscene_run/log` folder.

| Name | Description |
|------|-------------|
| `DEBUG=midscene:ai:profile:stats` | Optional. Set this to print the AI service cost time, token usage, etc. in comma separated format, useful for analysis |
| `DEBUG=midscene:ai:profile:detail` | Optional. Set this to print the AI token usage details |
| `DEBUG=midscene:ai:call` | Optional. Set this to print the AI response details |
| `DEBUG=midscene:android:adb` | Optional. Set this to print the adb command calling details |

## Two ways to config environment variables

Pick one of the following ways to config environment variables.

### 1. Set environment variables in your system

```bash
# replace by your own
export OPENAI_API_KEY="sk-abcdefghijklmnopqrstuvwxyz"
```

### 2. Set environment variables using dotenv

This is what we used in our [demo project](https://github.com/web-infra-dev/midscene-example).

[Dotenv](https://www.npmjs.com/package/dotenv) is a zero-dependency module that loads environment variables from a `.env` file into `process.env`.

```bash
# install dotenv
npm install dotenv --save
```

Create a `.env` file in your project root directory, and add the following content. There is no need to add `export` before each line.

```
OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz
```

Import the dotenv module in your script. It will automatically read the environment variables from the `.env` file.

```typescript
import 'dotenv/config';
```

## Using Azure OpenAI Service

There are some extra configs when using Azure OpenAI Service.

### Use ADT token provider

This mode cannot be used in Chrome extension.

```bash
# this is always true when using Azure OpenAI Service
export MIDSCENE_USE_AZURE_OPENAI=1

export MIDSCENE_AZURE_OPENAI_SCOPE="https://cognitiveservices.azure.com/.default"
export AZURE_OPENAI_ENDPOINT="..."
export AZURE_OPENAI_API_VERSION="2024-05-01-preview"
export AZURE_OPENAI_DEPLOYMENT="gpt-4o"
```

### Use keyless authentication

```bash
export MIDSCENE_USE_AZURE_OPENAI=1
export AZURE_OPENAI_ENDPOINT="..."
export AZURE_OPENAI_KEY="..."
export AZURE_OPENAI_API_VERSION="2024-05-01-preview"
export AZURE_OPENAI_DEPLOYMENT="gpt-4o"
```

## Set Config by Javascript

You can also override the config by javascript. Remember to call this before running Midscene codes.

```typescript
import { overrideAIConfig } from "@midscene/core/env";

overrideAIConfig({
  MIDSCENE_MODEL_NAME: "...",
  // ...
});
```

## Example: Using `gpt-4o` from OpenAI

Configure the environment variables:

```bash
export OPENAI_API_KEY="sk-..."
export OPENAI_BASE_URL="https://endpoint.some_other_provider.com/v1" # config this if you want to use a different endpoint
export MIDSCENE_MODEL_NAME="gpt-4o-2024-11-20" # optional, the default is "gpt-4o"
```

## Example: Using `qwen-vl-max-latest` from Aliyun

Configure the environment variables:

```bash
export OPENAI_API_KEY="sk-..."
export OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
export MIDSCENE_MODEL_NAME="qwen-vl-max-latest"
export MIDSCENE_USE_QWEN_VL=1
```

## Example: Using `ui-tars-72b-sft` hosted by yourself

Configure the environment variables:

```bash
export OPENAI_API_KEY="sk-..."
export OPENAI_BASE_URL="http://localhost:1234/v1"
export MIDSCENE_MODEL_NAME="ui-tars-72b-sft"
export MIDSCENE_USE_VLM_UI_TARS=1
```

## Example: Config `claude-3-opus-20240229` from Anthropic

When configuring `MIDSCENE_USE_ANTHROPIC_SDK=1`, Midscene will use Anthropic SDK (`@anthropic-ai/sdk`) to call the model.

Configure the environment variables:

```bash
export MIDSCENE_USE_ANTHROPIC_SDK=1
export ANTHROPIC_API_KEY="....."
export MIDSCENE_MODEL_NAME="claude-3-opus-20240229"
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