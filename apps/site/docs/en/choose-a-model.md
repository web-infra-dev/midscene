# Choose a Model for Midscene.js

In this article, we will talk about how to choose a model for Midscene.js. All of these models configs are both supported in Chrome extension and SDK.

If you want to see the detailed configuration of model services, see [Config Model and Provider](./model-provider).

:::info TLDR
GPT-4o, Qwen-2.5-VL, and UI-TARS are the most recommended models for Midscene.js. Choose the one that is easiest to obtain and use. You can also use other models, but you need to follow the steps in the article.
:::

## The recommended models

GPT-4o, Qwen-2.5-VL, and UI-TARS are the most recommended models for Midscene.js.

### GPT-4o

GPT-4o is a general-purpose LLM by OpenAI, which supports image input. This is the default model for Midscene.js. When using GPT-4o, a step-by-step prompting is preferred.

**Features**

- **Easy to achieve**: you can get the stable API service from many providers and just pay for the token.
- **Performing steadily**: it performs well on interaction, assertion, and query.

**Limitations**

- **High token cost**: dom tree and screenshot will be sent together to the model. For example, it will use 6k input tokens for ebay homepage under 1280x800 resolution, and 9k for search result page. As a result, the cost will be higher than other models. And it will also take longer time to generate the response.
- **Content limitation**: it will not work if the target element is inside a cross-origin `<iframe />` or `<canvas />`.
- **Low resolution support**: the upper limit of the resolution is 2048 x 768. For images larger than this, the output quality will be lower.
- **Not good at small icon recognition**: it may not work well if the target element is a small icon.

**Config**

```bash
OPENAI_API_KEY="......"
OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1" # optional, if you want an endpoint other than the default one from OpenAI.
MIDSCENE_MODEL_NAME="gpt-4o-2024-11-20" # optional. The default is "gpt-4o".
```

### Qwen 2.5 VL

From 0.12.0 version, Midscene.js supports Qwen 2.5 VL model.

Qwen 2.5 VL is a dedicated model for image recognition. It is an open-source model published by Alibaba. In most of the cases, it performs as good as (or sometimes better than) GPT-4o. We recommend using the largest version (72B) for reliable output.

Qwen 2.5 VL indeed has an action planning feature to control the application, but we still recommend using detailed prompts to provide a more stable and reliable result.

**Features**

- **Low cost**: the model can accurately tell the exact coordinates of target elements on the page, so we don't have to send the DOM tree to the model. You will achieve a token saving of 30% to 50% compared to GPT-4o.
- **Higher resolution support**: Qwen 2.5 VL supports higher resolution input than GPT-4o. It's enough for most of the cases.
- **Open-source**: this is an open-source model, so you can both use the API already deployed by cloud providers or deploy it on your own server.

**Limitations**

- **Not good at small icon recognition**: like GPT-4o, it may be hard to describe the target element if it's a very small icon.
- **Perform not that good on assertion**: it may not work as well as GPT-4o on assertion. 
- **Cache is not applicable**: the cache feature of Midscene.js is not applicable for Qwen 2.5 VL at this moment.
**Config**

Except for the regular config, you need to include the `MIDSCENE_USE_QWEN_VL=1` config to turn on Qwen 2.5 VL mode. Otherwise, it will be the default GPT-4o mode (much more tokens used).

```bash
OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1" # or any endpoint from other providers.
OPENAI_API_KEY="......"
MIDSCENE_MODEL_NAME="qwen-vl-max-latest" # use this for Aliyun service
MIDSCENE_USE_QWEN_VL=1 # remember to include this for Qwen 2.5 mode
```

**Note about the model name on Aliyun.com**

⁠While the open-source version of Qwen 2.5 VL (72B) is named `qwen2.5-vl-72b-instruct`, there is also an enhanced and more stable version named `qwen-vl-max-latest` officially hosted on Aliyun.com. When using the `qwen-vl-max-latest` model on Aliyun, you will get larger context support and a much lower price (likely only 19% of the open-source version).

In short, if you want to use the Aliyun service, use `qwen-vl-max-latest`.

**Links**
- [Qwen 2.5 on 🤗 HuggingFace](https://huggingface.co/Qwen/Qwen2.5-VL-72B-Instruct)
- [Qwen 2.5 on Github](https://github.com/QwenLM/Qwen2.5-VL)
- [Qwen 2.5 on Aliyun](https://bailian.console.aliyun.com/#/model-market/detail/qwen-vl-max-latest)

### UI-TARS

UI-TARS is an end-to-end GUI agent model based on VLM architecture. It solely perceives screenshots as input and performs human-like interactions (e.g., keyboard and mouse operations), achieving state-of-the-art performance on 10+ GUI benchmarks. UI-TARS is an open-source model, and provides different versions of size. 

When using UI-TARS, you can use target-driven style prompts, like "Login with user name foo and password bar", and it will plan the steps to achieve the goal.

**Features**

- **Speed**: a private-deployed UI-TARS model can be 5x faster than GPT-4o. Each step of `.ai` call can be processed in 1-2 seconds on a high-performance GPU server.
- **Native image recognition**: Like Qwen 2.5 VL, UI-TARS can recognize the image directly from the screenshot, so Midscene.js does not need to extract the dom tree.
- **Open-source**: you can deploy it on your own server and your data will no longer be sent to the cloud.
- **More stable with short prompt**: ⁠UI-TARS is optimized for UI automation and is capable of handling more complex tasks with target-driven prompts. It performs better than GPT-4o and Qwen 2.5 VL on short prompts.

**Limitations**

- **Perform not good on assertion**: it may not work as well as GPT-4o and Qwen 2.5 on assertion and query.

**Config**

Except for the regular config, you need to include the `MIDSCENE_USE_VLM_UI_TARS=1` config to turn on UI-TARS mode. Otherwise, you will get some JSON parsing error.

```bash
OPENAI_BASE_URL="....."
OPENAI_API_KEY="......" 
MIDSCENE_MODEL_NAME="ui-tars-72b-sft"
MIDSCENE_USE_VLM_UI_TARS=1 # remember to include this for UI-TARS mode !
```

Links:
- [UI-TARS on 🤗 HuggingFace](https://huggingface.co/bytedance-research/UI-TARS-72B-SFT)
- [UI-TARS on Github](https://github.com/bytedance/ui-tars)
- [UI-TARS - Model Deployment Guide](https://juniper-switch-f10.notion.site/UI-TARS-Model-Deployment-Guide-17b5350241e280058e98cea60317de71)

:::info Which model should I choose to get started?
Just use the one that is easiest to obtain and get started. After writing your own scripts, you can try other models to see if they meet your specific needs.
:::


## Choose other general-purpose LLMs

Other models are also supported by Midscene.js. Midscene will use the same prompt and strategy as GPT-4o for these models. If you want to use other models, please follow these steps:

1. A multimodal model is required, which means it must support image input.
1. The larger the model, the better it works. However, it needs more GPU or money.
1. Find out how to to call it with an OpenAI SDK compatible endpoint. Usually you should set the `OPENAI_BASE_URL`, `OPENAI_API_KEY` and `MIDSCENE_MODEL_NAME`. Config are described in [Config Model and Provider](./model-provider).
1. If you find it not working well after changing the model, you can try using some short and clear prompt, or roll back to the previous model. See more details in [Prompting Tips](./prompting-tips).
1. Remember to follow the terms of use of each model and provider.
1. Don't include the `MIDSCENE_USE_VLM_UI_TARS` and `MIDSCENE_USE_QWEN_VL` config unless you know what you are doing.

### Known supported general-purpose models

These models are known to be supported by Midscene.js. They may perform differently in different cases.

- `claude-3-opus-20240229`
- `gemini-1.5-pro`
- `qwen-vl-max-latest`
- `doubao-vision-pro-32k`

### Config

```bash
MIDSCENE_MODEL_NAME="....."
OPENAI_BASE_URL="......"
OPENAI_API_KEY="......"
```

For more details and sample config, see [Config Model and Provider](./model-provider).

## FAQ

### How can i check the model's token usage?

By setting `MIDSCENE_DEBUG_AI_PROFILE=1` in the environment variables, you can print the model's usage info and response time.

## More

* [Config Model and Provider](./model-provider)
* [Prompting Tips](./prompting-tips)
