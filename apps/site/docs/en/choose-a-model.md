# Choose a Model for Midscene.js

In this article, we will talk about how to choose a model for Midscene.js.

If you want to see the detailed configuration of model and provider, see [Config Model and Provider](./model-provider).

:::info TLDR
Midscene.js uses general-purpose large language models (LLMs, like `gpt-4o`) as the default model. This is the easiest way to get started.

You can also use open-source models like `UI-TARS` to improve the performance and data privacy.
:::

## Comparison between general-purpose LLMs and dedicated model

This is a table for comparison between general-purpose LLMs and dedicated model (like `UI-TARS`). We will talk about them in detail later.

| | General-purpose LLMs (default) | Dedicated model like `UI-TARS` |
| --- | --- | --- | 
| **What it is** | for general-purpose tasks | dedicated for UI automation |
| **How to get started** | easy, just to get an API key | a bit complex, you need to deploy it on your own server |
| **Performance** | 3-10x slower compared to pure JavaScript automation | could be acceptable with proper deployment |
| **Who will get the page data** | the model provider | your own server |
| **Cost** | more expensive, usually pay for the token | less expensive, pay for the server |
| **Prompting** | prefer step-by-step instructions | still prefer step-by-step instructions, but performs better in uncertainty situations |

## Choose a general-purpose LLM

Midscene uses OpenAI `gpt-4o` as the default model, since this model performs the best among all general-purpose LLMs at this moment.

To use the official `gpt-4o` from OpenAI, you can simply set the `OPENAI_API_KEY` in the environment variables. Refer to [Config Model and Provider](./model-provider) for more details.

### Choose a model other than `gpt-4o`

If you want to use other models, please follow these steps:

1. A multimodal model is required, which means it must support image input.
1. The larger the model, the better it works. However, it is also more expensive.
1. Find out how to to call it with an OpenAI SDK compatible endpoint. Usually you should set the `OPENAI_BASE_URL`, `OPENAI_API_KEY` and `MIDSCENE_MODEL_NAME`. Config are described in [Config Model and Provider](./model-provider).
1. If you find it not working well after changing the model, you can try using some short and clear prompt, or roll back to the previous model. See more details in [Prompting Tips](./prompting-tips).
1. Remember to follow the terms of use of each model and provider.

### Known supported general-purpose models

Besides `gpt-4o`, the known supported models are:

- `claude-3-opus-20240229`
- `gemini-1.5-pro`
- `qwen-vl-max-latest`
- `doubao-vision-pro-32k`

### About the token cost

Image resolution and element numbers (i.e., a UI context size created by Midscene) will affect the token bill.

Here are some typical data with gpt-4o-0806 without prompt caching.

|Task | Resolution | Prompt Tokens / Price | Completion Tokens / Price | Total Cost |
|-----|------------|--------------|---------------|-----------------|
|Plan and perform a search on eBay homepage| 1280x800 | 6005 / $0.0150125 |146 / $0.00146| $0.0164725 |
|Query the information about the item in the search results| 1280x800 | 9107 / $0.0227675 | 122 / $0.00122 | $0.0239875 |

> The price data was calculated in Nov 2024.

## Choose `UI-TARS` (a open-source model dedicated for UI automation)

UI-TARS is an end-to-end GUI agent model based on VLM architecture. It solely perceives screenshots as input and performs human-like interactions (e.g., keyboard and mouse operations), achieving state-of-the-art performance on 10+ GUI benchmarks.

UI-TARS is an open-source model, and provides different versions of size. You can deploy it on your own server, and it will dramatically improve the performance and data privacy.

For more details about UI-TARS, see
* [Github - UI-TARS](https://github.com/bytedance/ui-tars)
* [🤗 HuggingFace - UI-TARS-7B-SFT](https://huggingface.co/bytedance-research/UI-TARS-7B-SFT)
* [UI-TARS - Model Deployment Guide](https://juniper-switch-f10.notion.site/UI-TARS-Model-Deployment-Guide-17b5350241e280058e98cea60317de71)

### What you will have after using UI-TARS

- **Speed**: a private-deployed UI-TARS model can be 5x faster than a general-purpose LLM. Each step of `.ai` call can be processed in 1-2 seconds.
- **Data privacy**: you can deploy it on your own server and your data will no longer be sent to the cloud.
- **More stable with short prompt**: ⁠UI-TARS is optimized for UI automation and is capable of handling more complex tasks with target-driven prompts. You can use it with a shorter prompt (although it is not recommended), and it performs even better when compared to a general-purpose LLM.

### Config to use UI-TARS

The output of `UI-TARS` is different from the general-purpose LLMs. Some extra work is needed to adapt it. You should append the following config to enable this feature.

```bash
MIDSCENE_USE_VLM_UI_TARS=1
```

## Under the hood

### How Midscene.js works with general LLMs

General LLMs can 'see' the screenshot, but they cannot provide the coordinates of the elements. To do automation tasks, we need to take extra steps to extract the elements' information and send it along with the screenshot to the LLMs. When LLMs return the id of the element, we will map it back to the coordinates and control them.

This approach works in most cases, but it results in increased latency and costs. Additionally, we cannot extract contents in `<iframe />` or `<canvas />` tags.

### How Midscene.js works with `UI-TARS`

`UI-TARS` is a model dedicated to UI automation. We only need to send the screenshot and the instructions, and it will return the actions and the coordinates to be performed. 

This is more straightforward in agent design. Furthermore, the performance of self-hosted `UI-TARS` model is truly amazing. So we are very to happy to integrate it into Midscene.js as an alternative approach.

## Which one should I get started with?

Use general-purpose LLMs first, this is the easiest way to get started.

Once you feel uncomfortable with the speed, the cost, the accuracy, or the data privacy, you can try `UI-TARS` model. You will surely know when to start (or not to start) after using general-purpose LLMs.

## More

* [Config Model and Provider](./model-provider)
* [UI-TARS on Github](https://github.com/bytedance/ui-tars)
