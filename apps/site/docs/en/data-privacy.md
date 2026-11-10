# Data privacy

⁠Midscene.js is an open-source project (GitHub: [Midscene](https://github.com/web-infra-dev/midscene/)) under the MIT license. You can see all the codes in the public repository.

By default, Midscene saves reports and logs on the machine running the task, under `midscene_run/report` and `midscene_run/log`. The Midscene project does not collect your screenshots, API keys, or access tokens through the SDK. During AI steps, the SDK sends the required screenshots, prompts, and page context directly to the model service you configure. That service’s privacy policy governs how it stores and uses this data.

Reports and logs may contain plaintext tokens, cookies, model inputs and outputs, or personal information visible in screenshots. Manage access and retention, and remove sensitive content before sharing. In CI, console logs and uploaded artifacts may also be visible to people with access to the job.

If you prefer building Midscene.js and its Chrome Extension in your own environment instead of using the published versions, you can refer to the [Contributing Guide](https://github.com/web-infra-dev/midscene/blob/main/CONTRIBUTING.md) to find building instructions.
